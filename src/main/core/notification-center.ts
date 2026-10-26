import { hostText } from '../../shared/i18n';
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
  text: '',
});
// Host modules share one user-facing source; keep the original source on each notification.
const sourceFilterId = (item: NotificationCenterItem) =>
  item.ownerKind === 'host' || (!item.ownerKind && item.source.startsWith('host.'))
    ? 'host'
    : item.source;
export class NotificationCenterController implements HostPageController {
  readonly kind = 'notifications';
  readonly route = 'notifications';
  readonly id: string;
  private filters = defaults();
  private offset = 0;
  private revision = 0;
  private signature = '';
  private unsubscribe: () => void;
  constructor(
    request: NotificationCenterRequest,
    private options: {
      service: NotificationService;
      applets(): ExtensionSnapshot[];
      dark(): boolean;
      changed(): void;
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
          typeTitle:
            type?.title ?? item.typeId ?? hostText('services.notificationCenter.unknownType'),
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
        (!f.source || sourceFilterId(i) === f.source || i.source === f.source) &&
        (f.tab === 'active' || f.status === 'all' || i.status === f.status) &&
        (i.title + ' ' + i.body + ' ' + i.ownerTitle + ' ' + i.typeTitle)
          .toLowerCase()
          .includes(f.text.toLowerCase()),
    );
    const token = createHash('sha256')
      .update(JSON.stringify([f, eligible.map((i) => [i.id, i.revision, i.status])]))
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
        ...new Map(
          rows.map((i) => {
            const id = sourceFilterId(i);
            return [id, { id, title: id === 'host' ? 'AppDock' : i.ownerTitle }];
          }),
        ).values(),
      ],
      total: eligible.length,
      activeCount: rows.filter((i) => i.status === 'active').length,
      historyCount: rows.filter((i) => i.status !== 'active').length,
      offset: this.offset,
      pageSize,
      nextCursor:
        this.offset + pageSize < eligible.length ? token + ':' + (this.offset + pageSize) : null,
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
        !exact(f, ['tab', 'level', 'source', 'status', 'text']) ||
        !['active', 'history'].includes(f.tab) ||
        !['all', 'info', 'warning', 'error'].includes(f.level) ||
        typeof f.source !== 'string' ||
        f.source.length > 200 ||
        typeof f.text !== 'string' ||
        f.text.length > 1000 ||
        !['all', 'resolved', 'dismissed', 'expired', 'withdrawn'].includes(f.status)
      )
        throw Error(hostText('services.notificationCenter.invalidFilter'));
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
        throw Error(hostText('services.notificationCenter.changed'));
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
        throw Error(hostText('services.notificationCenter.activeOnly'));
      return this.options.service.invoke(a.request);
    }
    throw Error('Unknown center action');
  }
}
