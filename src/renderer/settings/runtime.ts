import type { Settings } from '../../shared/contracts';
import type {
  SettingsPageModel,
  SettingsPageOperation,
  SettingsPageApi,
} from '../../shared/settings-page';
import { createDefaultSettings } from '../../shared/settings-schema';
import { settingsProjection } from '../../shared/settings-catalog';
import type { SettingsControlsApi } from '../settings-ui/api';
/** Values absent from this page are local defaults, never another page's value. */
export function materialize(model: SettingsPageModel): Settings {
  const merge = (base: any, value: any): any => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return structuredClone(value);
    const result = { ...base };
    for (const [key, part] of Object.entries(value))
      if (!['__proto__', 'prototype', 'constructor'].includes(key))
        result[key] = merge(result[key], part);
    return result;
  };
  return merge(createDefaultSettings(), model.content.values);
}
export class SettingsViewClient {
  model?: SettingsPageModel;
  private queued = 0;
  private chain = Promise.resolve();
  private listeners = new Set<() => void>();
  private input?: { pageId: string; values?: Record<string, unknown>; text?: string };
  private inputVersion = 0;
  private ownRevision = -1;
  private display(m: SettingsPageModel) {
    return this.input?.pageId === m.content.page.id && this.input.values
      ? { ...m, content: { ...m.content, values: this.input.values } }
      : m;
  }
  text(m: SettingsPageModel) {
    return this.input?.pageId === m.content.page.id && this.input.text !== undefined
      ? this.input.text
      : JSON.stringify(m.content.values, null, 2);
  }
  setText(value: string) {
    const m = this.model!;
    const before = m.content.values;
    this.input = { pageId: m.content.page.id, text: value };
    this.inputVersion++;
    this.render(this.display(m));
    void this.act({
      kind: 'edit',
      action: { type: 'partial-text', pageId: m.content.page.id, before, value },
    }).catch(() => {});
  }
  constructor(
    private render: (model: SettingsPageModel) => void,
    private failed: (text: string) => void,
    private transport: Pick<SettingsPageApi, 'get' | 'act'>,
    private connectionId: string,
  ) {}
  flush = () => this.chain;
  accept(next: unknown) {
    const m = next as SettingsPageModel;
    if (m?.kind !== 'settings' || (this.model?.id === m.id && this.model.revision >= m.revision))
      return;
    this.model = m;
    if (!this.queued) this.render(this.display(m));
    for (const fn of this.listeners) fn();
  }
  act(operation: SettingsPageOperation): Promise<any> {
    if (
      operation.kind === 'edit' &&
      ['page-values', 'partial-text'].includes(operation.action.type)
    )
      operation = {
        ...operation,
        action: {
          ...operation.action,
          storageScope: this.model?.content.auxiliary.storage?.signature,
        },
      } as SettingsPageOperation;
    if (
      operation.kind === 'select' ||
      operation.kind === 'move' ||
      (operation.kind === 'edit' && ['mode', 'reload'].includes(operation.action.type))
    ) {
      this.input = undefined;
      this.inputVersion++;
    }
    const version = this.inputVersion;
    this.queued++;
    const work = this.chain.then(async () => {
      this.accept(await this.transport.get(this.connectionId));
      const m = this.model!;
      const inputOperation =
        operation.kind === 'edit' &&
        ['page-values', 'partial-text'].includes(operation.action.type);
      if (
        operation.kind === 'edit' &&
        inputOperation &&
        this.ownRevision === m.content.editing.editRevision
      )
        operation = {
          ...operation,
          action: { ...operation.action, before: m.content.values },
        } as SettingsPageOperation;
      const response = (await this.transport.act(this.connectionId, {
        id: m.id,
        type: 'settings',
        sessionId: m.content.editing.sessionId,
        editRevision: m.content.editing.editRevision,
        operationId: crypto.randomUUID(),
        operation,
      })) as { model: SettingsPageModel; result: unknown };
      this.accept(response.model);
      if (inputOperation) {
        this.ownRevision = response.model.content.editing.editRevision;
        if (version === this.inputVersion) this.input = undefined;
      }
      this.failed('');
      return response.result;
    });
    this.chain = work
      .then(
        () => {},
        async (e) => {
          this.failed(String(e));
          try {
            this.accept(await this.transport.get(this.connectionId));
          } catch {}
        },
      )
      .finally(() => {
        this.queued--;
        if (!this.queued && this.model) this.render(this.display(this.model));
      });
    return work;
  }
  invoke = (name: string, args: unknown[] = []): Promise<any> => {
    const pageId = this.model?.content.page.id;
    const storageSignature = this.model?.content.auxiliary.storage?.signature;
    // Long operations (palette, updates) must not hold the input queue or their cancel action.
    return this.chain.then(async () => {
      this.accept(await this.transport.get(this.connectionId));
      const m = this.model!;
      const id = m.content.actions[name];
      if (!id || m.content.page.id !== pageId) throw Error('この設定では利用できない操作です。');
      if (name === 'set-local-settings' || name === 'open-settings') {
        if (m.content.auxiliary.storage?.signature !== storageSignature)
          throw Error('設定の保存先が変わりました。再取得してください。');
        if (name === 'set-local-settings' && this.input)
          throw Error('入力のエラーを修正するか、設定を再読み込みしてから切り替えてください。');
        args = [...args, m.content.auxiliary.storage?.revision];
      }
      const response = (await this.transport.act(this.connectionId, {
        id: m.id,
        type: 'settings',
        sessionId: m.content.editing.sessionId,
        editRevision: m.content.editing.editRevision,
        operationId: crypto.randomUUID(),
        operation: { kind: 'invoke', actionId: id, args },
      })) as { model: SettingsPageModel; result: unknown };
      this.accept(response.model);
      this.failed('');
      return response.result;
    });
  };
  editor(model: SettingsPageModel) {
    const ignore = (p: Promise<unknown>) => void p.catch(() => {});
    return {
      value: materialize(this.display(model)),
      edit: (value: Settings) => {
        const values = settingsProjection(
          value,
          model.content.page,
          model.content.auxiliary.applets ?? [],
        );
        const before = this.model!.content.values;
        this.input = { pageId: model.content.page.id, values };
        this.inputVersion++;
        this.render(this.display(model));
        ignore(
          this.act({
            kind: 'edit',
            action: { type: 'page-values', pageId: model.content.page.id, before, value: values },
          }),
        );
      },
    };
  }
  controls(): SettingsControlsApi {
    const invoke = this.invoke;
    return {
      snapshot: async () => ({
        updates: this.model?.content.auxiliary.updates ?? { busy: false, phase: '', results: [] },
      }),
      onChanged: (callback) => {
        this.listeners.add(callback);
        return () => {
          this.listeners.delete(callback);
        };
      },
      checkUpdates: (id) => invoke('checkUpdates', [id]),
      checkAllUpdates: () => invoke('checkAllUpdates'),
      installUpdates: (id) => invoke('installUpdates', [id]),
      cancelUpdates: () => invoke('cancelUpdates'),
      openReleases: (id) => invoke('openReleases', [id]),
      setShortcutRecording: (value) => invoke('setShortcutRecording', [value]),
      setShortcutCapture: (value) => invoke('setShortcutCapture', [value]),
      onShortcutCaptured: (callback) => {
        let sequence = 0;
        const listener = () => {
          const event = this.model?.content.auxiliary.shortcutCapture;
          if (event && event.sequence > sequence) {
            sequence = event.sequence;
            callback(event);
          }
        };
        this.listeners.add(listener);
        return () => {
          this.listeners.delete(listener);
        };
      },
      retryGlobalHotKeys: () => invoke('retryGlobalHotKeys'),
      openCommandPalette: (request) => invoke('openCommandPalette', [request]),
      cancelCommandPalette: (id) => invoke('cancelCommandPalette', [id]),
      createWebAccount: (name) => invoke('createWebAccount', [name]),
      renameWebAccount: (id, name) => invoke('renameWebAccount', [id, name]),
      deleteWebAccount: (id) => invoke('deleteWebAccount', [id]),
      clearWebAccount: (id) => invoke('clearWebAccount', [id]),

      chooseDirectory: () => invoke('chooseDirectory'),
      setAppletApiPermissions: (value) => invoke('setAppletApiPermissions', [value]),
      automation: (value) => invoke('automation', [value]),
      executeCommand: (id) => invoke(`settingAction:${id}`),
    };
  }
}
