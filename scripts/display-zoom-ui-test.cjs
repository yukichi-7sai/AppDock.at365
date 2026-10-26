const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { freePort, inspect, electronExpression } = require('./electron-main-helper.cjs');
const { settleSettings } = require('./settings-immediate-helper.cjs');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', 'display-zoom-ui-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
const checks = [],
  errors = [];
const source = process.argv[2] ? path.resolve(process.argv[2]) : null;
const exe = source ? path.join(profile, 'AppDock.at365.exe') : require('electron');
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if (source) {
  require('./copy-host.cjs').copyHost(source, exe);
  assert.equal(hash(exe), hash(source));
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
let child,
  browser,
  context,
  host,
  server,
  mainPort,
  output = '';
async function until(read, label, timeout = 60000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw Error(label);
}
async function start() {
  const port = await freePort();
  mainPort = await freePort();
  child = spawn(
    exe,
    [
      ...(source ? [] : [root]),
      '--test-profile=' + profile,
      '--test-local-state=' + path.join(profile, 'local'),
      '--remote-debugging-port=' + port,
      '--inspect=' + mainPort,
    ],
    { cwd: root, env, windowsHide: true, stdio: 'pipe' },
  );
  child.stdout.on('data', (data) => (output += data));
  child.stderr.on('data', (data) => (output += data));
  child.on('error', (error) => (output += String(error)));
  browser = await until(async () => {
    try {
      return await chromium.connectOverCDP('http://127.0.0.1:' + port, { timeout: 800 });
    } catch {}
  }, 'CDP');
  context = browser.contexts()[0];
  host = await until(
    () => context.pages().find((page) => page.url().startsWith('appdock://host/')),
    'host',
  );
  await until(
    async () => (await host.evaluate(() => window.dock.snapshot())).startupReady,
    'startup',
  );
  assert.equal(
    (await host.evaluate(() => window.dock.snapshot())).version,
    require('../package.json').version,
  );
}
async function stop() {
  if (browser && child?.exitCode === null)
    await main(
      'globalThis.zoomRemote?.close();delete globalThis.zoomRemote;await globalThis.zoomAccount?.close();delete globalThis.zoomAccount;',
    ).catch(() => {});
  if (host && !host.isClosed())
    await host.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
  if (child) await until(() => child.exitCode !== null, 'exit');
  if (browser) await browser.close();
  browser = undefined;
}
const main = (expression) =>
  inspect(mainPort, `(async()=>{const e=${electronExpression};${expression}})()`);
async function zooms() {
  return main(
    `return e.webContents.getAllWebContents().filter(w=>w.getURL().startsWith('appdock://host/')||/\\/(index|bars|main|overlay|notifications|remote)\\.html(?:\\?|$)/.test(w.getURL())).map(w=>({id:w.id,url:w.getURL(),factor:w.getZoomFactor(),mode:w.getZoomMode()}));`,
  );
}
async function assertZoom(factor) {
  await until(async () => {
    const values = await zooms();
    return (
      values.length >= 3 &&
      values.every(
        (value) => Math.abs(value.factor - factor) < 0.000001 && value.mode === 'isolated',
      )
    );
  }, 'all presentation zooms = ' + factor);
}
async function selectZoom(factor) {
  await host.getByLabel('表示倍率', { exact: true }).selectOption(String(factor));
  await settleSettings(host);
  await assertZoom(factor);
}
async function settings() {
  await host.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
  await host.getByRole('button', { name: '表示', exact: true }).click();
  await host.getByLabel('表示倍率', { exact: true }).waitFor();
}
(async () => {
  let success = false;
  try {
    server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end(
        '<!doctype html><title>Zoom remote fixture</title><button id="remote">Remote</button><a href="/remote.html?next">Navigate</a>',
      );
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const folder = path.join(profile, 'extensions', 'fixture.zoom');
    fs.mkdirSync(folder, { recursive: true });
    const remote = 'http://127.0.0.1:' + server.address().port + '/remote.html';
    fs.writeFileSync(
      path.join(folder, 'extension.json'),
      JSON.stringify({
        apiVersion: 1,
        id: 'fixture.zoom',
        name: 'Zoom fixture',
        version: '1.0.0',
        runtime: 'node',
        entry: 'index.cjs',
        minimumHostVersion: '0.81.0',
        capabilities: ['pages', 'notifications'],
        commands: [
          { id: 'fixture.zoom.open', title: 'Open zoom fixture', activateOnExecute: true },
          { id: 'fixture.zoom.notice', title: 'Zoom notice' },
        ],
        notificationTypes: [
          {
            typeId: 'message',
            title: 'Zoom fixture notice',
            description: 'Fixture',
            levels: ['info'],
            defaultLevel: 'info',
            defaultEnabled: true,
            canDisable: true,
            disabledControlReason: '',
            allowedTargets: ['banner', 'desktop'],
            defaultTargets: ['banner', 'desktop'],
            requiredTargets: [],
            lifetimePolicy: 'userDuration',
            defaultDurationSeconds: null,
            history: 'persistent',
          },
        ],
        pages: [
          {
            id: 'main',
            title: 'Zoom fixture',
            source: 'local',
            ui: 'main.html',
            openCommand: 'fixture.zoom.open',
          },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(folder, 'index.cjs'),
      "exports.activate=async c=>{c.commands.register('fixture.zoom.open','Open zoom fixture',()=>c.pages.open('main'));c.commands.register('fixture.zoom.notice','Zoom notice',()=>c.notifications.publish({typeId:'message',title:'Zoom desktop fixture',body:'Scaled notification content',historyText:{title:'Zoom fixture',body:'Safe'}}));};",
    );
    fs.writeFileSync(
      path.join(folder, 'main.html'),
      '<!doctype html><meta charset="utf-8"><button id="sample">Local zoom fixture</button>',
    );
    const initial = require('../out/main/shared/settings-schema').createDefaultSettings();
    Object.assign(initial.host, { closeToTray: false, soundEnabled: false, zoomFactor: 1.25 });
    initial.gestures.enabled = false;
    initial.keybindings = [];
    initial.globalShortcutCommands = [];
    initial.extensions['fixture.zoom'] = { enabled: true, settings: {} };
    fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(initial));
    await start();
    await settings();
    assert.equal(await host.getByLabel('表示倍率', { exact: true }).inputValue(), '1.25');
    await assertZoom(1.25);
    const originalIds = (await zooms()).map((value) => value.id).sort();
    checks.push('saved startup zoom applied to host and Shell views');
    for (const factor of [0.5, 0.75, 1, 1.5, 2, 1.25]) {
      await selectZoom(factor);
      await main(
        `const w=e.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('appdock://host/'));const image=await w.capturePage();process.getBuiltinModule('fs').writeFileSync(${JSON.stringify(path.join(profile, 'settings-'))}+${factor}+'.png',image.toPNG());`,
      );
    }
    checks.push('50/75/100/125/150/200 percent change immediately without recreating windows');
    assert.deepEqual((await zooms()).map((value) => value.id).sort(), originalIds);
    await host.evaluate(() => window.dock.executeCommand('fixture.zoom.open'));
    const local = await until(
      () => context.pages().find((page) => /fixture.zoom\/main.html$/.test(page.url())),
      'local Applet',
    );
    await local.locator('#sample').waitFor();
    await assertZoom(1.25);
    const localSize = await local.locator('#sample').boundingBox();
    assert(localSize.width > 0);
    // Native bounds must use the host zoom exactly once, independent of Windows DPI.
    const rect = await host.locator('.applet-page-viewport').evaluate((element) => {
      const r = element.getBoundingClientRect();
      return {
        x: Math.round(r.x),
        y: Math.round(r.y),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    });
    const actual = await main(
      `const w=e.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('appdock://host/'));const child=w.contentView.children.find(v=>v.children?.some(c=>c.webContents?.getURL().endsWith('/fixture.zoom/main.html')));return child?.getBounds();`,
    );
    assert(actual);
    for (const key of ['x', 'y', 'width', 'height'])
      assert(
        Math.abs(actual[key] - Math.round(rect[key] * 1.25)) <= 2,
        key + ': scaled Applet bounds',
      );
    await local.screenshot({ path: path.join(profile, 'local-applet.png') });
    checks.push('new embedded local Applet inherits zoom with aligned native bounds');
    const localId = (await zooms()).find((value) =>
      value.url.endsWith('/fixture.zoom/main.html'),
    ).id;
    for (const display of ['window', 'page']) {
      await host.evaluate(async (display) => {
        const snapshot = await window.dock.snapshot(),
          value = snapshot.settings.value;
        const current = value.extensions['fixture.zoom'];
        current.pages = { ...current.pages, main: { display } };
        await window.dock.saveSettings(value, snapshot.settings.revision);
      }, display);
      await host.evaluate(() => window.dock.executeCommand('fixture.zoom.open'));
      await assertZoom(1.25);
      assert.equal(
        (await zooms()).find((value) => value.url.endsWith('/fixture.zoom/main.html')).id,
        localId,
      );
    }
    checks.push('page/window/page transfer preserves the same Applet contents and zoom');
    // A real remote AppletSurface exercises remote navigation and independent origins without exposing host APIs.
    await main(
      `const {AppletSurface}=process.getBuiltinModule('module').createRequire(e.app.getAppPath()+'/package.json')('./out/main/main/core/applet-pages.js');globalThis.zoomRemote=new AppletSurface({title:'Zoom remote fixture',url:${JSON.stringify(remote)},remote:true,partition:'zoom-remote',stateFile:${JSON.stringify(path.join(profile, 'remote-window.json'))},onLayout(){}});await globalThis.zoomRemote.open();`,
    );
    let remotePage = await until(
      () => context.pages().find((page) => page.url() === remote),
      'remote surface',
    );
    await remotePage.locator('#remote').waitFor();
    await assertZoom(1.25);
    assert.equal(await remotePage.evaluate(() => typeof window.dock), 'undefined');
    await remotePage.getByRole('link', { name: 'Navigate' }).click();
    await remotePage.waitForURL(remote + '?next');
    await assertZoom(1.25);
    checks.push('remote separate window inherits zoom and retains it across navigation');
    await settings();
    await selectZoom(1.5);
    await local.reload();
    await assertZoom(1.5);
    checks.push('existing local and remote Applets update; local reload retains zoom');
    await host.evaluate(() => window.dock.executeCommand('appdock.commands.search'));
    const overlay = await require('./shell-overlay-helper.cjs').overlayPage(host);
    await assertZoom(1.5);
    await overlay.screenshot({ path: path.join(profile, 'overlay-150.png') });
    await require('./shell-overlay-helper.cjs').closingAction(overlay.keyboard.press('Escape'));
    checks.push('command palette overlay inherits current zoom');
    // Exercise the nested WebAccountController view with an entirely offline HTTPS session.
    const accountAssets = path.join(profile, 'account-assets');
    fs.mkdirSync(accountAssets);
    fs.writeFileSync(
      path.join(accountAssets, 'main.html'),
      '<!doctype html><title>Zoom account UI</title><p>Offline account fixture</p>',
    );
    fs.writeFileSync(
      path.join(accountAssets, 'observer.js'),
      '(()=>({ready:true,status:"Ready",attention:false,data:null}))',
    );
    await main(
      `const req=process.getBuiltinModule('module').createRequire(e.app.getAppPath()+'/package.json');const api=req('./out/main/main/core/web-accounts.js');req('./out/main/main/core/applet-pages.js').closeAppletPages('fixture.zoom');const local=${JSON.stringify(path.join(profile, 'account-local'))};globalThis.zoomAccountSession=ses=>{if(ses.storagePath?.startsWith(local))ses.protocol.handle('https',()=>new Response('<!doctype html><button>Offline account</button>',{headers:{'content-type':'text/html'}}));};e.app.on('session-created',globalThis.zoomAccountSession);globalThis.zoomAccount=api.getWebAccounts('fixture.zoom','Zoom account',${JSON.stringify(accountAssets)},local,{url:'https://zoom.fixture.test/remote.html',observeOrigin:'https://zoom.fixture.test',origins:['https://zoom.fixture.test'],ui:'main.html',observer:'observer.js'},{capabilities:[],page:{id:'main',title:'Zoom account',source:'local',ui:'main.html',openCommand:'fixture.zoom.open',defaultDisplay:'page'},shortcut:()=>false,failed(){}});await globalThis.zoomAccount.start();await globalThis.zoomAccount.open();`,
    );
    await until(
      () => main('return globalThis.zoomAccount.surface.visible;'),
      'embedded account visible',
    );
    const accountBounds = await main(
      "await globalThis.zoomAccount.invoke('viewport',[{x:100,y:40,width:320,height:240}]);return globalThis.zoomAccount.attached.getBounds();",
    );
    const accountSizes = await main(
      'return {size:globalThis.zoomAccount.surface.size,native:globalThis.zoomAccount.surface.ui.getBounds()};',
    );
    assert.equal(accountSizes.size.width, accountSizes.native.width);
    assert.equal(accountSizes.size.height, accountSizes.native.height);
    assert.deepEqual(accountBounds, { x: 150, y: 60, width: 480, height: 360 });
    await assertZoom(1.5);
    await main(
      `await process.getBuiltinModule('module').createRequire(e.app.getAppPath()+'/package.json')('./out/main/main/core/web-accounts.js').closeWebAccounts('fixture.zoom');e.app.removeListener('session-created',globalThis.zoomAccountSession);delete globalThis.zoomAccount;delete globalThis.zoomAccountSession;`,
    );
    checks.push('offline nested Web account contents inherit zoom with CSS-to-DIP bounds');
    // Inject a fixture notification only in this isolated process; availability is simulated explicitly.
    await main(
      `const {NotificationAvailability}=process.getBuiltinModule('module').createRequire(e.app.getAppPath()+'/package.json')('./out/main/main/core/notification-availability.js');NotificationAvailability.prototype.status=()=> 'allowed';`,
    );
    await host.evaluate(() => window.dock.executeCommand('fixture.zoom.notice'));
    await until(
      async () =>
        (await zooms()).filter((value) => /notifications.html$/.test(value.url)).length >= 2,
      'banner and desktop',
    );
    await assertZoom(1.5);
    const desktop = await main(
      `return e.BrowserWindow.getAllWindows().filter(w=>w.getTitle()==='AppDock デスクトップ通知').map(w=>({bounds:w.getBounds(),visible:w.isVisible()}));`,
    );
    assert.equal(desktop.length, 1);
    assert(desktop[0].visible);
    assert.equal(desktop[0].bounds.width, 660);
    for (const page of context.pages().filter((page) => /notifications.html$/.test(page.url())))
      await page.screenshot({
        path: path.join(profile, 'notice-' + context.pages().indexOf(page) + '.png'),
      });
    checks.push(
      'banner and desktop zoom plus 660 DIP desktop width at 150 percent (availability fixture)',
    );
    await main('globalThis.zoomRemote.close();delete globalThis.zoomRemote;');
    await stop();
    await start();
    await settings();
    await assertZoom(1.5);
    assert.equal(await host.getByLabel('表示倍率', { exact: true }).inputValue(), '1.5');
    checks.push('restart restores 150 percent');
    await selectZoom(1);
    const saved = JSON.parse(
      fs.readFileSync(
        path.join(profile, 'settings-' + require('node:os').hostname() + '.json'),
        'utf8',
      ),
    );
    assert.equal(saved.host?.zoomFactor, undefined);
    checks.push('100 percent omitted from PC-specific JSON');
    success = true;
  } catch (error) {
    errors.push(String(error.stack || error));
    process.exitCode = 1;
  } finally {
    await stop().catch((error) => {
      errors.push(String(error));
      process.exitCode = 1;
    });
    if (server) await new Promise((resolve) => server.close(resolve));
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify(
        { success, portable: !!source, sourceHash: source && hash(source), checks, errors },
        null,
        2,
      ),
    );
    fs.writeFileSync(path.join(profile, 'process.log'), output);
    console.log(JSON.stringify({ profile, success, checks, errors }, null, 2));
  }
})();
