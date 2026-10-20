import { WebContentsView } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { appearanceArguments, registerAppearance } from './appearance-host';

/** Same local-file boundary for built-in and external presentation surfaces. */
export function createShellView(
  folder: string,
  entry: string,
  preload: string,
  additionalArguments: string[] = [],
) {
  const file = fs.realpathSync(path.resolve(folder, entry));
  const relative = path.relative(fs.realpathSync(folder), file);
  if (relative.startsWith('..') || path.isAbsolute(relative))
    throw Error('Shell UI is outside provider');
  const view = new WebContentsView({
    webPreferences: {
      preload,
      additionalArguments: [...additionalArguments, ...appearanceArguments()],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  view.setVisible(false);
  view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  view.webContents.on('will-navigate', (event) => event.preventDefault());
  view.webContents.on('will-redirect', (event) => event.preventDefault());
  const url = pathToFileURL(file).href;
  registerAppearance(view.webContents, url);
  return { view, url };
}
