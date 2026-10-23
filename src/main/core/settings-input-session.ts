import { hostText } from '../../shared/i18n';
import { randomUUID } from 'node:crypto';
import type { ExtensionSnapshot, Settings, SettingsSnapshot } from '../../shared/contracts';
import type { SettingsEditRequest, SettingsInputState } from '../../shared/settings-editing';
import { parseSettings } from '../../shared/settings-schema';
import { validateAppletSettings } from '../../shared/setting-definitions';
import {
  settingsCatalog,
  settingsProjection,
  settingsJsonProjection,
  applySettingsJson,
} from '../../shared/settings-catalog';
import { mergeSettingsInput } from '../../shared/settings-input';
import { sameSetting } from '../../shared/settings-defaults';
import { restoreSettingsCollections } from '../../shared/settings-storage';
/** Coordinates scoped immediate writes; incomplete inputs belong to the rendering UI. */
export class SettingsInputSession {
  private state: Omit<SettingsInputState, 'value'>;
  private operations = new Map<string, Promise<SettingsInputState>>();
  constructor(
    private options: {
      current(): SettingsSnapshot;
      initialPageId?: string;
      scope?(page: import('../../shared/settings-catalog').SettingsPageDefinition): string;
      applets(): ExtensionSnapshot[];
      save(
        value: Settings,
        revision: number,
        resetPage?: import('../../shared/settings-catalog').SettingsPageDefinition,
        source?: 'form' | 'json',
      ): Promise<SettingsSnapshot>;
      changed(): void;
    },
  ) {
    this.state = {
      sessionId: randomUUID(),
      editRevision: 0,
      revision: options.current().revision,
      mode: 'form',
      pending: false,
      pageId: options.initialPageId ?? 'appearance',
    };
  }
  private notify() {
    this.state.editRevision++;
    this.options.changed();
  }
  synchronize() {
    const revision = this.options.current().revision;
    if (!this.state.pending && this.state.revision !== revision) {
      this.state.revision = revision;
      this.notify();
    }
  }
  snapshot(): SettingsInputState {
    this.synchronize();
    return { ...this.state, value: this.value };
  }
  get value() {
    return structuredClone(this.options.current().value);
  }
  catalog() {
    return settingsCatalog(this.options.applets(), this.value);
  }
  page(id = this.state.pageId) {
    const page = this.catalog().find((p) => p.id === id);
    if (!page) throw Error(hostText('settings.inputError.missing'));
    return page;
  }
  projection(id = this.state.pageId) {
    return settingsProjection(this.value, this.page(id), this.options.applets());
  }
  jsonProjection(id = this.state.pageId) {
    return settingsJsonProjection(this.value, this.page(id), this.options.applets());
  }
  async act(request: SettingsEditRequest): Promise<SettingsInputState> {
    if (
      !request ||
      request.sessionId !== this.state.sessionId ||
      typeof request.operationId !== 'string' ||
      !request.operationId ||
      request.operationId.length > 100
    )
      throw Error(hostText('settings.inputError.stale'));
    const existing = this.operations.get(request.operationId);
    if (existing) return existing;
    this.synchronize();
    if (request.editRevision !== this.state.editRevision)
      throw Error(hostText('settings.inputError.conflict'));
    if (this.state.pending) throw Error(hostText('settings.inputError.pending'));
    const result = this.perform(request.action);
    this.operations.set(request.operationId, result);
    while (this.operations.size > 512) this.operations.delete(this.operations.keys().next().value!);
    return result;
  }
  private async save(value: Settings, force = false) {
    const parsed = restoreSettingsCollections(parseSettings(value), this.options.applets());
    validateAppletSettings(parsed, this.options.applets());
    if (!force && JSON.stringify(parsed) === JSON.stringify(this.value)) return;
    const revision = this.options.current().revision;
    this.state.pending = true;
    this.notify();
    try {
      await this.options.save(parsed, revision, force ? this.page() : undefined, this.state.mode);
    } finally {
      this.state.pending = false;
      this.state.revision = this.options.current().revision;
      this.notify();
    }
  }
  private async perform(action: SettingsEditRequest['action']) {
    switch (action.type) {
      case 'select-page':
        this.page(action.pageId);
        if (action.pageId !== this.state.pageId) {
          this.state.pageId = action.pageId;
          this.state.mode = 'form';
        }
        break;
      case 'mode':
        if (!['form', 'json'].includes(action.value))
          throw Error(hostText('settings.inputError.mode'));
        this.state.mode = action.value;
        break;
      case 'reload':
        break;
      case 'reset-page': {
        if (
          action.pageId !== this.state.pageId ||
          action.revision !== this.options.current().revision ||
          action.storageScope !== this.options.scope?.(this.page()) ||
          !sameSetting(action.before, this.jsonProjection())
        )
          throw Error(hostText('settings.inputError.confirmationChanged'));
        await this.save(
          applySettingsJson(this.value, this.page(), this.options.applets(), '{}'),
          true,
        );
        break;
      }
      case 'page-values':
      case 'partial-text': {
        if (
          action.storageScope !== undefined &&
          action.storageScope !== this.options.scope?.(this.page())
        )
          throw Error(hostText('settings.inputError.storageChanged'));
        if (
          action.pageId !== this.state.pageId ||
          this.state.mode !== (action.type === 'partial-text' ? 'json' : 'form')
        )
          throw Error(hostText('settings.inputError.pageChanged'));
        let value: Record<string, unknown>;
        if (action.type === 'partial-text') {
          if (
            typeof action.value !== 'string' ||
            new TextEncoder().encode(action.value).length > 1024 * 1024
          )
            throw Error(hostText('settings.inputError.jsonSize'));
          try {
            value = JSON.parse(action.value);
          } catch {
            throw Error(hostText('settings.inputError.jsonSyntax'));
          }
        } else value = action.value;
        const projection = mergeSettingsInput(
          action.before,
          value,
          action.type === 'partial-text' ? this.jsonProjection() : this.projection(),
        );
        await this.save(
          applySettingsJson(
            this.value,
            this.page(),
            this.options.applets(),
            JSON.stringify(projection),
          ),
        );
        break;
      }
      case 'values':
        await this.save(mergeSettingsInput(action.before, action.value, this.value));
        break;
      default:
        throw Error(hostText('settings.inputError.invalidOperation'));
    }
    this.notify();
    return this.snapshot();
  }
}
