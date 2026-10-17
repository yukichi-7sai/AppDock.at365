const { settleSettings } = require('./settings-immediate-helper.cjs');
const { settingsPage: getSettingsPage } = require('./settings-host-helper.cjs');
const { _electron: electron, chromium } = require('playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  net = require('node:net');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `shell-home-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.hardwareAcceleration = false;
settings.host.closeToTray = false;
settings.globalShortcutCommands = [];
const external = path.join(profile, 'extensions', 'fixture-shell');
fs.cpSync(path.join(root, 'out/shells/default'), external, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(external, 'extension.json')));
manifest.id = 'fixture.home';
manifest.name = 'Fixture Home';
manifest.shell = { apiVersion: 1, views: { 'page.home': 'home.html' } };
manifest.capabilities.push('settings');
manifest.minimumHostVersion = require('../package.json').version;
manifest.settings = [{ key: 'compact', title: 'Compact', type: 'boolean', default: false }];
manifest.commands = [
  { id: 'fixture.home.write', title: 'Run slow' },
  { id: 'fixture.home.mark', title: 'Mark' },
  { id: 'fixture.home.fail', title: 'Fail' },
];
fs.writeFileSync(path.join(external, 'extension.json'), JSON.stringify(manifest));
fs.writeFileSync(
  path.join(external, 'worker.cjs'),
  `exports.activate=async c=>{c.commands.register('fixture.home.write','Run slow',async()=>{await new Promise(r=>setTimeout(r,1600));await c.log.info('Home command completed');});c.commands.register('fixture.home.mark','Mark',async()=>c.settings.set('compact',true));c.commands.register('fixture.home.fail','Fail',async()=>{throw Error('Home fixture error')});};`,
);
settings.extensions[manifest.id] = { enabled: true, settings: {} };
const stalled = path.join(profile, 'extensions', 'stalled');
fs.mkdirSync(stalled, { recursive: true });
fs.writeFileSync(
  path.join(stalled, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'fixture.stalled',
    name: 'Stalled',
    version: '1.0.0',
    runtime: 'node',
    entry: 'worker.cjs',
    capabilities: ['shell'],
    shell: { apiVersion: 1, views: { 'page.home': 'home.html' } },
  }),
);
fs.writeFileSync(path.join(stalled, 'worker.cjs'), 'exports.activate=async()=>{};');
fs.writeFileSync(path.join(stalled, 'home.html'), '<!doctype html><body>Not ready</body>');
settings.extensions['fixture.stalled'] = { enabled: true, settings: {} };
settings.pinnedCommands = ['fixture.home.write', 'fixture.home.fail'];
settings.appletOrder = ['fixture.stalled', 'fixture.home'];
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const checks = [];
let app, browser, dock, child;
let success = false;
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const until = async (fn, label, timeout = 20000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error(label);
};
let portable;
if (process.argv[2]) {
  portable = path.join(profile, 'AppDock.at365.exe');
  fs.copyFileSync(path.resolve(process.argv[2]), portable);
  assert.equal(hash(portable), hash(path.resolve(process.argv[2])));
}
async function launch(extra = []) {
  if (!portable) {
    app = await electron.launch({
      executablePath: require('electron'),
      args: [root, `--test-profile=${profile}`, ...extra],
      env,
    });
    browser = app.context();
  } else {
    const probe = net.createServer();
    await new Promise((r) => probe.listen(0, '127.0.0.1', r));
    const port = probe.address().port;
    await new Promise((r) => probe.close(r));
    child = spawn(
      portable,
      [`--test-profile=${profile}`, `--remote-debugging-port=${port}`, ...extra],
      { env, windowsHide: true, stdio: 'ignore' },
    );
    const connection = await until(async () => {
      try {
        return await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      } catch {}
    }, 'CDP');
    browser = connection.contexts()[0];
  }
  dock = await until(
    () =>
      browser
        .pages()
        .find(
          (p) =>
            p.url().startsWith('appdock://host/index.html') &&
            !p.url().endsWith('/notifications.html'),
        ),
    'host page',
  );
  dock.setDefaultTimeout(12000);
  await until(
    async () => (await dock.evaluate(() => window.dock.snapshot())).startupReady,
    'startup',
  );
  assert.equal(
    (await dock.evaluate(() => window.dock.snapshot())).version,
    require('../package.json').version,
  );
}
async function close() {
  if (app) {
    await app.close();
    app = undefined;
  } else if (dock && !dock.isClosed()) {
    await dock.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
    await until(() => child.exitCode !== null, 'portable stopped');
  }
}
async function navigate(route) {
  await dock.evaluate((route) => window.dock.navigate(route), route);
}
async function select(id) {
  await dock.evaluate(async (id) => {
    const s = await window.dock.snapshot();
    await window.dock.saveSettings(
      {
        ...s.settings.value,
        host: {
          ...s.settings.value.host,
          shellProviders: Object.fromEntries(
            [
              'ribbon',
              'overlay.command-palette',
              'page.home',
              'page.logs',
              'page.notifications',
              'page.settings',
              'notification.banner',
              'notification.desktop',
            ].map((region) => [region, id]),
          ),
        },
      },
      s.settings.revision,
    );
  }, id);
}
const home = (provider = 'appdock.default-shell') =>
  until(async () => {
    for (const p of browser.pages().filter((p) => p.url().endsWith('/home.html'))) {
      try {
        if (
          (await p.evaluate(async () => (await window.appdockPage.connect()).providerAppletId)) ===
            provider &&
          (await p.locator('.home-page').count())
        )
          return p;
      } catch {}
    }
  }, `logs provider ${provider}`);
const countRows = (p) => p.locator('.log-row').count();
async function check(name, action) {
  await action();
  checks.push(name);
  console.log('PASS ' + name);
}
const model = (p) => p.evaluate(async () => (await window.appdockPage.connect()).snapshot);
const invoke = (p, actionId) =>
  p.evaluate(async (actionId) => {
    const m = (await window.appdockPage.connect()).snapshot;
    await window.appdockPage.act({ id: m.id, type: 'invoke', actionId });
  }, actionId);
(async () => {
  try {
    await launch();
    await check('Default Shell owns home, bounded model and saved pin/card order', async () => {
      const p = await home(),
        m = await model(p),
        snap = await dock.evaluate(() => window.dock.snapshot());
      assert.equal(await dock.locator('.stats, .home-pins, .extension-card').count(), 0);
      assert.deepEqual(
        m.content.applets.map((a) => a.id),
        ['fixture.stalled', 'fixture.home'],
      );
      assert.equal(m.content.stats.applets, 2);
      assert.equal(m.content.stats.running, 2);
      assert.equal(m.content.stats.errors, 0);
      assert(m.content.stats.commands >= 3);
      assert.deepEqual(
        m.content.pins.map((c) => c.id),
        settings.pinnedCommands,
      );
      assert.equal(m.content.applets[1].title, 'Fixture Home');
      assert.equal(m.content.applets[1].version, manifest.version);
      assert(!JSON.stringify(m).includes(profile));
      assert(!('settings' in m));
      assert.equal(typeof (await p.evaluate(() => window.dock)), 'undefined');
      await p.screenshot({ path: path.join(profile, 'home-dark.png') });
    });
    await check(
      'home fills the host area across notification, resize and zoom changes',
      async () => {
        await require('./shell-page-layout-helper.cjs').exerciseLayout(
          dock,
          await home(),
          app,
          'home',
        );
      },
    );
    await check('persisted order, card navigation and pin execution preserve input', async () => {
      await navigate('settings');
      const draft = await dock.evaluate(async () => {
        const s = await window.dock.settingsEditing();
        const before = structuredClone(s.value);
        s.value.appletOrder = ['fixture.home', 'fixture.stalled'];
        await window.dock.editSettings({
          sessionId: s.sessionId,
          editRevision: s.editRevision,
          operationId: crypto.randomUUID(),
          action: { type: 'values', before, value: s.value },
        });
        return s.value;
      });
      await navigate('home');
      let p = await home();
      await until(
        async () => (await model(p)).content.applets[0].id === 'fixture.home',
        'draft order',
      );
      assert.deepEqual(
        (await dock.evaluate(() => window.dock.snapshot())).settings.value.appletOrder,
        ['fixture.home', 'fixture.stalled'],
      );
      await p.locator('.extension-card').filter({ hasText: 'Fixture Home' }).click();
      await dock.locator('.detail').filter({ hasText: 'Fixture Home' }).waitFor();
      await navigate('home');
      p = await home();
      await p.getByRole('button', { name: /Run slow/ }).click();
      await until(async () => (await model(p)).content.busy, 'busy');
      await until(
        () => p.getByRole('button', { name: /Run slow/ }).isDisabled(),
        'disabled busy button',
      );
      await until(async () => !(await model(p)).content.busy, 'complete');
      assert.equal(await p.locator('.home-result').count(), 0);
      await until(async () => {
        for (const page of dock
          .context()
          .pages()
          .filter((p) => p.url().endsWith('/notifications.html'))) {
          const { snapshot } = await page.evaluate(() => window.appdockNotifications.connect());
          if (
            snapshot.items.some(
              (i) => i.ownerId === 'information' && i.body === 'コマンドを実行しました。',
            )
          )
            return true;
        }
        return false;
      }, 'home command information notification');
      await p.getByRole('button', { name: /Fail/ }).click();
      await p.getByRole('alert').filter({ hasText: 'Home fixture error' }).waitFor();
      await navigate('settings');
      assert.deepEqual(
        (await dock.evaluate(() => window.dock.settingsEditing())).value.appletOrder,
        draft.appletOrder,
      );
      await navigate('home');
    });
    await check(
      'navigation retains in-flight guard and reports detached command completion',
      async () => {
        let p = await home();
        const startedAt = Date.now();
        await p.getByRole('button', { name: /Run slow/ }).click();
        await until(async () => (await model(p)).content.busy, 'command started');
        await p.locator('.extension-card').filter({ hasText: 'Fixture Home' }).click();
        await dock.locator('.detail').filter({ hasText: 'Fixture Home' }).waitFor();
        await navigate('home');
        p = await home();
        assert.equal((await model(p)).content.busy, true);
        await until(
          () => p.getByRole('button', { name: /Run slow/ }).isDisabled(),
          'remount remains busy',
        );
        await p.getByRole('button', { name: 'ログを開く', exact: true }).click();
        await require('./shell-overlay-helper.cjs').logsPage(dock);
        await until(async () => {
          for (const page of dock
            .context()
            .pages()
            .filter((p) => p.url().endsWith('/notifications.html'))) {
            const { snapshot } = await page.evaluate(() => window.appdockNotifications.connect());
            if (
              snapshot.items.some(
                (i) =>
                  i.createdAt >= startedAt &&
                  i.ownerId === 'information' &&
                  i.body === 'コマンドを実行しました。',
              )
            )
              return true;
          }
          return false;
        }, 'command information notification');
        await navigate('home');
        p = await home();
        assert.equal((await model(p)).content.busy, false);
      },
    );
    await check(
      'home-only provider, changes, own API, stale/unauthorized actions and in-flight recovery',
      async () => {
        await select('fixture.home');
        const p = await home('fixture.home');
        assert.equal(
          (await dock.evaluate(() => window.dock.snapshot())).shell.active,
          'appdock.default-shell',
        );
        assert.equal((await model(p)).content.applets[0].id, 'fixture.home');
        await p.evaluate(() => {
          window.homeEvents = [];
          window.appdockPage.onChanged((m) => window.homeEvents.push(m));
        });
        await p.evaluate(() => window.appdockPage.executeCommand('fixture.home.mark'));
        assert.equal(
          await p.evaluate(async () => (await window.appdockPage.getSettings()).compact),
          true,
        );
        assert.match(
          await p.evaluate(async () => {
            try {
              await window.appdockPage.executeCommand('appdock.quit');
              return '';
            } catch (e) {
              return String(e);
            }
          }),
          /not available/,
        );
        assert.match(
          await p.evaluate(async () => {
            try {
              await window.appdockPage.act({ id: 'old', type: 'invoke', actionId: 'fake' });
              return '';
            } catch (e) {
              return String(e);
            }
          }),
          /Stale/,
        );
        const m = await model(p),
          id = m.id;
        await p.getByRole('button', { name: /Run slow/ }).click();
        await until(async () => (await model(p)).content.busy, 'provider busy');
        assert.match(
          await p.evaluate(async () => {
            const m = (await window.appdockPage.connect()).snapshot;
            try {
              await window.appdockPage.act({
                id: m.id,
                type: 'invoke',
                actionId: m.content.pins[0].actionId,
              });
              return '';
            } catch (e) {
              return String(e);
            }
          }),
          /in progress/,
        );
        await until(
          async () => await p.evaluate(() => window.homeEvents.some((m) => m.content.busy)),
          'change notification',
        );
        const cdp = await browser.newCDPSession(p);
        void cdp.send('Page.crash').catch(() => {});
        const fallback = await home();
        assert.equal((await model(fallback)).id, id);
        assert.equal((await model(fallback)).content.applets[0].id, 'fixture.home');
        await until(async () => !(await model(fallback)).content.busy, 'recovered completion');
        assert.equal((await model(fallback)).content.message, 'コマンドを実行しました。');
        await dock.evaluate(() => window.dock.retryShell());
        await home('fixture.home');
        await dock.evaluate(() => window.dock.toggleExtension('fixture.home', false));
        const disabled = await home();
        await until(
          async () => !(await model(disabled)).content.pins[0].available,
          'disabled command',
        );
        await dock.evaluate(() => window.dock.toggleExtension('fixture.home', true));
        await home('fixture.home');
      },
    );
    await check('palette/log fallback, keyboard focus and retained page identity', async () => {
      const p = await home('fixture.home'),
        id = (await model(p)).id;
      await p.getByRole('button', { name: 'コマンド一覧', exact: true }).click();
      const palette = await require('./shell-overlay-helper.cjs').overlayPage(dock);
      assert.equal(
        await palette.evaluate(
          async () => (await window.appdockOverlay.connect()).providerAppletId,
        ),
        'appdock.default-shell',
      );
      await require('./shell-overlay-helper.cjs').closingAction(palette.keyboard.press('Escape'));
      assert.equal((await model(p)).id, id);
      const rail = await require('./shell-overlay-helper.cjs').ribbonPage(dock);
      await rail.evaluate(() => window.appdockShell.focusHost('after'));
      await until(async () => p.evaluate(() => document.hasFocus()), 'focus home');
      await p.keyboard.press('Control+p');
      const keyboardPalette = await require('./shell-overlay-helper.cjs').overlayPage(dock);
      await require('./shell-overlay-helper.cjs').closingAction(
        keyboardPalette.keyboard.press('Escape'),
      );
      await until(
        async () => p.evaluate(() => document.hasFocus()),
        'keyboard palette restores focus',
      );
      await p.keyboard.press('Shift+Tab');
      await until(async () => dock.evaluate(() => document.hasFocus()), 'focus host');
      await p.getByRole('button', { name: 'ログを開く', exact: true }).click();
      const logs = await require('./shell-overlay-helper.cjs').logsPage(dock);
      assert.equal(
        await logs.evaluate(async () => (await window.appdockPage.connect()).providerAppletId),
        'appdock.default-shell',
      );
      await until(
        () => !browser.pages().some((p) => p.url().endsWith('/home.html')),
        'home teardown',
      );
      await navigate('home');
      await home('fixture.home');
    });
    await check(
      'theme, resize, zoom and timeout fallback retain persisted projection',
      async () => {
        await dock.evaluate(async () => {
          const s = await window.dock.snapshot();
          await window.dock.saveSettings(
            { ...s.settings.value, host: { ...s.settings.value.host, theme: 'light' } },
            s.settings.revision,
          );
        });
        const p = await home('fixture.home');
        await until(async () => (await model(p)).dark === false, 'light');
        await p.waitForFunction(() => document.documentElement.dataset.theme === 'light');
        assert.equal(
          await p.evaluate(() => getComputedStyle(document.documentElement).backgroundColor),
          'rgb(250, 251, 252)',
        );
        await p.screenshot({ path: path.join(profile, 'home-light.png') });
        if (app) {
          await app.evaluate(({ BrowserWindow }) => {
            const w = BrowserWindow.getAllWindows()[0];
            w.setSize(900, 650);
            w.webContents.setZoomFactor(1.25);
          });
          await until(async () => await p.evaluate(() => innerWidth < 800), 'resize');
          const bounds = await p.evaluate(() => ({
            scroll: document.documentElement.scrollWidth,
            width: innerWidth,
          }));
          assert(bounds.scroll <= bounds.width + 1);
          await p.screenshot({ path: path.join(profile, 'home-narrow.png') });
          await app.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1),
          );
        }
        await select('fixture.stalled');
        const fallback = await home();
        assert.equal((await model(fallback)).content.applets[0].id, 'fixture.home');
        await navigate('settings');
        const setting = await getSettingsPage(dock);
        await settleSettings(setting);
        assert.deepEqual(
          (await dock.evaluate(() => window.dock.snapshot())).settings.value.appletOrder,
          ['fixture.home', 'fixture.stalled'],
        );
        await dock.evaluate(async () => {
          const s = await window.dock.settingsEditing();
          const before = structuredClone(s.value);
          s.value.appletOrder = ['fixture.home', 'fixture.stalled'];
          await window.dock.editSettings({
            sessionId: s.sessionId,
            editRevision: s.editRevision,
            operationId: crypto.randomUUID(),
            action: { type: 'values', before, value: s.value },
          });
        });
        await navigate('home');
        const again = await home();
        assert.equal((await model(again)).content.applets[0].id, 'fixture.home');
        await until(
          async () =>
            (await dock.evaluate(() => window.dock.snapshot())).settings.value.appletOrder[0] ===
            'fixture.home',
          'saved order',
        );
      },
    );
    await close();
    await launch(['--safe-shell']);
    await home();
    checks.push('safe-shell uses default home');
    success = true;
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await close().catch((e) => {
      console.error(e);
      success = false;
      process.exitCode = 1;
    });
    const result = {
      success,
      checks,
      version: require('../package.json').version,
      portable: portable ? { path: portable, sha256: hash(portable) } : null,
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ profile, ...result }));
  }
})();
