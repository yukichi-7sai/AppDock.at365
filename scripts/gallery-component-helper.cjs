const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

/** Run the distributable gallery bundle in an isolated local fixture document. */
exports.galleryComponentPage = async (app, host, profile) => {
  const appPath = await app.evaluate(({ app }) => app.getAppPath());
  const fixture = path.join(profile, 'gallery-component.html');
  const stylesheet = pathToFileURL(path.join(appPath, 'out/ui/image-gallery/gallery.css')).href;
  fs.writeFileSync(
    fixture,
    `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="${stylesheet}"><body></body>`,
  );
  const opened = host.context().waitForEvent('page');
  const [page] = await Promise.all([
    opened,
    app.evaluate(async ({ BrowserWindow }, fixture) => {
      const window = new BrowserWindow({
        show: false,
        width: 1100,
        height: 850,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          backgroundThrottling: false,
        },
      });
      await window.loadFile(fixture);
    }, fixture),
  ]);
  const url = pathToFileURL(fixture).href;
  await page.waitForURL(url);
  return page;
};
