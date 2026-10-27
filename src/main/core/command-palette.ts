import { hostText } from '../../shared/i18n';
import { randomUUID } from 'node:crypto';
import { movePinnedCommand, validCommandId, type UiCommand } from '../../shared/commands';
import type {
  CommandPaletteRequest,
  CommandPaletteResult,
  OverlayAction,
  OverlayModel,
} from '../../shared/overlays';

import type { OverlayController } from './overlay-controller';
export class CommandPaletteSession implements OverlayController {
  readonly id = randomUUID();
  readonly kind = 'command-palette';
  readonly result: Promise<CommandPaletteResult>;
  private resolve!: (result: CommandPaletteResult) => void;
  private closed = false;
  private closedCallback = () => {};
  private busy = false;
  private error = '';
  private revision = 0;
  private signature = '';
  constructor(
    readonly request: CommandPaletteRequest,
    private options: {
      commands(): UiCommand[];
      pins(): string[];
      shortcuts(): Record<string, string[]>;
      dark(): boolean;
      savePins(ids: string[]): void;
      execute(id: string): Promise<unknown>;
      changed(): void;
    },
  ) {
    if (
      !request ||
      !['execute', 'select'].includes(request.mode) ||
      typeof request.requestId !== 'string' ||
      !/^[a-zA-Z0-9-]{1,100}$/.test(request.requestId)
    )
      throw Error('Invalid palette request');
    for (const ids of [request.commandIds, request.pins])
      if (
        ids !== undefined &&
        (!Array.isArray(ids) || ids.length > 10000 || !ids.every(validCommandId))
      )
        throw Error('Invalid palette commands');
    if (
      request.shortcuts !== undefined &&
      (!request.shortcuts ||
        typeof request.shortcuts !== 'object' ||
        Array.isArray(request.shortcuts) ||
        Object.entries(request.shortcuts).some(
          ([id, keys]) =>
            !validCommandId(id) ||
            !Array.isArray(keys) ||
            keys.length > 100 ||
            keys.some((key) => typeof key !== 'string' || key.length > 80),
        ))
    )
      throw Error('Invalid palette shortcuts');
    this.result = new Promise((resolve) => {
      this.resolve = resolve;
    });
  }
  private commands() {
    const catalog = this.options.commands();
    const allowed =
      this.request.mode === 'select' && this.request.commandIds
        ? new Set(this.request.commandIds)
        : undefined;
    const known = allowed ? new Set(catalog.map((command) => command.id)) : undefined;
    const missing =
      this.request.mode === 'select'
        ? (this.request.commandIds ?? [])
            .filter((id) => !known?.has(id))
            .map((id) => ({
              id,
              title: id,
              extension: hostText('services.commandPalette.unverifiedCommand'),
              available: false,
            }))
        : [];
    return [...catalog, ...missing].filter(
      (c) => !('hidden' in c && c.hidden) && (!allowed || allowed.has(c.id)),
    );
  }
  snapshot(): import('../../shared/overlays').CommandPaletteModel {
    const body = {
      dark: this.options.dark(),
      content: {
        mode: this.request.mode,
        commands: this.commands(),
        pins:
          this.request.mode === 'select'
            ? (this.request.pins ?? this.options.pins())
            : this.options.pins(),
        shortcuts:
          this.request.mode === 'select'
            ? (this.request.shortcuts ?? this.options.shortcuts())
            : this.options.shortcuts(),
        busy: this.busy,
        error: this.error,
      },
    };
    const signature = JSON.stringify(body);
    if (signature !== this.signature) {
      this.signature = signature;
      this.revision++;
    }
    return {
      schemaVersion: 1,
      id: this.id,
      contextId: 'primary',
      kind: this.kind,
      modal: true,
      revision: this.revision,
      ...body,
    };
  }
  onClosed(callback: () => void) {
    this.closedCallback = callback;
  }
  private finish(result: CommandPaletteResult) {
    if (this.closed) return;
    this.closed = true;
    this.resolve(result);
    this.closedCallback();
  }
  cancel(reason: string) {
    this.finish({ status: 'cancelled', reason });
  }
  async act(action: OverlayAction) {
    if (this.closed || !action || action.id !== this.id) throw Error('Stale overlay request');
    if (action.type === 'ribbonChoose') throw Error('Unknown overlay action');
    if (action.type === 'dismiss') {
      this.cancel('dismissed');
      return;
    }
    if (this.busy) throw Error('Overlay operation in progress');
    if (!['choose', 'togglePin', 'movePin'].includes(action.type))
      throw Error('Unknown overlay action');
    const command = this.commands().find((c) => c.id === action.commandId);
    if (!command) throw Error('Command is no longer in this palette');
    this.error = '';
    if (action.type !== 'choose') {
      if (this.request.mode !== 'execute') throw Error('Selection cannot change saved pins');
      const pins = this.options.pins();
      if (
        action.type === 'movePin' &&
        (![-1, 1].includes(action.direction) ||
          !Array.isArray(action.visibleIds) ||
          action.visibleIds.some((id) => !pins.includes(id)))
      )
        throw Error('Invalid pin movement');
      const next =
        action.type === 'togglePin'
          ? pins.includes(command.id)
            ? pins.filter((id) => id !== command.id)
            : [...pins, command.id]
          : movePinnedCommand(pins, command.id, action.direction, action.visibleIds);
      this.options.savePins(next);
      this.options.changed();
      return;
    }
    if (this.request.mode === 'select') {
      this.finish({ status: 'selected', commandId: command.id });
      return;
    }
    if (!command.available) throw Error('Command is unavailable');
    this.busy = true;
    this.options.changed();
    try {
      await this.options.execute(command.id);
      this.finish({ status: 'executed', commandId: command.id });
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.busy = false;
      this.options.changed();
    }
  }
}
