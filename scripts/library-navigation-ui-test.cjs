const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { isolatedHost } = require('./data-settings-host.cjs');
const { wave } = require('./sound-library-fixture.cjs');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const { hostText } = require('../out/main/shared/i18n');

const profile = fs.mkdtempSync(path.resolve(__dirname, '../.artifacts/library-navigation-ui-'));
const images = path.join(profile, 'data/assets/images');
const sounds = path.join(profile, 'data/assets/sounds');
const svg = (shade) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="rgb(${shade},60,120)"/></svg>`;
for (const dir of [images, sounds]) fs.mkdirSync(dir, { recursive: true });
for (let i = 0; i < 8; i++) {
  fs.writeFileSync(path.join(images, i + '.svg'), svg(i));
  fs.writeFileSync(path.join(sounds, i + '.wav'), wave(1500, i));
}
const settings = createDefaultSettings();
Object.assign(settings.host, { closeToTray: false, startMinimized: false, soundEnabled: false });
Object.assign(settings.updates, {
  checkHostOnStartup: false,
  checkHostOnAboutOpen: false,
  checkAppletsOnStartup: false,
});
settings.globalShortcutCommands = [];
settings.keybindings = [];
settings.gestures.enabled = settings.touchpadGestures.enabled = false;
settings.keybindingDefaultsInitialized = settings.gestureDefaultsInitialized = [
  'appdock.default-shell',
];
fs.writeFileSync(require('./test-settings.cjs').file(profile), JSON.stringify(settings));
const app = isolatedHost(profile, process.argv[2]);
const result = { profile, executableHash: app.executableHash, earlyExits: {} };
const pageErrors = () =>
  fs
    .readFileSync(path.join(profile, 'data/logs', os.hostname(), 'host.log'), 'utf8')
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line))
    .filter((row) => row.level === 'error' && row.message.startsWith('dock:pages:act:'))
    .map((row) => row.message);

async function leaveDuringRender(host, route, selector) {
  await host.evaluate(
    async ({ route, selector }) => {
      const leave = new Promise((resolve, reject) => {
        const observer = new MutationObserver(() => {
          if (!document.querySelector(`.host-page-slot[data-page="${route}"] ${selector}`)) return;
          observer.disconnect();
          clearTimeout(timer);
          resolve(window.dock.navigate('settings'));
        });
        const timer = setTimeout(() => {
          observer.disconnect();
          reject(Error('Gallery did not reach ' + selector));
        }, 10000);
        observer.observe(document.body, { subtree: true, childList: true, attributes: true });
      });
      await Promise.all([leave, window.dock.navigate(route)]);
    },
    { route, selector },
  );
  await host.waitForFunction(() => !document.querySelector('.library-page'));
}

async function run() {
  try {
    const host = await app.start();
    for (const route of ['image-library', 'sound-library']) {
      result.earlyExits[route] = 0;
      for (let i = 0; i < 6; i++) {
        await leaveDuringRender(
          host,
          route,
          i % 2 ? '.ad-gallery-card' : '.ad-gallery-status[data-state="loading"]',
        );
        result.earlyExits[route]++;
      }
      await host.evaluate((route) => window.dock.navigate(route), route);
      await host.waitForFunction(() =>
        [...document.querySelectorAll('.ad-gallery-image img[src]')].some(
          (img) => img.complete && img.naturalWidth,
        ),
      );
      const previous = await host.evaluate(async () => {
        const page = await window.dock.pages.get();
        return { id: page.id, assetId: page.content.items[0].assetId };
      });
      await host.evaluate(() => window.dock.navigate('settings'));
      await host.waitForFunction(() => !document.querySelector('.library-page'));
      await assert.rejects(
        host.evaluate(
          (target) =>
            window.dock.pages.act({ ...target, type: 'gallery', command: 'image', edge: 512 }),
          previous,
        ),
        /stale/,
      );
    }
    for (let i = 0; i < 8; i++) {
      assert.equal(fs.readFileSync(path.join(images, i + '.svg'), 'utf8'), svg(i));
      assert.deepEqual(fs.readFileSync(path.join(sounds, i + '.wav')), wave(1500, i));
    }
    result.filesIntact = 16;
    await host.evaluate(() => window.dock.navigate('image-library'));
    await host.waitForFunction(() => !!document.querySelector('.ad-gallery-image img[src]'));
    result.navigationErrors = pageErrors();
    assert.deepEqual(result.navigationErrors, []);

    // Replace a real original while its page remains open, then request its previous thumbnail.
    const old = await host.evaluate(() => window.dock.pages.get());
    const target = old.content.items.find((item) => item.title === '7.svg');
    fs.writeFileSync(path.join(images, '7.svg'), svg(240));
    await host.waitForFunction(
      async ({ id, assetId }) => {
        const page = await window.dock.pages.get(id);
        return page.content.items.some(
          (item) => item.title === '7.svg' && item.assetId !== assetId,
        );
      },
      { id: old.id, assetId: target.assetId },
    );
    const errorsBefore = pageErrors().length;
    await assert.rejects(
      host.evaluate(
        ({ id, assetId }) =>
          window.dock.pages.act({ id, type: 'gallery', command: 'image', assetId, edge: 512 }),
        { id: old.id, assetId: target.assetId },
      ),
    );
    const errors = pageErrors().slice(errorsBefore);
    assert.deepEqual(errors, ['dock:pages:act: ' + hostText('services.imageLibraryPage.missing')]);
    result.replacedFileError = errors[0];
    result.success = true;
  } finally {
    await app.close();
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
