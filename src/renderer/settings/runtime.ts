import { hostText } from '../../shared/i18n';
import type { Settings } from '../../shared/contracts';
import type {
  SettingsPageModel,
  SettingsPageOperation,
  SettingsPageApi,
} from '../../shared/settings-page';
import { createDefaultSettings } from '../../shared/settings-schema';
import { settingsProjection } from '../../shared/settings-catalog';
import { mergeSettingsInput } from '../../shared/settings-input';
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
type InputBasis = { before: Record<string, unknown>; revision: number };
type SavedInput = InputBasis & {
  pageId: string;
  value: Record<string, unknown>;
  savedRevision: number;
};
export class SettingsViewClient {
  model?: SettingsPageModel;
  private queued = 0;
  private chain = Promise.resolve();
  private listeners = new Set<() => void>();
  private input?: InputBasis & {
    pageId: string;
    values?: Record<string, unknown>;
    text?: string;
  };
  private inputVersion = 0;
  private rejectedTouchpadInputVersion = -1;
  private savedInputs: SavedInput[] = [];
  // Values retain their identity when presentation-only fields (sidebar width)
  // are copied. Their comparison basis must not become the optimistic display.
  private displayedBases = new WeakMap<Record<string, unknown>, InputBasis>();
  private display(m: SettingsPageModel) {
    if (this.input?.pageId === m.content.page.id && this.input.values) {
      this.displayedBases.set(this.input.values, {
        before: this.input.before,
        revision: this.input.revision,
      });
      return { ...m, content: { ...m.content, values: this.input.values } };
    }
    return m;
  }
  text(m: SettingsPageModel) {
    return this.input?.pageId === m.content.page.id && this.input.text !== undefined
      ? this.input.text
      : JSON.stringify(m.content.jsonValues ?? m.content.values, null, 2);
  }
  setText(value: string) {
    const m = this.model!;
    const basis =
      this.input?.pageId === m.content.page.id
        ? { before: this.input.before, revision: this.input.revision }
        : {
            before: m.content.jsonValues ?? m.content.values,
            revision: m.content.editing.editRevision,
          };
    this.input = { pageId: m.content.page.id, text: value, ...basis };
    this.inputVersion++;
    this.render(this.display(m));
    void this.act(
      {
        kind: 'edit',
        action: { type: 'partial-text', pageId: m.content.page.id, before: basis.before, value },
      },
      basis.revision,
    ).catch(() => {});
  }
  constructor(
    private render: (model: SettingsPageModel) => void,
    private failed: (text: string) => void,
    private transport: Pick<SettingsPageApi, 'get' | 'act'>,
    private connectionId: string,
  ) {}
  flush = () => this.chain;
  async preparePageChange() {
    const pageId = this.model?.content.page.id;
    await this.flush();
    this.accept(await this.transport.get(this.connectionId));
    if (this.input) throw Error(hostText('settings.runtime.invalidInput'));
    if (this.model?.content.page.id !== pageId)
      throw Error(hostText('settings.runtime.pageChanged'));
    return this.model!;
  }
  accept(next: unknown) {
    const m = next as SettingsPageModel;
    if (m?.kind !== 'settings' || (this.model?.id === m.id && this.model.revision >= m.revision))
      return;
    this.model = m;
    if (!this.queued) this.render(this.display(m));
    for (const fn of this.listeners) fn();
  }
  act(
    operation: SettingsPageOperation,
    inputRevision = this.model?.content.editing.editRevision ?? -1,
  ): Promise<any> {
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
    const touchpadForm =
      operation.kind === 'edit' &&
      operation.action.type === 'page-values' &&
      operation.action.pageId === 'touchpad-gestures';
    this.queued++;
    const work = this.chain.then(async () => {
      // Later queued edits include the optimistic values of the rejected form.
      if (touchpadForm && version <= this.rejectedTouchpadInputVersion) return;
      this.accept(await this.transport.get(this.connectionId));
      const m = this.model!;
      const inputOperation =
        operation.kind === 'edit' &&
        ['page-values', 'partial-text'].includes(operation.action.type);
      if (
        operation.kind === 'edit' &&
        (operation.action.type === 'page-values' || operation.action.type === 'partial-text')
      ) {
        let before = operation.action.before;
        for (const saved of this.savedInputs)
          if (saved.pageId === operation.action.pageId && saved.savedRevision > inputRevision)
            before = mergeSettingsInput(saved.before, saved.value, before);
        operation = {
          ...operation,
          action: {
            ...operation.action,
            before,
          },
        } as SettingsPageOperation;
      }
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
        if (
          operation.kind === 'edit' &&
          (operation.action.type === 'page-values' || operation.action.type === 'partial-text')
        ) {
          // Keep only submitted changes, not the external fields merged by Store.
          const saved: SavedInput = {
            pageId: operation.action.pageId,
            before: operation.action.before,
            value:
              operation.action.type === 'partial-text'
                ? (JSON.parse(operation.action.value) as Record<string, unknown>)
                : operation.action.value,
            revision: inputRevision,
            savedRevision: response.model.content.editing.editRevision,
          };
          this.savedInputs.push(saved);
          if (this.input?.pageId === saved.pageId && this.input.revision < saved.savedRevision) {
            try {
              this.input = {
                ...this.input,
                before: mergeSettingsInput(saved.before, saved.value, this.input.before),
                revision: saved.savedRevision,
              };
            } catch {
              // A separately started input retains its basis and conflict check.
            }
          }
        }
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
          if (touchpadForm) {
            this.rejectedTouchpadInputVersion = this.inputVersion;
            if (this.input?.pageId === 'touchpad-gestures' && this.input.values) {
              this.input = undefined;
              if (this.model) this.render(this.display(this.model));
            }
          }
          try {
            this.accept(await this.transport.get(this.connectionId));
          } catch {}
        },
      )
      .finally(() => {
        this.queued--;
        if (!this.queued) {
          this.savedInputs = [];
          if (this.model) this.render(this.display(this.model));
        }
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
      if (!id || m.content.page.id !== pageId)
        throw Error(hostText('settings.runtime.unavailable'));
      if (name === 'set-local-settings' || name === 'open-settings') {
        if (m.content.auxiliary.storage?.signature !== storageSignature)
          throw Error(hostText('settings.runtime.storageChanged'));
        if (name === 'set-local-settings' && this.input)
          throw Error(hostText('settings.runtime.invalidSwitch'));
        if (name === 'open-settings' || args.length < 2)
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
    const basis = this.displayedBases.get(model.content.values) ?? {
      before: model.content.values,
      revision: model.content.editing.editRevision,
    };
    return {
      value: materialize(this.display(model)),
      edit: (value: Settings) => {
        const values = settingsProjection(
          value,
          model.content.page,
          model.content.auxiliary.applets ?? [],
        );
        // Async controls can finish after an external update. Compare against the
        // values that produced this editor, not the newly accepted server values.
        const before = basis.before;
        this.input = { pageId: model.content.page.id, values, ...basis };
        this.inputVersion++;
        this.render(this.display(model));
        ignore(
          this.act(
            {
              kind: 'edit',
              action: { type: 'page-values', pageId: model.content.page.id, before, value: values },
            },
            basis.revision,
          ),
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
      checkHostOnAboutOpen: () => invoke('checkHostOnAboutOpen'),
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
