const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const { freePort, inspect, electronExpression } = require('./electron-main-helper.cjs');
const { settingsPage } = require('./settings-host-helper.cjs');
const root = path.resolve(__dirname, '..');
const portable = process.argv[2] ? path.resolve(process.argv[2]) : null;
const output = path.join(root, '.artifacts', 'start-page-ui-' + Date.now());
fs.mkdirSync(output, { recursive: true });
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const exe = portable ? path.join(output, 'runtime', 'AppDock.at365.exe') : require('electron');
if (portable) {
  fs.mkdirSync(path.dirname(exe), { recursive: true });
  require('./copy-host.cjs').copyHost(portable, exe);
  assert.equal(hash(exe), hash(portable));
}
const checks = [],
  errors = [];
let host, browser, child, inspector, held, remoteOrigin;
const server = require('node:http').createServer((req, res) => {
  if (req.url === '/hold.js') {
    held = res;
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<!doctype html><h1>Remote collection fixture</h1>');
});
async function until(fn, label) {
  const end = Date.now() + 60000;
  let last;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  throw Error(label + (last ? ': ' + last : ''));
}
function profile(name, overrides = {}) {
  const folder = path.join(output, name),
    fixture = path.join(folder, 'extensions', 'fixture.start');
  fs.mkdirSync(fixture, { recursive: true });
  fs.writeFileSync(
    path.join(fixture, 'extension.json'),
    JSON.stringify({
      apiVersion: 1,
      id: 'fixture.start',
      minimumHostVersion: '0.44.0',
      name: 'Start fixture',
      version: '1.0.0',
      runtime: 'node',
      entry: 'worker.cjs',
      capabilities: ['pages', 'dynamic-pages', 'settings', 'web-profiles', 'web-accounts'],
      webAccounts: {
        url: 'https://fixture.invalid/',
        origins: ['https://fixture.invalid'],
        observeOrigin: 'https://fixture.invalid',
        ui: 'accounts.html',
        observer: 'observer.js',
        accountGroup: { id: 'fixture.start.accounts', title: 'Fixture accounts' },
      },
      settings: ['local', 'sites'].map((key) => ({
        key,
        title: key,
        type: 'object-list',
        fields: [{ key: 'name', title: 'Name', type: 'string' }],
        default: [],
      })),
      pageCollections: [
        { key: 'local', source: 'local', ui: 'main.html', fields: [] },
        { key: 'sites', source: 'remote', fields: [] },
      ],
      pages: ['main', 'window', 'slow', 'accounts'].map((id) => ({
        id,
        title: id,
        source: id === 'accounts' ? 'web-accounts' : 'local',
        ...(id === 'accounts' ? {} : { ui: id === 'slow' ? 'slow.html' : 'main.html' }),
        openCommand: 'fixture.start.' + id,
        defaultDisplay: id === 'window' ? 'window' : 'page',
      })),
      commands: ['main', 'window', 'slow', 'accounts'].map((id) => ({
        id: 'fixture.start.' + id,
        title: id,
        activateOnExecute: true,
      })),
    }),
  );
  fs.writeFileSync(
    path.join(fixture, 'worker.cjs'),
    `exports.activate=async c=>{
    ${overrides.fail ? "throw Error('Intentional startup failure');" : ''}
    await c.pages.replace([{id:'dynamic',title:'Dynamic',source:'local',ui:'main.html'}],(await c.pages.list()).revision);
    for(const id of ['main','window','slow']) c.commands.register('fixture.start.'+id,id,()=>{throw Error('Automatic startup must not execute page commands');});
  };`,
  );
  fs.writeFileSync(
    path.join(fixture, 'main.html'),
    '<!doctype html><h1>Start page fixture</h1><input aria-label="Page text">',
  );
  fs.writeFileSync(
    path.join(fixture, 'slow.html'),
    `<!doctype html><h1>Slow page fixture</h1><script src="${remoteOrigin}/hold.js"></script>`,
  );
  fs.writeFileSync(path.join(fixture, 'accounts.html'), '<!doctype html><h1>Accounts fixture</h1>');
  fs.writeFileSync(path.join(fixture, 'observer.js'), '({})');
  const account = 'account.11111111-2222-3333-4444-555555555555';
  const roster = path.join(folder, 'data', 'web-profiles', 'fixture.start');
  fs.mkdirSync(roster, { recursive: true });
  fs.writeFileSync(
    path.join(roster, 'accounts.json'),
    JSON.stringify({ schemaVersion: 1, accounts: [{ id: account, name: 'Fixture account' }] }),
  );
  const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
  Object.assign(settings.host, {
    soundEnabled: false,
    closeToTray: false,
    startPage: overrides.startPage ?? 'about',
    startMinimized: !!overrides.tray,
  });
  settings.keybindings = [];
  settings.globalShortcutCommands = [];
  settings.gestures.enabled = false;
  settings.touchpadGestures.enabled = false;
  settings.keybindingDefaultsInitialized = ['appdock.default-shell'];
  settings.gestureDefaultsInitialized = ['appdock.default-shell'];
  settings.extensions['fixture.start'] = {
    enabled: overrides.enabled !== false,
    startupDelaySeconds: overrides.delay ?? 0,
    settings: {
      local: [{ id: 'local', name: 'Local collection', enabled: true, display: 'page' }],
      sites: [
        {
          id: 'remote',
          name: 'Remote collection',
          enabled: true,
          display: 'page',
          url: remoteOrigin + '/remote',
          accountId: account,
          navigation: 'same-origin',
          allowedOrigins: [],
        },
      ],
    },
    ...(overrides.window ? { pages: { main: { display: 'window' } } } : {}),
  };
  fs.writeFileSync(path.join(folder, 'settings.json'), JSON.stringify(settings));
  return folder;
}
const snap = () => host.evaluate(() => window.dock.snapshot());
const main = (fn, arg) =>
  inspect(
    inspector,
    `(${fn.toString()})(${electronExpression},${JSON.stringify(arg) ?? 'undefined'})`,
  );
async function launch(folder, restore = false) {
  const port = await freePort();
  inspector = await freePort();
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  child = spawn(
    exe,
    [
      ...(portable ? [] : [root]),
      '--test-profile=' + folder,
      '--remote-debugging-port=' + port,
      '--inspect=127.0.0.1:' + inspector,
      ...(restore ? ['--restore-view'] : []),
    ],
    { cwd: root, env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] },
  );
  child.stderr.on('data', (data) => fs.appendFileSync(path.join(folder, 'process.log'), data));
  browser = await until(
    () => chromium.connectOverCDP('http://127.0.0.1:' + port, { timeout: 1000 }),
    'CDP',
  );
  host = await until(
    () =>
      browser
        .contexts()[0]
        .pages()
        .find((p) => p.url().startsWith('appdock://host/')),
    'host',
  );
  host.on('pageerror', (error) => errors.push(String(error)));
  host.setDefaultTimeout(15000);
  await until(async () => (await snap()).startupReady, 'startup readiness');
  assert(
    (await snap()).extensions.some((applet) => applet.id === 'fixture.start'),
    'fixture manifest must be accepted',
  );
}
async function close() {
  if (!browser) return;
  await host.evaluate(() => window.dock.executeCommand('appdock.quit'));
  await until(() => child.exitCode !== null, 'shutdown');
  await browser.close();
  browser = null;
  host = null;
  child = null;
}
async function about() {
  await host.locator('.about-page').waitFor();
  assert.equal((await snap()).navigation.route, 'settings');
  assert.equal(
    await host.evaluate(async () => (await window.dock.settingsEditing()).pageId),
    'about',
  );
}
async function pageReady(route, title = 'Start page fixture') {
  await until(
    async () =>
      (await snap()).navigation.route === route &&
      !(await host.getByText('Appletの起動を待っています…', { exact: true }).count()),
    'selected page ' + route,
  );
  const page = await until(async () => {
    for (const page of browser
      .contexts()[0]
      .pages()
      .filter((p) => p !== host)) {
      try {
        if (await page.getByRole('heading', { name: title, exact: true }).count()) return page;
      } catch {}
    }
  }, 'page content');
  await until(
    async () =>
      host
        .getByLabel('Appletページ', { exact: true })
        .evaluate((e) => e.getBoundingClientRect().width > 0),
    'page viewport',
  );
  return page;
}
async function visibility() {
  return main(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().startsWith('appdock://host/'),
    );
    return { visible: w.isVisible(), minimized: w.isMinimized() };
  });
}
(async () => {
  let success = false;
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    remoteOrigin = 'http://127.0.0.1:' + server.address().port;
    const basic = profile('selection');
    await launch(basic);
    await about();
    await until(
      async () =>
        (await snap()).extensions.find((a) => a.id === 'fixture.start')?.state === 'running',
      'fixture running',
    );
    checks.push('default opens About');
    await settingsPage(host);
    await host.getByTestId('settings-nav:general').click();
    const select = host.getByRole('combobox', { name: 'スタートページ', exact: true });
    await select.waitFor();
    const values = await select
      .locator('option')
      .evaluateAll((options) => options.map((option) => option.value));
    assert.deepEqual(values, [
      'about',
      'page:fixture.start:main',
      'page:fixture.start:slow',
      'page:fixture.start:accounts',
      'page:fixture.start:dynamic',
      'page:fixture.start.local.local:main',
      'page:fixture.start.sites.remote:main',
    ]);
    await select.selectOption('page:fixture.start:dynamic');
    await until(
      async () => (await snap()).settings.value.host.startPage === 'page:fixture.start:dynamic',
      'saved selection',
    );
    assert.equal((await snap()).navigation.route, 'settings');
    checks.push(
      'effective page candidates include dynamic and both collection sources; selection saves without navigation',
    );
    for (const [name, width] of [
      ['wide', 1280],
      ['narrow', 620],
    ]) {
      await main(
        ({ BrowserWindow }, width) =>
          BrowserWindow.getAllWindows()
            .find((w) => w.webContents.getURL().startsWith('appdock://host/'))
            .setSize(width, 850),
        width,
      );
      await select.scrollIntoViewIfNeeded();
      const rect = await select.boundingBox();
      assert(
        rect.width > 0 &&
          rect.x >= 0 &&
          rect.x + rect.width <= (await host.evaluate(() => innerWidth)) + 1,
      );
      await host.screenshot({ path: path.join(output, name + '.png') });
    }
    checks.push('wide and narrow settings remain operable');
    await host.evaluate(() => {
      localStorage.setItem('appdock.restart-view.page', JSON.stringify('settings'));
      localStorage.setItem('appdock.restart-view.category', JSON.stringify('general'));
    });
    await close();
    await launch(basic, true);
    await host.getByRole('combobox', { name: 'スタートページ', exact: true }).waitFor();
    assert.equal(
      await host.getByRole('combobox', { name: 'スタートページ', exact: true }).inputValue(),
      'page:fixture.start:dynamic',
    );
    checks.push('restore-view preserves the settings category and saved startup preference');
    await close();
    await launch(basic);
    await pageReady('page:fixture.start:dynamic');
    checks.push('normal startup opens the saved dynamic page after registration');
    await close();
    await launch(basic, true);
    await pageReady('page:fixture.start:dynamic');
    checks.push('restore-view restores a dynamic page after provider registration');
    await host.evaluate(() => window.dock.executeCommand('appdock.applets.fixture.start.disable'));
    await about();
    assert.equal((await snap()).settings.value.host.startPage, 'page:fixture.start:dynamic');
    checks.push(
      'stopping the selected provider returns to About and retains the startup preference',
    );
    await close();

    const invalidRestore = profile('invalid-restoration', {
      startPage: 'page:fixture.start:dynamic',
    });
    await launch(invalidRestore);
    await pageReady('page:fixture.start:dynamic');
    for (const route of ['home', 'invalid:route', 'page:missing:main']) {
      await host.evaluate(
        (route) => localStorage.setItem('appdock.restart-view.page', JSON.stringify(route)),
        route,
      );
      await close();
      await launch(invalidRestore, true);
      await about();
      assert.equal((await snap()).settings.value.host.startPage, 'page:fixture.start:dynamic');
      checks.push(
        'invalid restoration ' +
          route +
          ' returns to About without replacing the startup preference',
      );
    }
    await close();

    for (const [name, overrides] of [
      ['missing', { startPage: 'page:missing.provider:main' }],
      ['disabled', { startPage: 'page:fixture.start:main', enabled: false }],
      ['window', { startPage: 'page:fixture.start:main', window: true }],
      ['failed', { startPage: 'page:fixture.start:main', fail: true }],
      ['removed', { startPage: 'page:fixture.start:removed' }],
    ]) {
      await launch(profile(name, overrides));
      await about();
      assert.equal((await snap()).settings.value.host.startPage, overrides.startPage);
      await host.getByTestId('settings-nav:general').click();
      const choice = host.getByRole('combobox', { name: 'スタートページ', exact: true });
      await choice.waitFor();
      assert.equal(await choice.inputValue(), overrides.startPage);
      assert(await choice.locator('option:checked').isDisabled());
      await host
        .getByText(
          '選択したページは現在利用できません。通常起動時はAppDockについてを表示します。',
          { exact: true },
        )
        .waitFor();
      checks.push(name + ' falls back to About and retains an unavailable selection');
      await close();
    }
    await launch(profile('delay-cancel', { startPage: 'page:fixture.start:dynamic', delay: 8 }));
    assert.equal((await snap()).extensions.find((a) => a.id === 'fixture.start').state, 'waiting');
    await host.getByText('Appletの起動を待っています…', { exact: true }).waitFor();
    await host.evaluate(() => window.dock.navigate('logs'));
    await until(
      async () =>
        (await snap()).extensions.find((a) => a.id === 'fixture.start').state === 'running',
      'delayed provider',
    );
    assert.equal((await snap()).navigation.route, 'logs');
    checks.push('manual navigation cancels delayed dynamic startup');
    await close();

    for (const action of ['navigate', 'hide', 'minimize', 'window']) {
      held = null;
      await launch(profile('loading-' + action, { startPage: 'page:fixture.start:slow' }));
      await until(() => held, 'held page load');
      if (action === 'navigate') {
        await host.evaluate(() => window.dock.navigate('logs'));
        await until(async () => (await snap()).navigation.route === 'logs', 'manual page');
      } else if (action === 'window') {
        await host.evaluate(async () => {
          const input = await window.dock.settingsEditing();
          const value = structuredClone(input.value);
          value.extensions['fixture.start'].pages = { slow: { display: 'window' } };
          await window.dock.editSettings({
            sessionId: input.sessionId,
            operationId: crypto.randomUUID(),
            editRevision: input.editRevision,
            action: { type: 'values', before: input.value, value },
          });
        });
      } else
        await main(
          ({ BrowserWindow }, action) =>
            BrowserWindow.getAllWindows()
              .find((w) => w.webContents.getURL().startsWith('appdock://host/'))
              [action === 'hide' ? 'hide' : 'minimize'](),
          action,
        );
      held.end('window.fixtureLoaded=true;');
      const slow = await until(
        () =>
          browser
            .contexts()[0]
            .pages()
            .find((p) => p.url().endsWith('/slow.html')),
        'slow document',
      );
      await slow.waitForFunction(() => window.fixtureLoaded === true);
      if (action === 'navigate') assert.equal((await snap()).navigation.route, 'logs');
      else if (action === 'window') await about();
      else {
        await pageReady('page:fixture.start:slow', 'Slow page fixture');
        if (action === 'hide') assert.equal((await visibility()).visible, false);
        else assert.equal((await visibility()).minimized, true);
      }
      checks.push('page load completion respects ' + action);
      await close();
    }
    await launch(profile('tray', { startPage: 'page:fixture.start:main', tray: true }));
    await pageReady('page:fixture.start:main');
    assert.equal((await visibility()).visible, false);
    checks.push(
      'tray startup prepares its page without showing the window or executing its command',
    );
    await close();
    for (const [name, route, title] of [
      ['local', 'page:fixture.start.local.local:main', 'Start page fixture'],
      ['remote', 'page:fixture.start.sites.remote:main', 'Remote collection fixture'],
    ]) {
      await launch(profile('collection-' + name, { startPage: route }));
      await pageReady(route, title);
      checks.push(name + ' collection page opens at startup');
      await close();
    }
    const accountsProfile = profile('web-accounts', { startPage: 'page:fixture.start:accounts' });
    await launch(accountsProfile);
    await pageReady('page:fixture.start:accounts', 'Accounts fixture');
    checks.push('Web account UI opens from its declared page without authentication');
    await close();
    await launch(accountsProfile, true);
    await pageReady('page:fixture.start:accounts', 'Accounts fixture');
    checks.push('restore-view restores the Web account UI page');
    await close();
    assert.deepEqual(errors, []);
    success = true;
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
    if (host) {
      await host.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
      fs.writeFileSync(
        path.join(output, 'failure-state.json'),
        JSON.stringify(await snap().catch(() => null), null, 2),
      );
    }
  } finally {
    if (held && !held.writableEnded) held.end('');
    await close().catch((error) => {
      console.error(error);
      success = false;
      process.exitCode = 1;
    });
    await new Promise((resolve) => server.close(resolve));
    const result = {
      success,
      version: require('../package.json').version,
      portable: !!portable,
      executable: portable,
      sha256: portable ? hash(portable) : null,
      output,
      checks,
      errors,
    };
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  }
})();
