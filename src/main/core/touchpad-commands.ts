import { hostText } from '../../shared/i18n';
import type { Settings, SettingsSnapshot } from '../../shared/contracts';
import {
  defaultTouchpadGestures,
  touchpadGestureTypes,
  touchpadId,
  type TouchpadGestureId,
} from '../../shared/touchpad-gestures';
import type { AutomationCommand } from './automation-commands';
import type { SettingsStore } from './settings';
import { SettingsCommands, SettingsCommandError } from './settings-commands';

export const touchpadBridgeCommands: AutomationCommand[] = [
  'set-enabled',
  'reconnect',
  'clear',
].map((kind) => ({
  id: 'appdock.touchpadGestures.' + kind,
  title:
    kind === 'set-enabled'
      ? hostText('services.touchpadCommands.toggleTitle')
      : kind === 'reconnect'
        ? hostText('services.touchpadCommands.reconnectTitle')
        : hostText('services.touchpadCommands.clearTitle'),
  description:
    kind === 'set-enabled'
      ? 'このPCをONにし、未接続の割り当てがあればWindowsを変更します。OFFではWindowsを変更しません。'
      : kind === 'reconnect'
        ? '指定ジェスチャーのWindows設定を現在の希望キーで上書きします。'
        : '指定ジェスチャーのAppDock割り当てを全部削除します。Windowsは変更しません。',
  appletId: null,
  available: true,
  unavailableReason: null,
  permission: 'touchpadGestures.write',
  completion: 'settingsSaved',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      expectedRevision: { type: 'string' },
      dryRun: { type: 'boolean' },
      ...(kind === 'set-enabled'
        ? { enabled: { type: 'boolean' } }
        : { gesture: { type: 'string', enum: touchpadGestureTypes.map(([id]) => id) } }),
    },
    required: ['expectedRevision', kind === 'set-enabled' ? 'enabled' : 'gesture'],
  },
}));
export async function executeTouchpadBridgeCommand(
  id: string,
  args: Record<string, unknown>,
  options: {
    settings: SettingsStore;
    settingsCommands: SettingsCommands;
    save(value: Settings, revision: number): SettingsSnapshot;
    touchpadBridge?: {
      snapshot(): unknown;
      connect(ids: TouchpadGestureId[]): Promise<unknown>;
      afterLocalEdit(before: Settings): Promise<unknown>;
    };
  },
) {
  const kind = id.split('.').at(-1);
  const validKeys = ['expectedRevision', 'dryRun', kind === 'set-enabled' ? 'enabled' : 'gesture'];
  if (
    !['set-enabled', 'reconnect', 'clear'].includes(kind ?? '') ||
    Object.keys(args).some((key) => !validKeys.includes(key)) ||
    typeof args.expectedRevision !== 'string' ||
    (args.dryRun !== undefined && typeof args.dryRun !== 'boolean') ||
    (kind === 'set-enabled' && typeof args.enabled !== 'boolean')
  )
    throw new SettingsCommandError(
      'INVALID_ARGUMENT',
      hostText('services.touchpadCommands.invalidArguments'),
    );
  options.settingsCommands.checkRevision(args.expectedRevision);
  const before = structuredClone(options.settings.value);
  const current = before.touchpadGestures ?? defaultTouchpadGestures();
  const gesture = kind === 'set-enabled' ? undefined : touchpadId(args.gesture);
  const next =
    kind === 'set-enabled'
      ? { ...current, enabled: args.enabled as boolean }
      : kind === 'clear'
        ? { ...current, bindings: current.bindings.filter((row) => row.gesture !== gesture) }
        : current;
  if (
    kind === 'reconnect' &&
    (!current.enabled || !current.bindings.some((row) => row.gesture === gesture))
  )
    throw new SettingsCommandError(
      'INVALID_ARGUMENT',
      hostText('services.touchpadCommands.assignedGestureRequired'),
    );
  const changed = JSON.stringify(current) !== JSON.stringify(next);
  if (args.dryRun !== true) {
    if (changed) options.save({ ...before, touchpadGestures: next }, options.settings.revision);
    if (kind === 'reconnect' || kind === 'set-enabled') {
      if (!options.touchpadBridge)
        throw new SettingsCommandError('NOT_READY', hostText('services.touchpadCommands.notReady'));
      if (kind === 'reconnect') await options.touchpadBridge.connect([gesture!]);
      else await options.touchpadBridge.afterLocalEdit(before);
    }
  }
  return {
    dryRun: args.dryRun === true,
    changed,
    completion: args.dryRun ? 'validated' : 'settingsSaved',
    effectVerified: false,
    revision: options.settingsCommands.revision(),
    state: options.touchpadBridge?.snapshot(),
    message: hostText('services.touchpadCommands.resultEffect'),
  };
}
