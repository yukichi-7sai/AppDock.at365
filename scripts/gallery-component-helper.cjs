const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

exports.galleryComponentBundleUrl = (profile) =>
  pathToFileURL(path.join(profile, 'gallery-component/image-gallery.js')).href;

/** Exercise renderer source in a test-only bundle; no Applet distribution is built. */
exports.galleryComponentPage = async (app, host, profile) => {
  const root = path.resolve(__dirname, '..');
  const output = path.join(profile, 'gallery-component');
  const { build } = await import('vite');
  // Component-only fixture: use the real base dictionary without a host preload.
  const translations = path.join(profile, 'gallery-translations.mjs');
  fs.writeFileSync(
    translations,
    `export const hostResources = ${JSON.stringify({ ja: require('../resources/translations/host.json') })}; export const readHostLanguage = () => 'ja';`,
  );
  await build({
    configFile: false,
    resolve: { alias: { '#host-translations': translations } },
    build: {
      outDir: output,
      emptyOutDir: true,
      lib: {
        entry: path.join(root, 'src/renderer/image-gallery/index.ts'),
        formats: ['es'],
        fileName: () => 'image-gallery.js',
      },
    },
  });
  fs.copyFileSync(
    path.join(root, 'src/renderer/image-gallery/gallery.css'),
    path.join(output, 'gallery.css'),
  );
  const fixture = path.join(profile, 'gallery-component.html');
  const stylesheet = pathToFileURL(path.join(output, 'gallery.css')).href;
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
