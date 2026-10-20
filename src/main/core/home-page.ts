import { randomUUID } from 'node:crypto';
import type { ExtensionSnapshot } from '../../shared/contracts';
import { orderApplets } from '../../shared/applet-order';
import { rankCommands, type UiCommand } from '../../shared/commands';
import type {
  HomePageRequest,
  HomePageModel,
  ShellPageRequest,
  ShellPageAction,
} from '../../shared/shell-pages';
import type { ShellPageController } from './shell-page-controller';

export function parseHomePageRequest(value: ShellPageRequest): HomePageRequest {
  if (
    !value ||
    value.kind !== 'home' ||
    value.route !== 'home' ||
    typeof value.id !== 'string' ||
    !value.id ||
    value.id.length > 100 ||
    !Array.isArray(value.appletOrder) ||
    value.appletOrder.length > 10000 ||
    value.appletOrder.some((id) => typeof id !== 'string' || !id || id.length > 200)
  )
    throw Error('Invalid home page request');
  return { id: value.id, kind: 'home', route: 'home', appletOrder: [...value.appletOrder] };
}
/** Execution outlives page navigation, as did the host renderer's shared action state. */
export class HomeCommandExecution {
  busy = false;
  error = '';
  message = '';
  private closed = false;
  constructor(
    private options: {
      execute(id: string): Promise<unknown>;
      changed(): void;
      completed(result: { message: string; error: string }): void;
    },
  ) {}
  async run(id: string) {
    if (this.closed || this.busy) throw Error('Home operation in progress');
    this.busy = true;
    this.error = '';
    this.message = '';
    this.options.changed();
    try {
      await this.options.execute(id);
    } catch (error) {
      if (!this.closed) this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.busy = false;
      if (!this.closed) {
        this.options.completed({ message: this.message, error: this.error });
        this.options.changed();
      }
    }
  }
  dispose() {
    this.closed = true;
  }
}
type Operation = { command: string; navigation?: true } | { applet: string };
const navigationCommands = new Set([
  'appdock.commands.search',
  'appdock.logs.open',
  'appdock.applets.open',
  'appdock.settings.open',
  'appdock.image-library.open',
  'appdock.updates.open',
]);
/** Owns only home presentation/operations. Settings editing remains in the shared editor. */
export class HomePageSession implements ShellPageController {
  readonly kind = 'home';
  readonly route = 'home';
  readonly id: string;
  private request: HomePageRequest;
  private actions = new Map<string, { id: string; operation: Operation }>();
  private closed = false;
  private revision = 0;
  private signature = '';
  constructor(
    request: HomePageRequest,
    private options: {
      applets(): ExtensionSnapshot[];
      commands(): UiCommand[];
      pins(): string[];
      appletOrder?(): string[];
      dark(): boolean;
      execution: HomeCommandExecution;
      navigate(command: string): Promise<unknown>;
      openApplet(id: string): void;
    },
  ) {
    this.request = parseHomePageRequest(request);
    this.id = request.id;
  }
  update(request: ShellPageRequest) {
    const next = parseHomePageRequest(request);
    if (next.id !== this.id) throw Error('Stale home page request');
    this.request = next;
  }
  snapshot(): HomePageModel {
    const previous = this.actions;
    this.actions = new Map();
    const action = (key: string, operation: Operation) => {
      const item = previous.get(key) ?? { id: randomUUID(), operation };
      this.actions.set(key, item);
      return item.id;
    };
    const applets = orderApplets(
      this.options.applets().filter((e) => e.sourceKind !== 'builtin'),
      this.options.appletOrder?.() ?? this.request.appletOrder,
    );
    const commands = this.options.commands();
    const pins = this.options.pins();
    const content: HomePageModel['content'] = {
      stats: {
        running: applets.filter((e) => e.state === 'running').length,
        errors: applets.filter((e) => e.state === 'error').length,
        applets: applets.length,
        commands: commands.length,
      },
      pins: rankCommands(
        commands.filter((c) => pins.includes(c.id)),
        pins,
      ).map((c) => ({
        id: c.id,
        title: c.title,
        extension: c.extension,
        available: c.available,
        ...(c.disabledReason ? { disabledReason: c.disabledReason } : {}),
        actionId: action('pin:' + c.id, {
          command: c.id,
          ...(navigationCommands.has(c.id) ? { navigation: true as const } : {}),
        }),
      })),
      applets: applets.map((e) => ({
        id: e.id,
        title: e.displayName,
        description: e.description ?? '',
        state: e.state,
        runtime: e.runtime,
        collection: !!e.collection,
        version: e.version,
        actionId: action('applet:' + e.id, { applet: e.id }),
      })),
      actions: {
        palette: action('palette', { command: 'appdock.commands.search', navigation: true }),
        logs: action('logs', { command: 'appdock.logs.open', navigation: true }),
        applets: action('applets', { command: 'appdock.applets.open', navigation: true }),
      },
      busy: this.options.execution.busy,
      error: this.options.execution.error,
      message: this.options.execution.message,
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
      kind: 'home',
      revision: this.revision,
      dark,
      content,
    };
  }
  async act(action: ShellPageAction) {
    if (this.closed || !action || action.id !== this.id) throw Error('Stale page action');
    if (action.type !== 'invoke') throw Error('Unknown home page action');
    // Refresh the catalogue before resolving an issued ID (removed pins/cards become invalid).
    this.snapshot();
    const entry = [...this.actions.values()].find((e) => e.id === action.actionId);
    if (!entry) throw Error('Home action is no longer available');
    const operation = entry.operation;
    if (
      'command' in operation &&
      !this.options.commands().some((c) => c.id === operation.command && c.available)
    )
      throw Error('Command is unavailable');
    if ('applet' in operation) this.options.openApplet(operation.applet);
    else if (operation.navigation) await this.options.navigate(operation.command);
    else await this.options.execution.run(operation.command);
  }

  dispose() {
    this.closed = true;
    this.actions.clear();
  }
}
