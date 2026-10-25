import { hostText } from '../../shared/i18n';
import type { InputInvocation } from './command-contexts';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicWrite, isObject } from './settings';
import { AppDockApi, AutomationError, automationMethods } from './appdock-api';
import {
  appletApiPermissionLabels,
  retiredAppletApiPermissions,
  type AppletApiPermissions,
  type AppDockReply,
} from '../../shared/appdock-api';
import type { ExtensionInstance } from './extensions';

function permissions(value: unknown, legacy = false): AppletApiPermissions {
  if (
    !isObject(value) ||
    Object.entries(value).some(
      ([k, v]) =>
        (!Object.hasOwn(appletApiPermissionLabels, k) &&
          !(legacy && (retiredAppletApiPermissions as readonly string[]).includes(k))) ||
        typeof v !== 'boolean',
    )
  )
    throw Error(hostText('services.appletApiAccess.invalidPermissions'));
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => Object.hasOwn(appletApiPermissionLabels, key)),
  );
}
export class AppletApiAccess {
  private grants: AppletApiPermissions = {};
  error?: string;
  constructor(private file: string) {
    try {
      let stat: fs.Stats;
      try {
        stat = fs.statSync(file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        this.grants = Object.fromEntries(
          Object.keys(appletApiPermissionLabels).map((key) => [
            key,
            ![
              'useTts',
              'useAi',
              'useMcp',
              'manageCustomCommands',
              'manageMcpServers',
              'runProcesses',
            ].includes(key),
          ]),
        );
        return;
      }
      if (stat.size > 262144) throw Error();
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      // Existing per-Applet grants are not broadened to every installed Applet.
      if (saved.version === 1 && isObject(saved.grants)) return;
      if (saved.version !== 2) throw Error();
      this.grants = permissions(saved.permissions, true);
    } catch {
      this.error = hostText('services.appletApiAccess.readFailed');
    }
  }
  get(applet?: { capabilities?: string[] }): AppletApiPermissions {
    if (this.error || (applet && !applet.capabilities?.includes('appdock-api'))) return {};
    return { ...this.grants };
  }
  set(value: unknown) {
    if (this.error) throw Error(this.error);
    const next = permissions(value);
    atomicWrite(this.file, JSON.stringify({ version: 2, permissions: next }, null, 2) + '\n');
    this.grants = next;
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
