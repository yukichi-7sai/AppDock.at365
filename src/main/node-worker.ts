import { hostText } from '../shared/i18n';
import type { OwnShellState } from '../shared/shell';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createAppDockClient, type AppDockClient } from '../shared/appdock-api';
import { JsonLinePeer } from './core/rpc';
import type { Command, TrayItem, Panel, SettingOption } from '../shared/contracts';
export interface NodeCommandInvocation {
  signal: AbortSignal;
  session?: string;
  window?: string;
  source?: string;
}
type Handler = (invocation?: NodeCommandInvocation) => unknown | Promise<unknown>;
const execution = new AsyncLocalStorage<{ id?: string; invocation: NodeCommandInvocation }>();
const activeCommands = new Map<string, { session?: string; controller: AbortController }>();
const cancelledSessions = new Set<string>();
export interface NodeExtensionContext {
  registeredImages: {
    import(input: {
      filename?: string;
      base64: string;
    }): Promise<import('../shared/registered-images').RegisteredImageRef>;
    copyToCache(
      image: import('../shared/registered-images').RegisteredImageRef,
      variant?: 'original' | 'thumbnail',
    ): Promise<string>;
  };
  customCommands: {
    register(
      typeId: string,
      handler: (
        config: Record<string, unknown>,
        invocation: NodeCommandInvocation,
      ) => Promise<Record<string, unknown> | void>,
    ): Promise<void>;
  };
  ribbon: {
    setBadge(
      target: import('../shared/ribbon').RibbonBadgeTarget,
      badge: import('../shared/ribbon').RibbonBadge,
    ): Promise<unknown>;
  };
  shell: {
    getState(): Promise<OwnShellState>;
    onChanged(handler: (state: OwnShellState) => unknown | Promise<unknown>): () => void;
  };
  appdock: AppDockClient;
  pages: {
    open(id: string): Promise<unknown>;
    openItem(id: string): Promise<unknown>;
    hide(id: string): Promise<unknown>;
    dispose(id: string): Promise<unknown>;
    notifyChanged(id: string): Promise<{ accepted: true; delivered: boolean }>;
    registerImages(
      id: string,
      files: import('./core/page-images').PageImageFile[],
    ): Promise<{ images: import('./core/page-images').PageImageReference[] }>;
    releaseImages(id: string, imageIds: string[]): Promise<unknown>;
    list(): Promise<{
      revision: number;
      pages: import('../shared/dynamic-pages').DynamicPageDefinition[];
    }>;
    replace(
      pages: Omit<import('../shared/dynamic-pages').DynamicPageDefinition, 'openCommand'>[],
      expectedRevision: number,
    ): Promise<{ revision: number }>;
  };
  webProfiles: {
    list(): Promise<import('../shared/web-content').WebProfile[]>;
    add(name: string): Promise<unknown>;
    rename(id: string, name: string): Promise<unknown>;
    clear(id: string): Promise<unknown>;
    delete(id: string): Promise<unknown>;
  };
  images: { normalize(bytes: number[]): Promise<string> };
  webAccounts: {
    start(): Promise<unknown>;
    open(): Promise<unknown>;
    cycle(direction: 1 | -1): Promise<unknown>;
    navigate(action: 'back' | 'forward' | 'reload' | 'inbox'): Promise<unknown>;
    read(): Promise<
      import('../shared/web-accounts').WebAccountSnapshot & { acknowledged: string[] }
    >;
    report(id: string, status: string, attention: boolean, data?: unknown): Promise<unknown>;
  };
  commands: { register(id: string, title: string, handler: Handler): void };
  tray: { add(title: string, command: string): void; attention(active: boolean): Promise<unknown> };
  audio: { play(file?: string): Promise<unknown> };
  settings: {
    get<T>(key: string, fallback: T): T;
    set(key: string, value: unknown): Promise<unknown>;
    onChanged(handler: Handler): () => void;
    setOptions(key: string, options: SettingOption[]): Promise<unknown>;
  };
  notifications: {
    publish(
      input: import('../shared/notification-types').TypedNotificationInput,
    ): Promise<import('../shared/notification-types').NotificationPublishResult>;
    getPolicy(typeId: string): Promise<import('../shared/notification-types').NotificationPolicy>;
    end(notificationId: string, status?: 'resolved' | 'withdrawn'): Promise<unknown>;
    onChanged(handler: Handler): () => void;
    show(
      title: string,
      body: string,
      options?: { silent?: boolean; command?: string },
    ): Promise<unknown>;
  };
  ui: {
    openDetails(): Promise<unknown>;
    showPanel(panel: Panel): Promise<unknown>;
    getImageDirectory(): Promise<string>;
    pickFile(kind: 'json' | 'wav'): Promise<string | null>;
  };
  browser: { open(url: string): Promise<unknown> };
  log: {
    debug(message: string): Promise<unknown>;
    info(message: string): Promise<unknown>;
    error(message: string): Promise<unknown>;
  };
  scheduler: { every(milliseconds: number, callback: Handler): () => void };
  storage: {
    get(key: string, scope?: 'device' | 'shared' | 'memory'): Promise<unknown>;
    set(key: string, value: unknown, scope?: 'device' | 'shared' | 'memory'): Promise<unknown>;
  };
  secrets: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<unknown>;
    delete(key: string): Promise<unknown>;
  };
}
export interface NodeExtension {
  activate(context: NodeExtensionContext): Promise<void>;
  deactivate?(): Promise<void>;
  onPanelAction?(actionId: string): Promise<void>;
  onPageAction?(actionId: string, input: Record<string, unknown>, pageId: string): Promise<unknown>;
  onPageFileRemoved?(pageId: string, file: string): Promise<void>;
}
const commands: (Command & { handler: Handler })[] = [];
const customHandlers = new Map<
  string,
  (
    config: Record<string, unknown>,
    invocation: NodeCommandInvocation,
  ) => Promise<Record<string, unknown> | void>
>();
const tray: TrayItem[] = [];
const disposables: (() => void)[] = [];
let configuration: Record<string, unknown> = {};
let extension: NodeExtension;
let shellRevision = -1;
let shellChanges = Promise.resolve();
const shellHandlers = new Set<(state: OwnShellState) => unknown | Promise<unknown>>();
const settingsHandlers = new Set<Handler>();
const notificationHandlers = new Set<Handler>();
const peer = new JsonLinePeer(process.stdin, process.stdout, async (method, p) => {
  switch (method) {
    case 'activate': {
      configuration = p.settings;
      extension = require(process.argv[2]) as NodeExtension;
      const context: NodeExtensionContext = {
        customCommands: {
          register: async (typeId, handler) => {
            if (customHandlers.has(typeId) || typeof handler !== 'function')
              throw Error('Invalid custom handler');
            customHandlers.set(typeId, handler);
            try {
              await peer.request('host.customCommands.register', { typeId });
            } catch (error) {
              customHandlers.delete(typeId);
              throw error;
            }
          },
        },
        shell: {
          getState: async () => {
            const state = (await peer.request('host.shell.getState', {})) as OwnShellState;
            shellRevision = Math.max(shellRevision, state.revision);
            return state;
          },
          onChanged: (handler) => {
            shellHandlers.add(handler);
            const dispose = () => {
              shellHandlers.delete(handler);
            };
            disposables.push(dispose);
            return dispose;
          },
        },
        appdock: createAppDockClient((method, params) =>
          peer.request(method, {
            ...(params as object),
            ...(execution.getStore()?.id ? { executionId: execution.getStore()!.id } : {}),
          }),
        ),
        registeredImages: {
          import: (input) => {
            if (
              typeof input.base64 !== 'string' ||
              input.base64.length > 700000 ||
              Buffer.from(input.base64, 'base64').length > 512 * 1024
            )
              return Promise.reject(Error(hostText('services.nodeWorker.imageSizeLimit')));
            return peer.request('host.registeredImages.import', input) as Promise<
              import('../shared/registered-images').RegisteredImageRef
            >;
          },
          copyToCache: (image, variant = 'original') =>
            peer.request('host.registeredImages.copyToCache', {
              image,
              variant,
            }) as Promise<string>,
        },
        pages: {
          // Image bytes remain outside page state and ordinary settings messages.
          open: (id) => peer.request('host.pages.open', { id }),
          openItem: (id) => peer.request('host.pages.openItem', { id }),
          hide: (id) => peer.request('host.pages.hide', { id }),
          dispose: (id) => peer.request('host.pages.dispose', { id }),
          notifyChanged: (id) =>
            peer.request('host.pages.changed', { id }) as Promise<{
              accepted: true;
              delivered: boolean;
            }>,
          registerImages: (id, files) =>
            peer.request('host.pages.images.register', { id, files }) as Promise<{
              images: import('./core/page-images').PageImageReference[];
            }>,
          releaseImages: (id, imageIds) =>
            peer.request('host.pages.images.release', { id, imageIds }),
          list: () =>
            peer.request('host.pages.list', {}) as ReturnType<
              NodeExtensionContext['pages']['list']
            >,
          replace: (pages, expectedRevision) =>
            peer.request('host.pages.replace', { pages, expectedRevision }) as Promise<{
              revision: number;
            }>,
        },
        webProfiles: {
          list: () =>
            peer.request('host.webProfiles.list', {}) as Promise<
              import('../shared/web-content').WebProfile[]
            >,
          add: (name) => peer.request('host.webProfiles.add', { name }),
          rename: (id, name) => peer.request('host.webProfiles.rename', { id, name }),
          clear: (id) => peer.request('host.webProfiles.clear', { id }),
          delete: (id) => peer.request('host.webProfiles.delete', { id }),
        },
        images: {
          normalize: (bytes) => peer.request('host.images.normalize', { bytes }) as Promise<string>,
        },
        ribbon: {
          setBadge: (target, badge) => peer.request('host.ribbon.setBadge', { target, badge }),
        },
        webAccounts: {
          start: () => peer.request('host.webAccounts.start', {}),
          open: () => peer.request('host.webAccounts.open', {}),
          cycle: (direction) => peer.request('host.webAccounts.cycle', { direction }),
          navigate: (action) => peer.request('host.webAccounts.navigate', { action }),
          read: () =>
            peer.request('host.webAccounts.read', {}) as Promise<
              import('../shared/web-accounts').WebAccountSnapshot & { acknowledged: string[] }
            >,
          report: (id, status, attention, data) =>
            peer.request('host.webAccounts.report', { id, status, attention, data }),
        },
        commands: {
          register: (id, title, handler) => {
            if (commands.some((c) => c.id === id)) throw new Error('Duplicate command');
            commands.push({ id, title, handler });
          },
        },
        tray: {
          add: (title, command) => tray.push({ title, command }),
          attention: (active) => peer.request('host.tray.attention', { active }),
        },
        audio: { play: (file = '') => peer.request('host.audio.play', { file }) },
        settings: {
          get: (key, fallback) => (configuration[key] ?? fallback) as typeof fallback,
          set: async (key, value) => {
            await peer.request('host.settings.set', { key, value });
            configuration = { ...configuration, [key]: value };
          },
          onChanged: (handler) => {
            settingsHandlers.add(handler);
            const dispose = () => {
              settingsHandlers.delete(handler);
            };
            disposables.push(dispose);
            return dispose;
          },
          setOptions: (key, options) => peer.request('host.settings.options', { key, options }),
        },
        ui: {
          openDetails: () => peer.request('host.ui.openDetails', {}),
          pickFile: (kind) => peer.request('host.ui.pickFile', { kind }, 300000),
          showPanel: (panel) => peer.request('host.ui.panel', panel),
          getImageDirectory: () => peer.request('host.ui.imageDirectory', {}) as Promise<string>,
        },
        notifications: {
          publish: (input) => peer.request('host.notifications.publish', input),
          getPolicy: (typeId) => peer.request('host.notifications.policy', { typeId }),
          end: (notificationId, status = 'resolved') =>
            peer.request('host.notifications.end', { notificationId, status }),
          onChanged: (handler) => {
            notificationHandlers.add(handler);
            const stop = () => {
              notificationHandlers.delete(handler);
            };
            disposables.push(stop);
            return stop;
          },
          show: (title, body, options) =>
            peer.request('host.notifications.show', { title, body, ...options }),
        },
        browser: { open: (url) => peer.request('host.browser.open', { url }) },
        log: {
          debug: (message) => peer.request('host.log', { level: 'debug', message }),
          info: (message) => peer.request('host.log', { level: 'info', message }),
          error: (message) => peer.request('host.log', { level: 'error', message }),
        },
        storage: {
          get: (key, scope) => peer.request('host.storage.get', { key, scope }),
          set: (key, value, scope) => peer.request('host.storage.set', { key, value, scope }),
        },
        secrets: {
          get: (key) => peer.request('host.secrets.get', { key }),
          set: (key, value) => peer.request('host.secrets.set', { key, value }),
          delete: (key) => peer.request('host.secrets.delete', { key }),
        },
        scheduler: {
          every: (ms, callback) => {
            if (!Number.isFinite(ms) || ms < 1000)
              throw new Error('Scheduler interval must be >= 1000 ms');
            let busy = false;
            const timer = setInterval(async () => {
              if (busy) return;
              busy = true;
              try {
                await callback();
              } catch (e) {
                console.error(e);
              } finally {
                busy = false;
              }
            }, ms);
            const dispose = () => clearInterval(timer);
            disposables.push(dispose);
            return dispose;
          },
        },
      };
      await extension.activate(context);
      return { commands: commands.map(({ id, title }) => ({ id, title })), tray };
    }
    case 'customCommand.execute':
    case 'command.execute': {
      const custom = method === 'customCommand.execute' ? customHandlers.get(p.typeId) : undefined;
      const cmd = commands.find((c) => c.id === p.id);
      if (!cmd && !custom) throw new Error('Unknown command');
      const controller = new AbortController();
      const session = p.invocation?.session;
      const key = p.executionId ?? session ?? String(Math.random());
      activeCommands.set(key, { session, controller });
      if (session && cancelledSessions.has(session)) controller.abort();
      const invocation = { ...p.invocation, signal: controller.signal };
      try {
        return await execution.run({ id: p.executionId, invocation }, () =>
          custom ? custom(p.config, invocation) : cmd!.handler(invocation),
        );
      } finally {
        activeCommands.delete(key);
      }
    }
    case 'customCommand.cancel':
      activeCommands.get(p.executionId)?.controller.abort();
      return null;
    case 'command.cancel': {
      cancelledSessions.add(p.session);
      if (cancelledSessions.size > 256)
        cancelledSessions.delete(cancelledSessions.values().next().value!);
      // The host independently cancels pending native input using its trusted context.
      for (const entry of activeCommands.values())
        if (entry.session === p.session) entry.controller.abort();
      return null;
    }
    case 'page.action':
      if (!extension?.onPageAction)
        throw Error(hostText('services.nodeWorker.pageActionUnsupported'));
      return extension.onPageAction(p.id, p.input, p.pageId);
    case 'page.fileRemoved':
      await extension?.onPageFileRemoved?.(p.pageId, p.file);
      return null;
    case 'panel.action':
      if (!extension?.onPanelAction) throw new Error('Panel actions are not supported.');
      await extension.onPanelAction(p.id);
      return null;
    case 'shell.changed':
      shellChanges = shellChanges
        .catch(() => {})
        .then(async () => {
          if (p.revision > shellRevision) {
            shellRevision = p.revision;
            for (const handler of shellHandlers) await handler(p);
          }
        });
      await shellChanges;
      return null;
    case 'notifications.changed':
      for (const handler of notificationHandlers) await handler();
      return null;
    case 'settings.changed': {
      const changed = JSON.stringify(configuration) !== JSON.stringify(p);
      configuration = p;
      if (changed) for (const handler of settingsHandlers) await handler();
      return null;
    }
    case 'deactivate':
      for (const entry of activeCommands.values()) entry.controller.abort();
      disposables.forEach((d) => d());
      await extension?.deactivate?.();
      setImmediate(() => process.exit(0));
      return null;
    default:
      throw new Error(`Unknown method: ${method}`);
  }
});
// stdout is reserved for the wire protocol.
console.log = console.error;
peer.on('closed', () => {
  disposables.forEach((d) => d());
  process.exit(0);
});
peer.on('protocolError', (e) => console.error(e));
