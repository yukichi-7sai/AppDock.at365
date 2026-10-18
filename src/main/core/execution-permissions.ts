import type { AppletApiPermissions } from '../../shared/appdock-api';
import type { InputInvocation } from './command-contexts';

export type ExecutionPermission = 'sendInput' | 'runProcesses';
export function executionAuthorized(
  permission: ExecutionPermission,
  context: InputInvocation,
  grants: (actor: NonNullable<InputInvocation['apiCaller']>) => AppletApiPermissions,
) {
  return [context.apiCaller, context.origin].every((actor) => {
    if (!actor || actor.kind === 'local') return true;
    const p = grants(actor.kind === 'applet' ? actor : { kind: 'mcp' });
    return p.read === true && p.execute === true && p[permission] === true;
  });
}
