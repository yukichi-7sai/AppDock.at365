const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const { freePort, inspect, electronExpression } = require('./electron-main-helper.cjs');
const { waitForHost } = require('./settings-host-helper.cjs');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const { defaultShellId } = require('../out/main/shared/shell');
const { hostText } = require('../out/main/shared/i18n');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.artifacts', `startup-order-ui-${Date.now()}`);
const source = process.argv[2] && path.resolve(process.argv[2]);
const version = require('../package.json').version;
const checks = [],
  errors = [],
  phases = [],
  feedRequests = [];
const selectedId = 'test.selected-shell',
  regularId = 'test.regular',
  unusedId = 'test.unused-shell';
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const mainWindow = `${electronExpression}.BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('appdock://host/'))`;
fs.mkdirSync(output, { recursive: true });
const executable = source ? path.join(output, 'runtime/AppDock.at365.exe') : require('electron');
if (source) {
  fs.mkdirSync(path.dirname(executable));
  require('./copy-host.cjs').copyHost(source, executable);
  assert.equal(hash(executable), hash(source));
}
async function until(fn, label, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await fn();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw Error(label);
}
function worker(profile, id, gate, fail = false) {
  return `const fs=require('node:fs'),path=require('node:path');
    const profile=${JSON.stringify(profile)},event=label=>fs.appendFileSync(path.join(profile,'events.txt'),label+'\\n');
    event(${JSON.stringify(id + ':process')});
    exports.activate=async c=>{
      ${id === selectedId ? "await c.settings.set('probe',true);" : ''}
      event(${JSON.stringify(id + ':activate')});
      ${gate ? `while(!fs.existsSync(path.join(profile,${JSON.stringify(gate)})))await new Promise(r=>setTimeout(r,20));` : ''}
      ${fail ? "throw Error('fixture Shell activation failure');" : ''}
      ${id === regularId ? `c.commands.register('${regularId}.open','Open',()=>c.pages.open('main'));` : ''}
      event(${JSON.stringify(id + ':running')});
    };`;
}
function shellFixture(profile, id, selected, fail) {
  const folder = path.join(profile, 'extensions', id);
  fs.cpSync(path.join(root, 'out/shells/default'), folder, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'extension.json')));
  manifest.id = id;
  manifest.name = id;
  manifest.minimumHostVersion = version;
  if (selected) {
    manifest.capabilities.push('settings');
    manifest.settings = [{ key: 'probe', type: 'boolean', title: 'Probe', default: false }];
  }
  fs.writeFileSync(path.join(folder, 'extension.json'), JSON.stringify(manifest));
  fs.writeFileSync(
    path.join(folder, 'worker.cjs'),
    worker(profile, id, selected ? 'allow-shell' : null, fail),
  );
}
function regularFixture(profile) {
  const folder = path.join(profile, 'extensions', regularId);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(
    path.join(folder, 'extension.json'),
    JSON.stringify({
      apiVersion: 1,
      id: regularId,
      name: regularId,
      version: '1.0.0',
      runtime: 'node',
      entry: 'index.cjs',
      minimumHostVersion: version,
      capabilities: ['pages'],
      commands: [{ id: `${regularId}.open`, title: 'Open', activateOnExecute: true }],
      pages: [
        {
          id: 'main',
          title: 'Restore fixture',
          source: 'local',
          ui: 'page.html',
          openCommand: `${regularId}.open`,
        },
      ],
    }),
  );
  fs.writeFileSync(path.join(folder, 'index.cjs'), worker(profile, regularId, 'allow-regular'));
  fs.writeFileSync(
    path.join(folder, 'page.html'),
    '<!doctype html><html><body><h1>Restored fixture page</h1></body></html>',
  );
}

const server = http.createServer((request, response) => {
  feedRequests.push(request.url);
  response.setHeader('Content-Type', 'application/json');
  response.end(
    JSON.stringify({
      schemaVersion: 1,
      kind: 'host',
      id: 'host',
      version,
      payload: { file: 'update.zip', sha256: '0'.repeat(64), size: 1, format: 'zip' },
    }),
  );
});

async function phase(mode) {
  const profile = path.join(output, mode);
  fs.mkdirSync(profile, { recursive: true });
  shellFixture(profile, selectedId, true, mode === 'failed');
  shellFixture(profile, unusedId, false, false);
  regularFixture(profile);
  const settings = createDefaultSettings();
  Object.assign(settings.host, {
    soundEnabled: false,
    notifications: false,
    hardwareAcceleration: false,
    closeToTray: false,
    theme: 'light',
    startMinimized: mode === 'minimized',
    shellProviders: Object.fromEntries(
      ['titlebar', 'ribbon', 'statusbar'].map((r) => [r, selectedId]),
    ),
  });
  settings.gestures.enabled = false;
  settings.touchpadGestures.enabled = false;
  settings.keybindings = [];
  settings.globalShortcutCommands = [];
  if (mode === 'delayed')
    settings.extensions[selectedId] = { enabled: true, startupDelaySeconds: 5, settings: {} };
  settings.updates.checkHostOnAboutOpen = mode === 'normal';
  settings.updates.hostSource = `http://127.0.0.1:${server.address().port}/${mode}/update.json`;
  fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
  const inspector = await freePort(),
    port = await freePort();
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const processLog = fs.openSync(path.join(profile, 'process.log'), 'a');
  const child = spawn(
    executable,
    [
      ...(!source ? [root] : []),
      `--test-profile=${profile}`,
      `--test-local-state=${path.join(profile, 'local')}`,
      `--inspect=${inspector}`,
      `--remote-debugging-port=${port}`,
      ...(mode === 'safe' ? ['--safe-shell'] : []),
    ],
    { cwd: root, env, windowsHide: false, stdio: ['ignore', processLog, processLog] },
  );
  fs.closeSync(processLog);
  child.on('error', (error) => errors.push(error.message));
  let browser, page;
  const events = () =>
    fs.existsSync(path.join(profile, 'events.txt'))
      ? fs.readFileSync(path.join(profile, 'events.txt'), 'utf8').trim().split('\n')
      : [];
  const allow = (gate) => fs.writeFileSync(path.join(profile, gate), 'ready');
  const readSnapshot = () => page.evaluate(() => window.dock.snapshot());
  const renderer = (expression) =>
    inspect(
      inspector,
      `${mainWindow}.webContents.executeJavaScript(${JSON.stringify(expression)})`,
    );
  const attach = async () => {
    browser = await until(async () => {
      try {
        return await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 });
      } catch {
        return false;
      }
    }, 'CDP attach');
    page = await until(
      () =>
        browser
          .contexts()
          .flatMap((c) => c.pages())
          .find((p) => p.url().startsWith('appdock://host/')),
      'host renderer',
    );
    page.setDefaultTimeout(20000);
    page.on('pageerror', (error) => errors.push(error.message));
  };
  const capture = (file) =>
    inspect(
      inspector,
      `${mainWindow}.webContents.capturePage().then(image=>{process.getBuiltinModule('fs').writeFileSync(${JSON.stringify(path.join(profile, file))},image.toPNG());return true;})`,
    );
  const observeShow = () =>
    inspect(
      inspector,
      `${mainWindow}.on('show',()=>process.getBuiltinModule('fs').appendFileSync(${JSON.stringify(path.join(profile, 'events.txt'))},'host:show\\n')); true`,
    );
  const ready = () =>
    waitForHost(page, async () => (await window.dock.snapshot()).startupReady, undefined, 60000);
  const mountedShells = async (expected) => {
    const regions = (await readSnapshot()).shellRegions.regions;
    for (const region of ['titlebar', 'ribbon', 'statusbar']) {
      const status = regions.find((r) => r.region === region);
      assert.equal(status.ready, true, region);
      assert.equal(status.boundProvider, expected, region);
    }
  };
  try {
    await attach();
    if (mode === 'safe' || mode === 'delayed') {
      await waitForHost(page, async () => (await window.dock.snapshot()).windowVisible);
      assert.equal((await readSnapshot()).startupReady, false);
      await mountedShells(defaultShellId);
      if (mode === 'delayed') {
        assert.equal(
          (await readSnapshot()).extensions.find((a) => a.id === selectedId).state,
          'waiting',
        );
        assert(!events().includes(selectedId + ':process'));
        checks.push('delayed:selected-Shell-keeps-its-delay-and-Default-Shell-presents-first');
      }
      allow('allow-shell');
    } else {
      await until(() => events().includes(selectedId + ':activate'), 'selected Shell activation');
      const before = await readSnapshot();
      assert.equal(before.windowVisible, false);
      assert.equal(before.startupReady, false);
      assert.equal(before.extensions.find((a) => a.id === defaultShellId).state, 'running');
      assert(!events().includes(regularId + ':process'));
      assert(!events().includes(unusedId + ':process'));
      await observeShow();
      checks.push(
        `${mode}:selected-Shell-before-window-and-no-ordinary-worker-during-settings-change`,
      );
      allow('allow-shell');
    }
    await until(
      () => events().includes(regularId + ':activate'),
      'ordinary activation after presentation',
    );
    const during = await readSnapshot();
    assert.equal(during.uiReady, true);
    assert.equal(during.startupReady, false);
    assert.equal(during.windowVisible, mode !== 'minimized');
    await page.locator('.about-page').waitFor();
    await mountedShells(['failed', 'safe', 'delayed'].includes(mode) ? defaultShellId : selectedId);
    if (!['safe', 'delayed', 'minimized'].includes(mode))
      assert(events().indexOf('host:show') < events().indexOf(regularId + ':process'));
    if (mode === 'minimized') assert(!events().includes('host:show'));
    if (mode === 'normal')
      assert.equal(feedRequests.filter((r) => r.startsWith('/normal/')).length, 0);
    assert(!during.logs.some((l) => l.message === hostText('services.index.initialUiTimeout')));
    await capture('before-ordinary-ready.png');
    checks.push(`${mode}:host-content-and-Shell-views-ready-while-ordinary-activation-pending`);
    if (mode === 'normal') await inspect(inspector, `${mainWindow}.hide(); true`);
    allow('allow-regular');
    await ready();
    const completed = await readSnapshot();
    assert.equal(completed.version, version);
    assert.equal(completed.extensions.find((a) => a.id === unusedId).state, 'running');
    if (mode === 'failed')
      assert.equal(completed.extensions.find((a) => a.id === selectedId).state, 'error');
    else if (mode === 'delayed')
      assert.equal(completed.extensions.find((a) => a.id === selectedId).state, 'waiting');
    else assert.equal(completed.extensions.find((a) => a.id === selectedId).state, 'running');
    checks.push(`${mode}:remaining-workers-complete-and-existing-readiness-stays-last`);
    if (mode === 'normal') {
      assert.equal(completed.windowVisible, false);
      checks.push('normal:startup-completion-does-not-reopen-a-window-hidden-during-activation');
      await page.evaluate(() => window.dock.executeCommand('appdock.open'));
      await until(
        () => feedRequests.some((r) => r.startsWith('/normal/')),
        'deferred About update check',
      );
      await waitForHost(page, async () => !(await window.dock.snapshot()).updates.busy);
      assert.equal(await page.locator('[role="alert"]').count(), 0);
      checks.push('normal:About-auto-check-waits-without-startup-error');
      await page.evaluate((id) => window.dock.openAppletPage(id, 'main'), regularId);
      await waitForHost(
        page,
        async (id) => (await window.dock.snapshot()).navigation.route === `page:${id}:main`,
        regularId,
      );
      await page.waitForFunction(
        (id) =>
          JSON.parse(localStorage.getItem('appdock.restart-view.page') ?? 'null') ===
          `page:${id}:main`,
        regularId,
      );
      const previousPid = await inspect(inspector, 'process.pid');
      fs.unlinkSync(path.join(profile, 'allow-regular'));
      const eventCount = events().length;
      await browser.close();
      browser = undefined;
      await renderer("window.dock.executeCommand('appdock.restart').then(()=>true)").catch(
        (error) => {
          if (!/closed|timeout|fetch failed|ECONN/.test(String(error))) throw error;
        },
      );
      await until(
        async () => {
          try {
            return (await inspect(inspector, 'process.pid')) !== previousPid;
          } catch {
            return false;
          }
        },
        'restart process',
        60000,
      );
      await attach();
      await until(
        () =>
          events()
            .slice(eventCount)
            .includes(regularId + ':activate'),
        'restarted ordinary activation',
      );
      const restoring = await readSnapshot();
      assert.equal(restoring.uiReady, true);
      assert.equal(restoring.startupReady, false);
      assert.equal(restoring.windowVisible, true);
      await page.getByText('Appletの起動を待っています…', { exact: true }).waitFor();
      await mountedShells(selectedId);
      allow('allow-regular');
      await ready();
      await waitForHost(
        page,
        async (id) => (await window.dock.snapshot()).navigation.route === `page:${id}:main`,
        regularId,
      );
      await until(
        () =>
          !page.isClosed() &&
          page
            .getByText('Appletの起動を待っています…', { exact: true })
            .count()
            .then((n) => n === 0),
        'restored page finished',
      );
      assert(
        await inspect(
          inspector,
          `${electronExpression}.webContents.getAllWebContents().some(c=>c.getURL().endsWith('/page.html'))`,
        ),
      );
      await capture('restored-page.png');
      checks.push(
        'normal:restart-shows-host-first-and-restores-Applet-page-after-provider-running',
      );
    }
    if (mode === 'minimized') {
      await page.evaluate(() => window.dock.executeCommand('appdock.open'));
      await waitForHost(page, async () => (await window.dock.snapshot()).windowVisible);
      checks.push('minimized:tray-start-stays-hidden-and-open-command-shows-window');
    }
    if (mode === 'delayed') {
      await waitForHost(
        page,
        async (id) =>
          (await window.dock.snapshot()).extensions.find((a) => a.id === id).state === 'running',
        selectedId,
      );
      await until(
        async () =>
          (await readSnapshot()).shellRegions.regions
            .filter((r) => ['titlebar', 'ribbon', 'statusbar'].includes(r.region))
            .every((r) => r.ready && r.boundProvider === selectedId),
        'delayed Shell replacement',
      );
      checks.push('delayed:configured-Shell-replaces-fallback-after-its-normal-delay');
    }
    phases.push({
      mode,
      snapshot: {
        uiReady: during.uiReady,
        startupReady: during.startupReady,
        windowVisible: during.windowVisible,
      },
      events: events(),
    });
  } catch (error) {
    if (page) {
      await capture('failure.png').catch(() => {});
      fs.writeFileSync(
        path.join(profile, 'failure.txt'),
        await page
          .locator('body')
          .innerText()
          .catch(() => ''),
      );
    }
    throw error;
  } finally {
    allow('allow-shell');
    allow('allow-regular');
    if (page)
      await page
        .evaluate(() => {
          void window.dock.executeCommand('appdock.quit');
        })
        .catch(() => {});
    await until(
      async () => {
        try {
          await fetch(`http://127.0.0.1:${inspector}/json/list`, {
            signal: AbortSignal.timeout(500),
          });
          return false;
        } catch {
          return true;
        }
      },
      'test host shutdown',
      15000,
    );
    if (browser) await browser.close();
  }
}

(async () => {
  const result = { ok: false, output, source, version, checks, errors, phases, feedRequests };
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    for (const mode of ['normal', 'minimized', 'failed', 'safe', 'delayed']) await phase(mode);
    assert.deepEqual(errors, []);
    if (source) result.sha256 = hash(source);
    result.ok = true;
  } catch (error) {
    result.error = error.stack;
    process.exitCode = 1;
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
})();
