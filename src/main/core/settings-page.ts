import { hostText } from '../../shared/i18n';
import { hostStartupTiming } from './host-startup-timing';
import { randomUUID } from 'node:crypto';
import type { HostSnapshot } from '../../shared/contracts';
import type {
  SettingsPageAuxiliary,
  SettingsPageModel,
  SettingsPageRequest,
  SettingsNavigationState,
  SettingsPageAction,
  SettingsInputModeRequest,
  SettingsPaletteRequest,
} from '../../shared/settings-page';
import type { CommandPaletteResult } from '../../shared/overlays';
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
      host(): Pick<HostSnapshot, 'settings' | 'dark'>;
      auxiliary(page: SettingsPageDefinition): SettingsPageAuxiliary;
      actions(page: SettingsPageDefinition): Record<string, (args: unknown[]) => Promise<unknown>>;
      read?<T>(action: () => T): T;
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
    if (request.pageId && request.pageId !== options.editor.metadata().pageId) {
      const state = options.editor.metadata();
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
        this.options.editor.metadata().pageId === this.request.pageId)
    );
  }
  snapshot(): SettingsPageModel {
    const read = () => this.options.editor.read(() => this.snapshotCore());
    return hostStartupTiming.measure('settingsPage', () =>
      this.options.read ? this.options.read(read) : read(),
    );
  }
  private snapshotCore(): SettingsPageModel {
    const state = this.options.editor.metadata();
    if (
      this.request.context === 'applet' &&
      this.request.pageId &&
      state.pageId !== this.request.pageId
    )
      throw Error(hostText('settings.pageError.targetChanged'));
    const host = this.options.host();
    const catalog = this.options.editor.catalog();
    const page = catalog.find((p) => p.id === state.pageId) ?? {
      id: state.pageId,
      title: hostText('settings.pageError.missingTitle'),
      kind: 'applet' as const,
      json: false,
      items: [],
      unavailableReason: hostText('settings.pageError.unavailable'),
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
      language: host.settings.value.host.language,
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
  async input(request: SettingsInputModeRequest) {
    if (!request || typeof request.recording !== 'boolean')
      throw Error(hostText('settings.pageError.operationDenied'));
    await this.transientAction(request, 'setShortcutRecording')([request.recording]);
  }
  async palette(request: SettingsPaletteRequest): Promise<CommandPaletteResult | void> {
    if (!request || !['open', 'cancel'].includes(request.kind))
      throw Error(hostText('settings.pageError.operationDenied'));
    if (request.kind === 'open') {
      if (
        !request.request ||
        request.request.mode !== 'select' ||
        JSON.stringify([request.request]).length > 1024 * 1024
      )
        throw Error(hostText('settings.pageError.operationDenied'));
      return (await this.transientAction(
        request,
        'openCommandPalette',
      )([request.request])) as CommandPaletteResult;
    }
    if (typeof request.requestId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(request.requestId))
      throw Error(hostText('settings.pageError.operationDenied'));
    await this.transientAction(request, 'cancelCommandPalette')([request.requestId]);
  }
  private transientAction(
    request: Pick<SettingsInputModeRequest, 'sessionId' | 'pageId' | 'actionId'>,
    name: 'setShortcutRecording' | 'openCommandPalette' | 'cancelCommandPalette',
  ) {
    const state = this.options.editor.metadata();
    const issued = this.actions.get(name);
    if (
      !this.isCurrent() ||
      !request ||
      request.sessionId !== state.sessionId ||
      request.pageId !== state.pageId ||
      this.actionPage !== state.pageId ||
      !issued ||
      request.actionId !== issued.id
    )
      throw Error(hostText('settings.pageError.operationDenied'));
    // Recheck availability without constructing/returning the settings page model.
    const page = this.options.editor.page(state.pageId);
    const run = !page.unavailableReason && this.options.actions(page)[name];
    if (!run) throw Error(hostText('settings.pageError.operationDenied'));
    return run;
  }
  private async perform(action: SettingsPageAction) {
    const state = this.options.editor.metadata();
    if (
      this.request.context === 'applet' &&
      this.request.pageId &&
      state.pageId !== this.request.pageId
    )
      throw Error(hostText('settings.pageError.targetChanged'));
    if (action.sessionId !== state.sessionId || action.editRevision !== state.editRevision)
      throw Error(hostText('settings.pageError.editChanged'));
    this.error = '';
    let actionOwnsError = false;
    try {
      let result: unknown;
      const op = action.operation;
      if (op.kind === 'search') {
        if (this.request.context !== 'full' || typeof op.text !== 'string' || op.text.length > 512)
          throw Error(hostText('settings.pageError.searchLong'));
        this.navigation.query = op.text;
      } else if (op.kind === 'move') {
        if (this.request.context !== 'full')
          throw Error(hostText('settings.pageError.moveUnsupported'));
        const item = this.options.editor
          .catalog()
          .flatMap((p) => p.items)
          .find(
            (i) => i.id === (op.itemId === 'about/updateSource' ? 'applets/management' : op.itemId),
          );
        if (!item) throw Error(hostText('settings.pageError.missingResult'));
        await this.options.editor.act({
          ...action,
          action: { type: 'select-page', pageId: item.pageId },
        });
        this.navigation.provider = undefined;
        const selected = this.options.editor.metadata();
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
          throw Error(hostText('settings.pageError.staleMove'));
        move.completed = true;
      } else if (op.kind === 'viewport') {
        if (!Number.isFinite(op.width) || op.width < 320 || op.width > 10000)
          throw Error(hostText('settings.pageError.width'));
        this.request.hostWidth = op.width;
      } else if (op.kind === 'sidebar-width') {
        if (
          this.request.context !== 'full' ||
          !Number.isFinite(op.width) ||
          op.width < 220 ||
          op.width > 480
        )
          throw Error(hostText('settings.pageError.indexWidth'));
        this.request.sidebarWidth = Math.round(op.width);
        this.options.resize?.(this.request.sidebarWidth);
      } else if (op.kind === 'select') {
        if (this.request.context !== 'full')
          throw Error(hostText('settings.pageError.selectUnsupported'));
        await this.options.editor.act({
          ...action,
          action: { type: 'select-page', pageId: op.pageId },
        });
        this.navigation.provider = undefined;
        if (op.pageId !== state.pageId) this.options.release?.();
        this.navigation.move = undefined;
      } else if (op.kind === 'edit') {
        if (
          !['mode', 'page-values', 'partial-text', 'reset-page', 'reload'].includes(op.action.type)
        )
          throw Error(hostText('settings.pageError.invalidOperation'));
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
          throw Error(hostText('settings.pageError.operationDenied'));
        // The invoking control (for example SettingsDialog) owns action error feedback.
        actionOwnsError = true;
        result = await issued.run(op.args ?? []);
        actionOwnsError = false;
      } else throw Error(hostText('settings.pageError.invalidOperation'));
      return { model: this.snapshot(), result };
    } catch (error) {
      if (!actionOwnsError) this.error = error instanceof Error ? error.message : String(error);
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
