import type { Settings } from '../../shared/contracts';
import { hostText } from '../../shared/i18n';
import { hostSettingItem } from '../../shared/settings-catalog';
import { sameSetting } from '../../shared/settings-defaults';
import { createDefaultSettings } from '../../shared/settings-schema';
import { SettingsConflictError, type SettingsStore } from './settings';
import { SettingsCommandError } from './settings-commands';
import { SettingsTargetError, type SettingsFieldTarget } from './settings-target-types';
import { WindowsOperationCancelled, type WindowsLaunch } from './windows-launch';

const keys = ['startAtLogon', 'runAsAdministrator'] as const;
type Key = (typeof keys)[number];
const project = (value: Settings) => Object.fromEntries(keys.map((key) => [key, value.host[key]]));
const failure = (code: string, message: string): never => {
  throw new SettingsTargetError(code, message);
};
export function launchSettingsTarget(options: {
  settings: SettingsStore;
  launch: WindowsLaunch;
  checkRevision(revision: string): void;
  validate(value: Settings): Settings;
  save(value: Settings, revision: number, rewrite: ('shared' | 'device')[]): unknown;
  assertWritable?(): void;
}): SettingsFieldTarget {
  const { settings, launch } = options,
    defaults = createDefaultSettings().host;
  const available = launch.state.supported && !launch.recoveryPending;
  const administratorAccount = launch.administratorAccount;
  const canElevate = launch.state.elevated || administratorAccount !== false;
  const overrides = () => {
    try {
      const raw = settings.storedSettingOverrides('appdock');
      return Object.fromEntries(
        keys.filter((key) => Object.hasOwn(raw, key)).map((key) => [key, raw[key]]),
      );
    } catch {
      return undefined;
    }
  };
  const applies = (key: string) =>
    key === 'runAsAdministrator' ? 'nextStartAndLogonTask' : 'logonTaskRegistration';
  const check = (revision: string, busy: boolean) => {
    if (!launch.state.supported) failure('UNAVAILABLE', hostText('launch.errors.packagedOnly'));
    if (launch.recoveryPending)
      failure('LOCAL_ACTION_REQUIRED', hostText('launch.errors.recoveryPending'));
    if (busy && launch.isBusy) failure('BUSY', hostText('launch.errors.busySave'));
    try {
      options.assertWritable?.();
    } catch {
      failure('BUSY', hostText('services.index.settingsRestoring'));
    }
    try {
      options.checkRevision(revision);
    } catch (error) {
      if (error instanceof SettingsCommandError || error instanceof SettingsConflictError)
        failure('REVISION_CONFLICT', hostText('services.settingsCommands.refreshChanges'));
      throw error;
    }
  };
  return {
    targetId: 'service.launch',
    ownerId: 'appdock',
    title: hostText('general.startup.section'),
    category: 'launch',
    available,
    fields: keys.map((key) => ({
      key,
      title: hostSettingItem('general', key).title,
      type: 'boolean',
      default: defaults[key],
    })),
    values: () => project(settings.value),
    overrides,
    writable: () => available,
    resettable: () => true,
    inheritable: () => true,
    inputSchema: (field) => ({
      type: 'boolean',
      ...(field.key === 'runAsAdministrator' && !canElevate ? { enum: [false] } : {}),
    }),
    schemaContext: () => ({
      supported: launch.state.supported,
      administratorAccount: administratorAccount ?? null,
      elevated: launch.state.elevated,
      recoveryPending: launch.recoveryPending,
    }),
    applies,
    plan: (changes, reset, revision) => {
      check(revision, true);
      const before = project(settings.value),
        original = overrides(),
        next = structuredClone(settings.value),
        storedRevision = settings.revision;
      const touched = [...new Set([...Object.keys(changes), ...reset])];
      for (const key of touched) {
        if (!keys.includes(key as Key))
          failure('NOT_FOUND', hostText('services.settingsTargets.notFound'));
        const value = reset.includes(key) ? defaults[key as Key] : changes[key];
        if (typeof value !== 'boolean')
          return failure('INVALID_ARGUMENT', hostText('services.settingsTargets.invalid'));
        next.host[key as Key] = value;
      }
      if (
        next.host.runAsAdministrator &&
        !canElevate &&
        (!settings.value.host.runAsAdministrator || next.host.startAtLogon)
      )
        failure('UNAVAILABLE', hostText('launch.errors.notAdministrator'));
      let candidate: Settings;
      try {
        candidate = options.validate(next);
      } catch {
        return failure('INVALID_ARGUMENT', hostText('services.settingsTargets.invalid'));
      }
      const after = project(candidate),
        desired = original === undefined ? undefined : { ...original };
      const changed = touched.filter(
        (key) =>
          !sameSetting(before[key], after[key]) ||
          (original !== undefined &&
            Object.hasOwn(original, key) &&
            (reset.includes(key) || after[key] === defaults[key as Key])),
      );
      if (desired)
        for (const key of touched) {
          if (reset.includes(key) || after[key] === defaults[key as Key]) delete desired[key];
          else desired[key] = after[key];
        }
      return {
        changed,
        before,
        values: after,
        overrides: desired,
        applies: Object.fromEntries(changed.map((key) => [key, applies(key)])),
        commit: async (preflight) => {
          check(revision, true);
          if (!changed.length) return;
          const guard = () => {
            check(revision, false);
            preflight?.();
          };
          let saving = false;
          try {
            await launch.save(candidate.host, settings.value.host, guard, () => {
              guard();
              saving = true;
              try {
                options.save(candidate, storedRevision, ['device']);
              } catch (error) {
                if (error instanceof SettingsConflictError)
                  failure(
                    'REVISION_CONFLICT',
                    hostText('services.settingsCommands.refreshChanges'),
                  );
                failure('SAVE_FAILED', hostText('services.settingsCommands.saveFailed'));
              }
            });
          } catch (error) {
            if (launch.recoveryPending)
              failure('LOCAL_ACTION_REQUIRED', hostText('launch.errors.recoveryPending'));
            if (error instanceof SettingsTargetError) throw error;
            if (error instanceof WindowsOperationCancelled)
              failure('CANCELLED', hostText('services.settingsTargets.launchCancelled'));
            failure(
              saving ? 'SAVE_FAILED' : 'APPLY_FAILED',
              hostText('services.settingsTargets.launchFailed'),
            );
          }
        },
      };
    },
  };
}
