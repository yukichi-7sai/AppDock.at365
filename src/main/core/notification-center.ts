import { createHash } from 'node:crypto';
import type { HostPageAction } from '../../shared/host-pages';
import type {
  NotificationCenterFilters,
  NotificationCenterItem,
  NotificationCenterRequest,
  NotificationCenterModel,
} from '../../shared/notification-center';
import { notificationCatalog } from '../../shared/notification-types';
import type { ExtensionSnapshot } from '../../shared/contracts';
import type { HostPageController } from './host-page-controller';
import type { NotificationService } from './notification-service';
const exact = (v: any, keys: string[]) =>
  v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).every((k) => keys.includes(k));
const defaults = (): NotificationCenterFilters => ({
  tab: 'active',
  level: 'all',
  source: '',
  status: 'all',
  unread: false,
  text: '',
});
export class NotificationCenterController implements HostPageController {
  readonly kind = 'notifications';
  readonly route = 'notifications';
  readonly id: string;
  private filters = defaults();
  private offset = 0;
  private revision = 0;
  private signature = '';
  private writing = false;
  private unsubscribe: () => void;
  constructor(
    request: NotificationCenterRequest,
    private options: {
      service: NotificationService;
      applets(): ExtensionSnapshot[];
      dark(): boolean;
      changed(): void;
      confirmDeletion(count: number): Promise<boolean>;
    },
  ) {
    if (
      !exact(request, ['id', 'kind', 'route']) ||
      request.kind !== this.kind ||
      request.route !== this.route ||
      typeof request.id !== 'string' ||
      !request.id ||
      request.id.length > 100
    )
      throw Error('Invalid notification center request');
    this.id = request.id;
    this.unsubscribe = options.service.subscribe(options.changed);
  }
  dispose() {
    this.unsubscribe();
  }
  private rows(): NotificationCenterItem[] {
    const types = notificationCatalog(this.options.applets());
    return this.options.service
      .centerEntries()
      .map((item) => {
        const type = types.find(
          (t) =>
            t.ownerKind === item.ownerKind &&
            t.ownerId === item.ownerId &&
            t.typeId === item.typeId,
        );
        return {
          ...item,
          ownerTitle:
            type?.ownerTitle ??
            this.options.applets().find((a) => a.id === item.ownerId)?.displayName ??
            (item.source.startsWith('host.') ? 'AppDock' : (item.ownerId ?? item.source)),
          typeTitle: type?.title ?? item.typeId ?? '種類不明',
        };
      })
      .sort(
        (a, b) =>
          (b.endedAt ?? b.createdAt) - (a.endedAt ?? a.createdAt) ||
          b.createdAt - a.createdAt ||
          a.id.localeCompare(b.id),
      );
  }
  private query(rows = this.rows()) {
    const f = this.filters;
    const eligible = rows.filter(
      (i) =>
        (f.tab === 'active' ? i.status === 'active' : i.status !== 'active') &&
        (f.level === 'all' || i.level === f.level) &&
        (!f.source || i.source === f.source) &&
        (f.tab === 'active' || f.status === 'all' || i.status === f.status) &&
        (!f.unread || !i.read) &&
        (i.title + ' ' + i.body + ' ' + i.ownerTitle + ' ' + i.typeTitle)
          .toLowerCase()
          .includes(f.text.toLowerCase()),
    );
    const token = createHash('sha256')
      .update(JSON.stringify([f, eligible.map((i) => [i.id, i.revision, i.read, i.status])]))
      .digest('hex');
    return { rows, eligible, token };
  }
  snapshot(): NotificationCenterModel {
    const { rows, eligible, token } = this.query();
    const pageSize = this.filters.tab === 'active' ? 200 : 50;
    const content = {
      filters: { ...this.filters },
      items: eligible.slice(this.offset, this.offset + pageSize),
      sources: [
        ...new Map(rows.map((i) => [i.source, { id: i.source, title: i.ownerTitle }])).values(),
      ],
      total: eligible.length,
      activeCount: rows.filter((i) => i.status === 'active').length,
      historyCount: rows.filter((i) => i.status !== 'active').length,
      unreadCount: rows.filter((i) => !i.read).length,
      offset: this.offset,
      pageSize,
      token,
      nextCursor:
        this.offset + pageSize < eligible.length ? token + ':' + (this.offset + pageSize) : null,
      ...this.options.service.historyStatus(),
    };
    const dark = this.options.dark(),
      signature = JSON.stringify([dark, content]);
    if (signature !== this.signature) {
      this.signature = signature;
      this.revision++;
    }
    return {
      schemaVersion: 1,
      id: this.id,
      contextId: 'primary',
      kind: this.kind,
      revision: this.revision,
      dark,
      content,
    };
  }
  async act(request: HostPageAction) {
    if (
      !exact(request, ['id', 'type', 'action']) ||
      request.id !== this.id ||
      request.type !== 'notifications'
    )
      throw Error('Stale notification center action');
    const a = request.action;
    if (!a || typeof a !== 'object') throw Error('Invalid notification operation');
    if (a.type === 'filters') {
      const f = a.filters;
      if (
        !exact(a, ['type', 'filters']) ||
        !exact(f, ['tab', 'level', 'source', 'status', 'unread', 'text']) ||
        !['active', 'history'].includes(f.tab) ||
        !['all', 'info', 'warning', 'error'].includes(f.level) ||
        typeof f.source !== 'string' ||
        f.source.length > 200 ||
        typeof f.text !== 'string' ||
        f.text.length > 1000 ||
        typeof f.unread !== 'boolean' ||
        !['all', 'resolved', 'dismissed', 'expired', 'withdrawn', 'interrupted'].includes(f.status)
      )
        throw Error('通知の検索条件が不正です。');
      this.filters = { ...f };
      this.offset = 0;
      this.options.changed();
      return;
    }
    if (a.type === 'refresh') {
      if (!exact(a, ['type'])) throw Error('Invalid refresh');
      this.offset = 0;
      this.options.changed();
      return;
    }
    const query = this.query();
    if (a.type === 'page') {
      if (!exact(a, ['type', 'cursor']) || typeof a.cursor !== 'string')
        throw Error('Invalid cursor');
      const parts = a.cursor.split(':'),
        offset = Number(parts[1]);
      if (
        parts.length !== 2 ||
        parts[0] !== query.token ||
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        offset >= query.eligible.length ||
        offset % 50 !== 0 ||
        this.filters.tab !== 'history'
      )
        throw Error('一覧が更新されました。再読み込みしてください。');
      this.offset = offset;
      this.options.changed();
      return;
    }
    if (a.type === 'act') {
      if (
        !exact(a, ['type', 'request']) ||
        this.filters.tab !== 'active' ||
        !query.eligible.some((i) => i.id === a.request?.notificationId)
      )
        throw Error('表示中のアクティブ通知だけを操作できます。');
      return this.options.service.invoke(a.request);
    }
    if (a.type !== 'read' && a.type !== 'delete') throw Error('Unknown center action');
    if (
      !exact(a, ['type', 'token', 'ids', 'scope']) ||
      (a.scope !== undefined && a.token !== query.token) ||
      typeof a.token !== 'string' ||
      (a.ids !== undefined && a.scope !== undefined) ||
      (a.scope !== undefined &&
        !['filtered', ...(a.type === 'delete' ? ['all'] : [])].includes(a.scope)) ||
      (a.ids !== undefined &&
        (!Array.isArray(a.ids) ||
          a.ids.length > 1000 ||
          a.ids.some((id) => typeof id !== 'string' || !id || id.length > 100) ||
          new Set(a.ids).size !== a.ids.length)) ||
      (a.ids === undefined && a.scope === undefined)
    )
      throw Error('一覧が更新されました。対象を確認してください。');
    if (a.type === 'delete' && this.filters.tab !== 'history')
      throw Error('終了履歴だけを削除できます。');
    const eligible =
      a.scope === 'all' ? query.rows.filter((i) => i.status !== 'active') : query.eligible;
    const ids = a.ids ?? eligible.map((i) => i.id);
    if (ids.some((id) => !eligible.some((i) => i.id === id)))
      throw Error('表示対象にない通知です。');
    if (!ids.length) return;
    if (this.writing) throw Error('通知履歴の処理中です。');
    this.writing = true;
    try {
      // Capture IDs before the dialog: notifications arriving during confirmation are preserved.
      if (
        a.type === 'delete' &&
        (ids.length > 1 || a.scope !== undefined) &&
        !(await this.options.confirmDeletion(ids.length))
      )
        return;
      if (a.type === 'delete') this.options.service.deleteHistory(ids);
      else this.options.service.markRead(ids);
      this.options.changed();
    } finally {
      this.writing = false;
    }
  }
}
