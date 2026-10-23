import { hostText } from '../../shared/i18n';
import path from 'node:path';
import { createHash } from 'node:crypto';

/** No roster or asset-ID database: local state is isolated by the EXE placement. */
export function dataPaths(base: string, localAppData: string, isolatedLocal?: string) {
  const shared = path.join(path.resolve(base), 'data');
  if (!path.isAbsolute(localAppData))
    throw Error(hostText('services.dataPaths.invalidLocalAppData'));
  const id = createHash('sha256').update(path.resolve(base).toLowerCase()).digest('hex');
  return {
    shared,
    local: isolatedLocal
      ? path.resolve(isolatedLocal)
      : path.join(localAppData, 'at365', 'AppDock', 'profiles', id),
    assets: path.join(shared, 'assets'),
  };
}
