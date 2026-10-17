import { randomUUID } from 'node:crypto';
import type { ExtensionSnapshot, Settings, SettingsSnapshot } from '../../shared/contracts';
import type { SettingsEditRequest, SettingsInputState } from '../../shared/settings-editing';
import { parseSettings } from '../../shared/settings-schema';
import { validateAppletSettings } from '../../shared/setting-definitions';
import {
  settingsCatalog,
  settingsProjection,
  applySettingsJson,
} from '../../shared/settings-catalog';
import { mergeSettingsInput } from '../../shared/settings-input';
/** Coordinates scoped immediate writes; incomplete inputs belong to the rendering UI. */
export class SettingsInputSession {
  private state: Omit<SettingsInputState, 'value'>;
  private operations = new Map<string, Promise<SettingsInputState>>();
  constructor(
    private options: {
      current(): SettingsSnapshot;
      scope?(page: import('../../shared/settings-catalog').SettingsPageDefinition): string;
      applets(): ExtensionSnapshot[];
      save(
        value: Settings,
        revision: number,
        avatar?: Uint8Array | null,
        name?: string,
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
      pageId: 'appearance',
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
    if (!page) throw Error('設定対象が見つかりません。');
    return page;
  }
  projection(id = this.state.pageId) {
    return settingsProjection(this.value, this.page(id), this.options.applets());
  }
  async act(request: SettingsEditRequest): Promise<SettingsInputState> {
    if (
      !request ||
      request.sessionId !== this.state.sessionId ||
      typeof request.operationId !== 'string' ||
      !request.operationId ||
      request.operationId.length > 100
    )
      throw Error('編集セッションが古くなっています。再取得してください。');
    const existing = this.operations.get(request.operationId);
    if (existing) return existing;
    this.synchronize();
    if (request.editRevision !== this.state.editRevision)
      throw Error('設定が別の画面で変わりました。再取得して入力し直してください。');
    if (this.state.pending) throw Error('設定操作の完了を待ってください。');
    const result = this.perform(request.action);
    this.operations.set(request.operationId, result);
    while (this.operations.size > 512) this.operations.delete(this.operations.keys().next().value!);
    return result;
  }
  private async save(value: Settings, avatar?: Uint8Array | null, name?: string) {
    const parsed = parseSettings(value);
    validateAppletSettings(parsed, this.options.applets());
    if (avatar === undefined && JSON.stringify(parsed) === JSON.stringify(this.value)) return;
    const revision = this.options.current().revision;
    this.state.pending = true;
    this.notify();
    try {
      await this.options.save(parsed, revision, avatar, name);
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
        if (!['form', 'json'].includes(action.value)) throw Error('表示方法が不正です。');
        this.state.mode = action.value;
        break;
      case 'reload':
        break;
      case 'page-values':
      case 'partial-text': {
        if (
          action.storageScope !== undefined &&
          action.storageScope !== this.options.scope?.(this.page())
        )
          throw Error('設定の保存先が変わりました。再読み込みして入力し直してください。');
        if (
          action.pageId !== this.state.pageId ||
          this.state.mode !== (action.type === 'partial-text' ? 'json' : 'form')
        )
          throw Error('表示中の設定ページが変わりました。');
        let value: Record<string, unknown>;
        if (action.type === 'partial-text') {
          if (
            typeof action.value !== 'string' ||
            new TextEncoder().encode(action.value).length > 1024 * 1024
          )
            throw Error('JSONは1MB以下にしてください。');
          try {
            value = JSON.parse(action.value);
          } catch {
            throw Error('JSONの内容を修正してください。');
          }
        } else value = action.value;
        const projection = mergeSettingsInput(action.before, value, this.projection());
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
      case 'avatar':
        if (this.state.pageId !== 'profile') throw Error('画像はプロフィールで選択してください。');
        if (
          action.bytes !== null &&
          (!(action.bytes instanceof Uint8Array) || action.bytes.length > 5 * 1024 * 1024)
        )
          throw Error('画像は5MB以下にしてください。');
        await this.save(this.value, action.bytes, action.name);
        break;
      default:
        throw Error('設定操作が不正です。');
    }
    this.notify();
    return this.snapshot();
  }
}
