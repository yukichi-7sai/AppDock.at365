import { randomUUID } from 'node:crypto';
import type { HostSnapshot } from '../../shared/contracts';
import type {
  SettingsPageAuxiliary,
  SettingsPageModel,
  SettingsPageRequest,
  SettingsNavigationState,
  SettingsPageAction,
} from '../../shared/settings-page';
import type { SettingsPageDefinition } from '../../shared/settings-catalog';
import { searchSettings } from '../../shared/settings-catalog';
import type { SettingsInputSession } from './settings-input-session';

export class SettingsPageSession {
  readonly kind = 'settings';
  readonly id: string;
  readonly route: string;
  private revision = 0;
  private signature = '';
  private actionPage = '';
  private disposed = false;
  private error = '';
  private navigation: SettingsNavigationState;
  private actions = new Map<string, { id: string; run: (args: unknown[]) => Promise<unknown> }>();
  private requests = new Map<string, Promise<unknown>>();
  constructor(
    private request: SettingsPageRequest,
    private options: {
      editor: SettingsInputSession;
      navigation?: SettingsNavigationState;
      host(): HostSnapshot;
      auxiliary(page: SettingsPageDefinition): SettingsPageAuxiliary;
      actions(page: SettingsPageDefinition): Record<string, (args: unknown[]) => Promise<unknown>>;
      changed(): void;
      release?(): void;
      resize?(width: number): void;
    },
  ) {
    if (
      !request ||
      request.kind !== 'settings' ||
      !['settings', 'extensions'].includes(request.route) ||
      !['full', 'applet'].includes(request.context) ||
      typeof request.id !== 'string' ||
      request.id.length > 100
    )
      throw Error('Invalid settings page request');
    this.id = request.id;
    this.route = request.route;
    this.navigation = options.navigation ?? { query: '' };
    if (request.pageId && request.pageId !== options.editor.snapshot().pageId) {
      const state = options.editor.snapshot();
      // The host's selected detail supplies the scope; a rejected transition keeps the original JSON.
      void options.editor
        .act({
          sessionId: state.sessionId,
          editRevision: state.editRevision,
          operationId: randomUUID(),
          action: { type: 'select-page', pageId: request.pageId },
        })
        .catch((error) => {
          this.error = String(error);
          options.changed();
        });
    }
  }
  isCurrent() {
    return (
      !this.disposed &&
      (this.request.context !== 'applet' ||
        !this.request.pageId ||
        this.options.editor.snapshot().pageId === this.request.pageId)
    );
  }
  snapshot(): SettingsPageModel {
    const state = this.options.editor.snapshot();
    if (
      this.request.context === 'applet' &&
      this.request.pageId &&
      state.pageId !== this.request.pageId
    )
      throw Error('設定画面の対象が変わりました。');
    const host = this.options.host();
    const catalog = this.options.editor.catalog();
    const page = catalog.find((p) => p.id === state.pageId) ?? {
      id: state.pageId,
      title: '設定対象が見つかりません',
      kind: 'applet' as const,
      json: false,
      items: [],
      unavailableReason: '設定対象が削除されたか、現在利用できません。別の設定を選んでください。',
    };
    const previous =
      this.actionPage === page.id
        ? this.actions
        : new Map<string, { id: string; run: (args: unknown[]) => Promise<unknown> }>();
    this.actionPage = page.id;
    this.actions = new Map(
      Object.entries(page.unavailableReason ? {} : this.options.actions(page)).map(([key, run]) => [
        key,
        { id: previous.get(key)?.id ?? randomUUID(), run },
      ]),
    );
    const content: SettingsPageModel['content'] = {
      context: this.request.context,
      sidebarWidth: this.request.sidebarWidth ?? 280,
      hostWidth: this.request.hostWidth ?? 1024,
      showHints: host.settings.value.host.showHints,
      page,
      values: page.json ? this.options.editor.projection() : {},
      jsonValues: page.json ? this.options.editor.jsonProjection() : {},
      navigation:
        this.request.context === 'full'
          ? catalog.map((p) => ({
              id: p.id,
              title: p.title,
              owner: p.owner,
            }))
          : [],
      query: this.request.context === 'full' ? this.navigation.query : '',
      results:
        this.request.context === 'full'
          ? searchSettings(catalog, this.navigation.query).map(
              ({ definition, keywords, ...item }) => ({
                ...item,
                pageTitle: catalog.find((p) => p.id === item.pageId)!.title,
              }),
            )
          : [],
      move:
        this.request.context === 'full' && this.navigation.move?.pageId === page.id
          ? this.navigation.move
          : undefined,
      editing: {
        sessionId: state.sessionId,
        editRevision: state.editRevision,
        pending: state.pending,
        error: this.error,
        mode: state.mode,
      },
      actions: Object.fromEntries([...this.actions].map(([key, a]) => [key, a.id])),
      auxiliary: page.unavailableReason ? {} : this.options.auxiliary(page),
    };
    const signature = JSON.stringify({ content, dark: host.dark });
    if (signature !== this.signature) {
      this.signature = signature;
      this.revision++;
    }
    return {
      schemaVersion: 2,
      id: this.id,
      contextId: 'primary',
      kind: 'settings',
      revision: this.revision,
      dark: host.dark,
      content,
    };
  }
  async act(action: SettingsPageAction) {
    if (
      this.disposed ||
      action?.type !== 'settings' ||
      action.id !== this.id ||
      typeof action.operationId !== 'string' ||
      !action.operationId ||
      action.operationId.length > 100
    )
      throw Error('Stale settings page');
    const existing = this.requests.get(action.operationId);
    if (existing) return existing;
    const work = this.perform(action);
    this.requests.set(action.operationId, work);
    while (this.requests.size > 512) this.requests.delete(this.requests.keys().next().value!);
    return work;
  }
  private async perform(action: SettingsPageAction) {
    const state = this.options.editor.snapshot();
    if (
      this.request.context === 'applet' &&
      this.request.pageId &&
      state.pageId !== this.request.pageId
    )
      throw Error('設定画面の対象が変わりました。');
    if (action.sessionId !== state.sessionId || action.editRevision !== state.editRevision)
      throw Error('編集内容が別の画面で変わりました。再取得してください。');
    this.error = '';
    try {
      let result: unknown;
      const op = action.operation;
      if (op.kind === 'search') {
        if (this.request.context !== 'full' || typeof op.text !== 'string' || op.text.length > 512)
          throw Error('検索語は512文字以下にしてください。');
        this.navigation.query = op.text;
      } else if (op.kind === 'move') {
        if (this.request.context !== 'full') throw Error('この入口では検索結果へ移動できません。');
        const item = this.options.editor
          .catalog()
          .flatMap((p) => p.items)
          .find((i) => i.id === op.itemId);
        if (!item) throw Error('設定対象が見つかりません。検索結果を更新してください。');
        await this.options.editor.act({
          ...action,
          action: { type: 'select-page', pageId: item.pageId },
        });
        const selected = this.options.editor.snapshot();
        if (selected.mode !== 'form')
          await this.options.editor.act({
            sessionId: selected.sessionId,
            editRevision: selected.editRevision,
            operationId: randomUUID(),
            action: { type: 'mode', value: 'form' },
          });
        if (item.pageId !== state.pageId) this.options.release?.();
        this.navigation.move = { id: randomUUID(), itemId: item.id, pageId: item.pageId };
      } else if (op.kind === 'moved') {
        const move = this.navigation.move;
        if (
          this.request.context !== 'full' ||
          !move ||
          move.id !== op.requestId ||
          move.pageId !== op.pageId ||
          state.pageId !== op.pageId
        )
          throw Error('移動要求が古くなっています。');
        move.completed = true;
      } else if (op.kind === 'viewport') {
        if (!Number.isFinite(op.width) || op.width < 320 || op.width > 10000)
          throw Error('設定画面の幅が不正です。');
        this.request.hostWidth = op.width;
      } else if (op.kind === 'sidebar-width') {
        if (
          this.request.context !== 'full' ||
          !Number.isFinite(op.width) ||
          op.width < 220 ||
          op.width > 480
        )
          throw Error('一覧の幅が不正です。');
        this.request.sidebarWidth = Math.round(op.width);
        this.options.resize?.(this.request.sidebarWidth);
      } else if (op.kind === 'select') {
        if (this.request.context !== 'full')
          throw Error('この入口では設定ページを変更できません。');
        await this.options.editor.act({
          ...action,
          action: { type: 'select-page', pageId: op.pageId },
        });
        if (op.pageId !== state.pageId) this.options.release?.();
        this.navigation.move = undefined;
      } else if (op.kind === 'edit') {
        if (
          !['mode', 'page-values', 'partial-text', 'reset-page', 'reload'].includes(op.action.type)
        )
          throw Error('設定操作が不正です。');
        await this.options.editor.act({ ...action, action: op.action });
      } else if (op.kind === 'invoke') {
        // Rebuild against current page and availability before resolving the issued ID.
        this.snapshot();
        const issued = [...this.actions.values()].find((a) => a.id === op.actionId);
        if (
          !issued ||
          !Array.isArray(op.args ?? []) ||
          JSON.stringify(op.args ?? []).length > 1024 * 1024
        )
          throw Error('このページで許可されていない操作です。');
        result = await issued.run(op.args ?? []);
      } else throw Error('設定操作が不正です。');
      return { model: this.snapshot(), result };
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      this.options.changed();
    }
  }
  viewClosed() {
    this.options.release?.();
  }
  dispose() {
    this.disposed = true;
    this.actions.clear();
    this.options.release?.();
  }
  update(request: SettingsPageRequest) {
    if (request.kind !== 'settings') return;
    if (
      Number.isFinite(request.sidebarWidth) &&
      request.sidebarWidth! >= 220 &&
      request.sidebarWidth! <= 480
    )
      this.request.sidebarWidth = request.sidebarWidth;
    if (
      Number.isFinite(request.hostWidth) &&
      request.hostWidth! >= 320 &&
      request.hostWidth! <= 10000
    )
      this.request.hostWidth = request.hostWidth;
  }
}
