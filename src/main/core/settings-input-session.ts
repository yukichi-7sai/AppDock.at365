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
  resetSettingsPage,
  type SettingsPageDefinition,
  type SettingsResetScope,
} from '../../shared/settings-catalog';
import { mergeSettingsInput } from '../../shared/settings-input';
import { sameSetting } from '../../shared/settings-defaults';
import { restoreSettingsCollections } from '../../shared/settings-storage';
/** Coordinates scoped immediate writes; incomplete inputs belong to the rendering UI. */
const emptyCommandReferences: import('../../shared/command-text').CommandReference[] = [];
export class SettingsInputSession {
  private state: Omit<SettingsInputState, 'value'>;
  private operations = new Map<string, Promise<SettingsInputState>>();
  private reading?: {
    current: Pick<SettingsSnapshot, 'value' | 'revision'>;
    applets: ExtensionSnapshot[];
    definitions?: string;
    catalog?: SettingsPageDefinition[];
  };
  private catalogCache?: {
    key: string;
    references: import('../../shared/command-text').CommandReference[];
    pages: SettingsPageDefinition[];
  };
  private projectionCache?: {
    key: string;
    current: Settings;
    revision: number;
    values?: Record<string, unknown>;
    json?: Record<string, unknown>;
  };
  constructor(
    private options: {
      current(): Pick<SettingsSnapshot, 'value' | 'revision'>;
      initialPageId?: string;
      scope?(page: import('../../shared/settings-catalog').SettingsPageDefinition): string;
      applets(): ExtensionSnapshot[];
      commands?(): import('../../shared/command-text').CommandReference[];
      save(
        value: Settings,
        revision: number,
        resetPage?: import('../../shared/settings-catalog').SettingsPageDefinition,
        source?: 'form' | 'json',
        resetScope?: SettingsResetScope,
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
  metadata(): Omit<SettingsInputState, 'value'> {
    this.synchronize();
    return { ...this.state };
  }
  snapshot(): SettingsInputState {
    return { ...this.metadata(), value: this.value };
  }
  get value() {
    return structuredClone(this.options.current().value);
  }
  /** The caller must finish this read synchronously; writes retain the normal live path. */
  read<T>(action: () => T): T {
    if (this.reading) return action();
    this.reading = { current: this.options.current(), applets: this.options.applets() };
    try {
      return action();
    } finally {
      this.reading = undefined;
    }
  }
  definitionsKey(): string {
    return this.read(() => {
      const source = this.reading!;
      return (source.definitions ??= JSON.stringify([
        source.current.value.host.language,
        source.current.value.appletOrder,
        source.applets.map(
          ({
            commands,
            tray,
            panel,
            settingOptions,
            startupTiming,
            error,
            state,
            enabled,
            scheduledStartAt,
            ...definition
          }) => definition,
        ),
      ]));
    });
  }
  catalog() {
    return this.read(() => {
      const source = this.reading!;
      if (source.catalog) return source.catalog;
      const references = this.definitionsKey().includes('[command:')
        ? (this.options.commands?.() ?? emptyCommandReferences)
        : emptyCommandReferences;
      const key = JSON.stringify([
        this.definitionsKey(),
        source.applets.map((applet) => [applet.enabled, applet.state]),
      ]);
      if (key !== this.catalogCache?.key || references !== this.catalogCache.references)
        this.catalogCache = {
          key,
          references,
          pages: settingsCatalog(source.applets, source.current.value, references),
        };
      return (source.catalog = this.catalogCache!.pages);
    });
  }
  page(id = this.state.pageId) {
    const page = this.catalog().find((p) => p.id === id);
    if (!page) throw Error(hostText('settings.inputError.missing'));
    return page;
  }
  projection(id = this.state.pageId) {
    return this.project(id, 'values');
  }
  jsonProjection(id = this.state.pageId) {
    return this.project(id, 'json');
  }
  private project(id: string, kind: 'values' | 'json') {
    return this.read(() => {
      const source = this.reading!,
        page = this.page(id);
      const key = JSON.stringify([id, this.definitionsKey()]);
      if (
        key !== this.projectionCache?.key ||
        source.current.value !== this.projectionCache.current ||
        source.current.revision !== this.projectionCache.revision
      )
        this.projectionCache = {
          key,
          current: source.current.value,
          revision: source.current.revision,
        };
      const cache = this.projectionCache!;
      cache[kind] ??= (kind === 'values' ? settingsProjection : settingsJsonProjection)(
        source.current.value,
        page,
        source.applets,
      );
      return structuredClone(cache[kind]!);
    });
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
  private async save(value: Settings, resetScope?: SettingsResetScope) {
    const parsed = restoreSettingsCollections(parseSettings(value), this.options.applets());
    validateAppletSettings(parsed, this.options.applets());
    if (!resetScope && JSON.stringify(parsed) === JSON.stringify(this.value)) return;
    const revision = this.options.current().revision;
    this.state.pending = true;
    this.notify();
    try {
      await this.options.save(
        parsed,
        revision,
        resetScope ? this.page() : undefined,
        this.state.mode,
        resetScope,
      );
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
        const scope = action.scope === undefined ? 'page' : action.scope;
        await this.save(
          resetSettingsPage(this.value, this.page(), this.options.applets(), scope),
          scope,
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
          if (typeof action.value !== 'string')
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
