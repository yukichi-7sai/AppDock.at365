import { hostText } from '../../shared/i18n';
import type { InputInvocation } from './command-contexts';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { isObject, SettingsConflictError } from './settings';
import { AppDockApi, AutomationError, automationMethods } from './appdock-api';
import type { AppletApiPermissions, AppDockReply } from '../../shared/appdock-api';
import type { ExtensionInstance } from './extensions';
import type { DeviceSettingsStore } from './device-settings-store';

export class AppletApiAccess {
  constructor(private settings: DeviceSettingsStore) {}
  get error() {
    return this.settings.operationPermissionsError;
  }
  get(applet?: { capabilities?: string[] }): AppletApiPermissions {
    if (applet && !applet.capabilities?.includes('appdock-api')) return {};
    return { ...this.settings.operationPermissions().applet };
  }
  set(value: unknown, before?: unknown) {
    if (before !== undefined && !isDeepStrictEqual(before, this.get()))
      throw new SettingsConflictError(hostText('services.settings.changedBeforeSave'));
    this.settings.saveOperationPermissions({ applet: value });
  }
}

export async function callAppletApi(
  api: AppDockApi,
  applet: ExtensionInstance,
  request: unknown,
  audit: (level: string, source: string, message: string) => void,
  invocation?: (executionId: unknown) => InputInvocation,
): Promise<AppDockReply> {
  const method =
    isObject(request) &&
    typeof request.method === 'string' &&
    (automationMethods as readonly string[]).includes(request.method)
      ? request.method
      : 'unknown';
  const context = `[Applet API] API=${method} requestId=${randomUUID()}`;
  const started = Date.now();
  try {
    if (
      !isObject(request) ||
      Object.keys(request).some((k) => !['method', 'params', 'executionId'].includes(k)) ||
      method === 'unknown'
    )
      throw new AutomationError('INVALID_ARGUMENT', hostText('services.appletApiAccess.arguments'));
    if (!applet.manifest.capabilities?.includes('appdock-api'))
      throw new AutomationError(
        'CAPABILITY_REQUIRED',
        hostText('services.appletApiAccess.capability'),
      );
    if (!['starting', 'running'].includes(applet.state))
      throw new AutomationError('UNAVAILABLE', hostText('services.appletApiAccess.stopped'));
    audit('info', applet.manifest.id, `${context} result=started`);
    const value = await api.call(
      method,
      request.params ?? {},
      applet.manifest.id,
      invocation?.(request.executionId),
    );
    audit(
      'info',
      applet.manifest.id,
      `${context} result=success durationMs=${Date.now() - started}`,
    );
    return { ok: true, value };
  } catch (error) {
    const result =
      error instanceof AutomationError
        ? { code: error.code, message: error.message }
        : { code: 'INTERNAL_ERROR', message: hostText('services.appletApiAccess.failed') };
    audit(
      'warn',
      applet.manifest.id,
      `${context} result=failed code=${result.code} durationMs=${Date.now() - started}`,
    );
    return { ok: false, error: result };
  }
}
