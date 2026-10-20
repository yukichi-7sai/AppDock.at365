import type { Settings } from './contracts';

export const defaultAppletEnabled = true;

export const appletEnabled = (settings: Pick<Settings, 'extensions'>, id: string) =>
  settings.extensions[id]?.enabled ?? defaultAppletEnabled;
