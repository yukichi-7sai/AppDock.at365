const { _electron: electron } = require('playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'),
  profile = path.join(root, '.artifacts', 'notification-banner-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
const main = `
const { app, BrowserWindow, WebContentsView } = require('electron');
const path = require('path');
const root = ${JSON.stringify(root)};
app.setPath('userData', path.join(__dirname,'chromium'));
const { NotificationService } = require(path.join(root,'out/main/main/core/notification-service'));
const { ShellProviderRegistry } = require(path.join(root,'out/main/main/core/shell-provider-registry'));
const { NotificationSurfaceHost } = require(path.join(root,'out/main/main/core/notification-surface-host'));
const { NotificationSurfaceController } = require(path.join(root,'out/main/main/core/notification-surface-controller'));
let fixture;
app.whenReady().then(async()=>{
 const window = new BrowserWindow({width:1000,height:800,webPreferences:{sandbox:true}});
 await window.loadURL('data:text/html,<html><body><button id="host">Host focus</button><input id="keep"></body></html>');
 window.webContents.setZoomFactor(1);
 const service=new NotificationService();
 let selected='appdock.default-shell', dark=true, executions=0, position='top-center';
 const providers=[
 {id:'appdock.default-shell',sourceKind:'builtin',folder:path.join(root,'out/shells/default'),version:'1',enabled:true,state:'running',shell:{views:{'notification.banner':'notifications.html'}}},
 {id:'fixture.partial',folder:path.join(root,'out/shells/default'),version:'1',enabled:true,state:'running',shell:{views:{'notification.banner':'notifications.html'}}},
 {id:'fixture.stalled',folder:__dirname,version:'1',enabled:true,state:'running',shell:{views:{'notification.banner':'stalled.html'}}},
 ];
 const host=new NotificationSurfaceHost({window,controller:new NotificationSurfaceController(service,()=>dark),preload:path.join(root,'out/main/main/notification-surface-preload.js'),
 providers:()=>providers,registry:new ShellProviderRegistry({providers:()=>providers,assignments:()=>({'notification.banner':selected}),safeMode:false}),ready:()=>true,settings:()=>({accent:true}),
 execute:async(id,command)=>{if(command!=='fixture.own')throw Error('Not owned');return id;},
 position:()=>position,layer:()=>{},failed:(m)=>console.error(m)});
 fixture={window,service,host,providers,
 publish: (key,extra={})=>service.upsert('host.fixture',{dedupeKey:key,level:'info',title:'Notice '+key,body:'Fixture message',
 lifetime:{type:'manual'},dismissible:true,targets:['banner'],history:'persistent',
 historyText:{title:'Safe fixture '+key,body:'Safe summary'},
 actions:[{key:'run',label:'Run '+key,run:async()=>{executions++;await new Promise(r=>setTimeout(r,80));}}],
 ...extra}),
 select:id=>{selected=id;host.refresh();}, theme:value=>{dark=value;host.refresh();},
 position:value=>{position=value;host.refresh();},
 count:()=>executions };
 globalThis.fixture=fixture;
 window.on('closed',()=>{host.dispose();service.dispose();app.quit();});
});`;
fs.writeFileSync(path.join(profile, 'main.cjs'), main);
fs.writeFileSync(path.join(profile, 'stalled.html'), '<html><body>Waiting</body></html>');
const until = async (fn, label) => {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    const result = await fn();
    if (result) return result;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error(label);
};
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
(async () => {
  const checks = [],
    app = await electron.launch({
      executablePath: require('electron'),
      args: [path.join(profile, 'main.cjs')],
      env,
    });
  const errors = [];
  app.process().stderr.on('data', (d) => errors.push(String(d)));
  try {
    const base = await app.firstWindow();
    await until(() => app.evaluate(() => !!globalThis.fixture), 'fixture startup');
    const all = () => app.context().pages();
    const banner = async (provider) =>
      until(async () => {
        for (const p of all().filter((p) => p.url().endsWith('/notifications.html'))) {
          try {
            const c = await p.evaluate(() => window.appdockNotifications.connect());
            if (
              c.providerAppletId === provider &&
              (await app.evaluate(
                (_, session) =>
                  fixture.host['active']?.session === session && fixture.host['active']?.ready,
                c.sessionId,
              ))
            )
              return p;
          } catch {}
        }
        return null;
      }, 'banner ' + provider);
    await app.evaluate(() => {
      for (let i = 0; i < 5; i++)
        fixture.publish(String(i), { level: ['info', 'warning', 'error'][i % 3] });
    });
    let p = await banner('appdock.default-shell');
    await p.getByRole('region', { name: 'Notice 0', exact: true }).waitFor();
    assert.equal(await p.getByRole('region').count(), 3);
    await p.getByRole('button', { name: 'ほか2件を表示' }).click();
    assert.equal(await p.getByRole('region').count(), 5);
    await p.getByRole('button', { name: 'Run 4', exact: true }).scrollIntoViewIfNeeded();
    const bound = await app.evaluate(() => {
      const views = fixture.window.contentView.children;
      return views.at(-1).getBounds();
    });
    assert.ok(bound.height <= 320 && bound.width <= 680);
    await p.screenshot({ path: path.join(profile, 'stack-dark.png') });
    checks.push(
      'five notifications / stable order / expansion and scroll / bounded native surface',
    );
    assert.equal(await p.evaluate(() => typeof window.dock), 'undefined');
    assert.equal(await p.evaluate(() => typeof require), 'undefined');
    await assert.rejects(
      p.evaluate(() => window.appdockNotifications.executeCommand('foreign.command')),
      /Not owned/,
    );
    await assert.rejects(
      base.evaluate(
        () => window.appdockNotifications?.connect() ?? Promise.reject(Error('No bridge')),
      ),
      /No bridge/,
    );
    checks.push('limited bridge / foreign operation rejected / no Node or general host bridge');
    await base.locator('#host').focus();
    assert.equal(await p.evaluate(() => typeof window.appdockNotifications.onFocus), 'undefined');
    await p.getByRole('button', { name: 'Run 0', exact: true }).waitFor();
    assert(await base.evaluate(() => document.hasFocus()));
    await p.getByRole('button', { name: 'Run 0', exact: true }).focus();
    await p.keyboard.press('Escape');
    await until(() => base.evaluate(() => document.hasFocus()), 'focus returned');
    checks.push(
      'banner focus request removed / Escape returns to host / no automatic focus on publish',
    );
    await p.getByRole('button', { name: 'Run 1', exact: true }).click();
    await until(() => app.evaluate(() => fixture.count() === 1), 'operation once');
    await p.getByRole('button', { name: 'Notice 2を閉じる', exact: true }).click();
    await until(
      () =>
        p
          .getByRole('region')
          .count()
          .then((n) => n === 4),
      'manual dismiss',
    );
    const timed = await app.evaluate(() =>
      fixture.publish('timed', { lifetime: { type: 'timed', milliseconds: 400 } }),
    );
    await until(
      () =>
        app.evaluate(
          (_, id) => fixture.service.list().find((i) => i.id === id)?.status === 'expired',
          timed,
        ),
      'deadline',
    );
    checks.push('generic actions / manual dismiss / timed expiry');
    const id = await p.evaluate(
      async () => (await window.appdockNotifications.connect()).snapshot.items[0].id,
    );
    await app.evaluate(() => fixture.select('fixture.partial'));
    p = await banner('fixture.partial');
    await p.getByRole('region', { name: 'Notice 0', exact: true }).waitFor();
    assert.equal(
      await p.evaluate(
        async () => (await window.appdockNotifications.connect()).snapshot.items[0].id,
      ),
      id,
    );
    assert.deepEqual(await p.evaluate(() => window.appdockNotifications.getSettings()), {
      accent: true,
    });
    assert.equal(
      await p.evaluate(() => window.appdockNotifications.executeCommand('fixture.own')),
      'fixture.partial',
    );
    checks.push(
      'notification-only provider / shared settings and command contract / notification identity retained',
    );
    await app.evaluate(
      () => (fixture.providers.find((p) => p.id === 'fixture.partial').state = 'error'),
    );
    await app.evaluate(() => fixture.host.refresh());
    p = await banner('appdock.default-shell');
    await p.getByRole('region', { name: 'Notice 0', exact: true }).waitFor();
    assert.equal(
      await p.evaluate(
        async () => (await window.appdockNotifications.connect()).snapshot.items[0].id,
      ),
      id,
    );
    await app.evaluate(() => {
      fixture.providers.find((p) => p.id === 'fixture.partial').state = 'running';
      fixture.host.retry();
    });
    p = await banner('fixture.partial');
    // Renderer failure preserves content and affects only the banner lane.
    const cdp = await app.context().newCDPSession(p);
    void cdp.send('Page.crash').catch(() => {});
    p = await banner('appdock.default-shell');
    await p.getByRole('region', { name: 'Notice 0', exact: true }).waitFor();
    checks.push('provider stop and restart / renderer crash fallback / no duplicate notification');
    await app.evaluate(() => fixture.select('fixture.stalled'));
    await until(
      () =>
        app.evaluate(() =>
          fixture.host['options'].registry.failed('notification.banner', 'fixture.stalled', '1'),
        ),
      'ready timeout',
    );
    p = await banner('appdock.default-shell');
    await p.getByRole('region', { name: 'Notice 0', exact: true }).waitFor();
    checks.push('ready timeout retains previous ready view and falls back');
    await app.evaluate(() => {
      fixture.select('appdock.default-shell');
      fixture.theme(false);
      fixture.window.webContents.setZoomFactor(1.25);
      fixture.window.setSize(720, 580);
      fixture.host.refresh();
    });
    await p.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await p.screenshot({ path: path.join(profile, 'stack-light-zoom.png') });
    const zoomBounds = await app.evaluate(() =>
      fixture.window.contentView.children.at(-1).getBounds(),
    );
    assert.ok(zoomBounds.width <= 720 && zoomBounds.height <= 232);
    await app.evaluate(() => fixture.position('bottom-right'));
    const bottomBounds = await app.evaluate(() => ({
      rect: fixture.window.contentView.children.at(-1).getBounds(),
      content: fixture.window.getContentSize(),
    }));
    assert.equal(bottomBounds.content[0] - bottomBounds.rect.x - bottomBounds.rect.width, 20);
    assert.equal(bottomBounds.content[1] - bottomBounds.rect.y - bottomBounds.rect.height, 60);
    await p.screenshot({ path: path.join(profile, 'bottom-right-light-zoom.png') });
    await app.evaluate(() => fixture.window.hide());
    assert.equal(
      await app.evaluate(() => fixture.window.contentView.children.at(-1).getVisible()),
      false,
    );
    await app.evaluate(() => fixture.window.show());
    await p.getByRole('region', { name: 'Notice 0', exact: true }).waitFor();
    const history = await app.evaluate(() => fixture.service.historyEntries());
    assert.ok(history.length > 0);
    assert.ok(history.every((item) => !('actions' in item) && !('read' in item)));
    assert.equal(fs.existsSync(path.join(profile, 'history.json')), false);
    checks.push(
      'light / narrow / 125 percent zoom / bottom-right anchoring / hide and restore / safe history',
    );
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify({ ok: true, checks, profile }, null, 2),
    );
    console.log(JSON.stringify({ ok: true, checks, profile }, null, 2));
  } catch (e) {
    fs.writeFileSync(path.join(profile, 'failure.log'), String(e) + '\n' + errors.join(''));
    throw e;
  } finally {
    await app.close().catch(() => {});
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
