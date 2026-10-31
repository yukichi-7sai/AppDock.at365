import type { LogEntry } from '../../shared/contracts';
import type {
  LogFilters,
  HostPageRequest,
  HostPageAction,
  LogPageModel,
  LogPageRequest,
} from '../../shared/host-pages';
import type { HostPageController } from './host-page-controller';

export function parseLogPageRequest(value: LogPageRequest): LogPageRequest {
  if (
    !value ||
    typeof value.id !== 'string' ||
    !value.id ||
    value.id.length > 100 ||
    value.kind !== 'logs' ||
    !['logs', 'extensions'].includes(value.route) ||
    typeof value.source !== 'string' ||
    value.source.length > 200 ||
    !value.scope ||
    !['all', 'applet', 'web'].includes(value.scope.type) ||
    (value.scope.type === 'applet' &&
      (typeof value.scope.id !== 'string' || !value.scope.id || value.scope.id.length > 200)) ||
    (value.route === 'logs') !== (value.scope.type === 'all')
  )
    throw Error('Invalid log page request');
  return structuredClone(value);
}

export class LogPageSession implements HostPageController {
  readonly kind = 'logs';
  readonly id: string;
  readonly route: string;
  private filters: LogFilters;
  private revision = 0;
  private signature = '';
  constructor(
    private request: LogPageRequest,
    private options: {
      entries(): LogEntry[];
      sources(): { id: string; title: string }[];
      dark(): boolean;
      openDirectory(): Promise<void>;
      sourceChanged(source: string): void;
      changed(): void;
    },
  ) {
    this.request = parseLogPageRequest(request);
    this.id = request.id;
    this.route = request.route;
    this.filters = {
      source:
        request.scope.type === 'applet'
          ? request.scope.id
          : request.scope.type === 'all'
            ? request.source
            : '',
      level: 'standard',
      category: 'normal',
      text: '',
    };
  }
  update(request: HostPageRequest) {
    if (request.kind !== 'logs') throw Error('Invalid log page request');
    const next = parseLogPageRequest(request);
    if (next.id !== this.id || next.route !== this.route) throw Error('Stale log page request');
    if (next.source !== this.request.source) this.filters.source = next.source;
    this.request = next;
  }
  snapshot(): LogPageModel {
    const entries = this.options.entries().slice(-500);
    const sources = new Map(this.options.sources().map((s) => [s.id, s.title]));
    for (const e of entries) if (!sources.has(e.source)) sources.set(e.source, e.source);
    if (this.filters.source && !sources.has(this.filters.source))
      sources.set(this.filters.source, this.filters.source);
    const scope = this.request.scope;
    const content = {
      scope,
      filters: { ...this.filters },
      sources: [...sources].map(([id, title]) => ({ id, title })),
      entries: entries.filter(
        (e) =>
          (scope.type === 'web'
            ? e.source.startsWith('web.') || e.source === 'web-applets'
            : !this.filters.source || e.source === this.filters.source) &&
          (this.filters.level === 'all' ||
            (this.filters.level === 'standard'
              ? e.level !== 'debug'
              : this.filters.level === e.level)) &&
          (this.filters.category === 'all' ||
            (this.filters.category === 'audit'
              ? e.category === 'audit'
              : e.category !== 'audit' || e.level === 'warn' || e.level === 'error')) &&
          `${e.source} ${e.message}`.toLowerCase().includes(this.filters.text.toLowerCase()),
      ),
      limit: 500,
    };
    const dark = this.options.dark();
    const signature = JSON.stringify([dark, content]);
    if (signature !== this.signature) {
      this.signature = signature;
      this.revision++;
    }
    return {
      schemaVersion: 1,
      id: this.id,
      contextId: 'primary',
      kind: 'logs',
      revision: this.revision,
      dark,
      content,
    };
  }
  async act(action: HostPageAction) {
    if (!action || action.id !== this.id) throw Error('Stale page action');
    if (action.type === 'open-directory') return this.options.openDirectory();
    if (action.type !== 'filters') throw Error('Unknown log page action');
    const f = action.filters;
    if (
      !f ||
      typeof f.source !== 'string' ||
      f.source.length > 200 ||
      typeof f.text !== 'string' ||
      f.text.length > 4000 ||
      !['all', 'standard', 'debug', 'info', 'warn', 'error'].includes(f.level) ||
      !['all', 'normal', 'audit'].includes(f.category)
    )
      throw Error('Invalid log filters');
    if (this.request.scope.type !== 'all' && f.source !== this.filters.source)
      throw Error('Log scope is fixed');
    const previous = this.filters.source;
    this.filters = { source: f.source, level: f.level, category: f.category, text: f.text };
    if (this.request.scope.type === 'all' && previous !== f.source)
      this.options.sourceChanged(f.source);
    this.options.changed();
  }
}
