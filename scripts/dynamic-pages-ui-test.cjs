const { _electron: electron } = require('playwright');
const { settingsPage } = require('./settings-host-helper.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `dynamic-pages-ui-${Date.now()}`);
const fixture = path.join(profile, 'extensions', 'test.dynamic');
fs.mkdirSync(fixture, { recursive: true });
const source = path.resolve(
  process.env.APPDOCK_WEB_APPLET_TEST_SOURCE ??
    path.resolve(root, '../../40.ARTIFACT/Applet.WebApplet.at365/extensions/at365.web-applet'),
);
fs.cpSync(source, path.join(profile, 'extensions', 'at365.web-applet'), { recursive: true });
fs.writeFileSync(
  path.join(fixture, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'test.dynamic',
    name: 'Dynamic',
    displayName: '動的ページ検証',
    version: '1.0.0',
    minimumHostVersion: '0.44.0',
    runtime: 'node',
    entry: 'index.cjs',
    capabilities: ['pages', 'dynamic-pages', 'storage', 'web-profiles'],
    commands: [
      { id: 'test.dynamic.open', title: 'Open' },
      { id: 'test.dynamic.update', title: 'Update' },
      { id: 'test.dynamic.hide', title: 'Hide' },
      { id: 'test.dynamic.dispose', title: 'Dispose' },
      { id: 'test.dynamic.remove', title: 'Remove' },
      { id: 'test.dynamic.stale', title: 'Stale' },
    ],
  }),
);
fs.writeFileSync(
  path.join(fixture, 'index.cjs'),
  `exports.activate=async c=>{
const definitions=[{id:'one',title:'動的One',source:'local',ui:'index.html',context:{document:'one'}},{id:'two',title:'動的Two',source:'local',ui:'index.html',context:{document:'two'}}];
await c.pages.replace(definitions,(await c.pages.list()).revision);
c.commands.register('test.dynamic.open','Open',()=>c.pages.open('one'));
c.commands.register('test.dynamic.update','Update',async()=>{definitions[0].title='更新One'; definitions[0].defaultDisplay='window'; await c.pages.replace(definitions,(await c.pages.list()).revision);});
c.commands.register('test.dynamic.hide','Hide',()=>c.pages.hide('one'));
c.commands.register('test.dynamic.dispose','Dispose',()=>c.pages.dispose('one'));
c.commands.register('test.dynamic.remove','Remove',async()=>c.pages.replace([], (await c.pages.list()).revision));
c.commands.register('test.dynamic.stale','Stale',async()=>{let rejected=false;try{await c.pages.replace([],0);}catch{rejected=true;} if(!rejected)throw Error('Stale revision accepted');
if((await c.webProfiles.list()).length)throw Error('Foreign profiles exposed');
for(const action of [()=>c.pages.open('manage'),()=>c.pages.openItem('web.11111111-2222-3333-4444-555555555555'),async()=>c.pages.replace([{id:'escape',title:'Escape',source:'local',ui:'../at365.web-applet/extension.json'}],(await c.pages.list()).revision)]){let blocked=false;try{await action();}catch{blocked=true;}if(!blocked)throw Error('Ownership boundary failed');}
});
};`,
);
fs.writeFileSync(
  path.join(fixture, 'index.html'),
  `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'"></head><body><h1>Local document</h1><input aria-label="Document text"><script src="ui.js"></script></body></html>`,
);
fs.writeFileSync(
  path.join(fixture, 'ui.js'),
  `window.appletPage.snapshot().then(s=>document.querySelector('h1').textContent=s.page.context.document);`,
);
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.hardwareAcceleration = false;
settings.globalShortcutCommands = [];
settings.keybindings = [];
settings.gestures.enabled = false;
const legacy = 'web.11111111-2222-3333-4444-555555555555';
const account = 'account.11111111-2222-3333-4444-555555555555';
settings.extensions['at365.web-applet'] = { enabled: true, settings: {} };
settings.migrations = { webApplet: { version: 1, owner: 'at365.web-applet', ids: [legacy] } };
settings.extensions['at365.web-applet'].settings.items = [
  {
    id: legacy,
    name: '移行サイト',
    url: 'https://example.test/',
    accountId: account,
    enabled: true,
    display: 'page',
    navigation: 'same-origin',
    allowedOrigins: [],
    icon: '',
  },
];
fs.mkdirSync(path.join(profile, 'data/web-applets'), { recursive: true });
fs.writeFileSync(
  path.join(profile, 'data/web-applets/accounts.json'),
  JSON.stringify({ schemaVersion: 1, accounts: [{ id: account, name: '移行アカウント' }] }),
);
settings.extensions['test.dynamic'] = { enabled: true, settings: {} };
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
let app, dock;
const checks = [];
const until = async (fn, label) => {
  const end = Date.now() + 25000;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error(label);
};
const snapshot = () => dock.evaluate(() => window.dock.snapshot());
const command = (id) => dock.evaluate((id) => window.dock.executeCommand(id), id);
const ui = (suffix) =>
  until(
    () =>
      app
        .context()
        .pages()
        .find((p) => p.url().endsWith(suffix)),
    suffix,
  );
(async () => {
  try {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({
      executablePath: process.argv[2] ? path.resolve(process.argv[2]) : require('electron'),
      args: [...(process.argv[2] ? [] : [root]), '--test-profile=' + profile],
      env,
    });
    dock = await app.firstWindow();
    await until(async () => {
      const s = await snapshot();
      return ['test.dynamic', 'at365.web-applet'].every((id) =>
        s.extensions.some((e) => e.id === id && e.state === 'running'),
      );
    }, 'providers running');
    const migrated = await snapshot();
    assert.ok(
      migrated.extensions.some(
        (e) => e.id === legacy && e.collection?.owner === 'at365.web-applet',
      ),
    );
    assert.equal(migrated.webAccounts.find((a) => a.id === account).name, '移行アカウント');
    checks.push('saved site ID and roster aliases remain readable');
    await command('test.dynamic.open');
    let local = await ui('/test.dynamic/index.html');
    await local.getByLabel('Document text').fill('保持するテキスト');
    assert.equal(await local.locator('h1').textContent(), 'one');
    assert.deepEqual(await local.evaluate(() => [typeof require, typeof window.dock]), [
      'undefined',
      'undefined',
    ]);
    await command('test.dynamic.update');
    assert.equal(await local.getByLabel('Document text').inputValue(), '保持するテキスト');
    await command('test.dynamic.hide');
    await command('test.dynamic.open');
    assert.equal(await local.getByLabel('Document text').inputValue(), '保持するテキスト');
    await command('test.dynamic.dispose');
    await command('test.dynamic.open');
    local = await ui('/test.dynamic/index.html');
    assert.equal(await local.getByLabel('Document text').inputValue(), '');
    await command('test.dynamic.stale');
    await command('test.dynamic.pages.two.open');
    const second = await until(async () => {
      for (const page of app
        .context()
        .pages()
        .filter((p) => p.url().endsWith('/test.dynamic/index.html')))
        if ((await page.locator('h1').textContent()) === 'two') return page;
    }, 'independent second page');
    await second.getByLabel('Document text').fill('Second page');
    await command('test.dynamic.dispose');
    assert.equal(await second.getByLabel('Document text').inputValue(), 'Second page');
    checks.push('local dynamic pages preserve state on update/hide; dispose recreates');
    await command('appdock.settings.open');
    const manage = await settingsPage(dock);
    await manage.getByTestId('settings-nav:applet:at365.web-applet').click();
    const siteField = (field) =>
      manage.getByTestId(`setting:applet%3Aat365.web-applet/setting%3Aitems/${field}:input`);
    await manage.getByTestId('setting:applet%3Aat365.web-applet/setting%3Aitems:add').click();
    await siteField('name').fill('追加サイト');
    await siteField('url').fill('https://second.test/');
    await manage.getByTestId('settings-dialog-confirm').click();
    await until(async () => !(await manage.getByTestId('settings-dialog').count()), 'site saved');
    const saved = await snapshot();
    const added = saved.extensions.find((e) => e.displayName === '追加サイト');
    assert.ok(added?.collection);
    assert.equal(
      saved.settings.value.keybindings.filter((b) => b.command.startsWith(added.id + '.')).length,
      3,
    );
    await app.evaluate(({ app }) =>
      app.on('session-created', (ses) => {
        if (ses.isPersistent())
          ses.protocol.handle(
            'https',
            () =>
              new Response('<html><body>Remote fixture</body></html>', {
                headers: { 'content-type': 'text/html' },
              }),
          );
      }),
    );
    await command(added.id + '.open');
    const remote = await until(
      () =>
        app
          .context()
          .pages()
          .find((p) => p.url().startsWith('https://second.test')),
      'remote page',
    );
    assert.deepEqual(
      await remote.evaluate(() => [typeof require, typeof window.dock, typeof window.appletPage]),
      ['undefined', 'undefined', 'undefined'],
    );
    checks.push(
      'Applet management adds a persisted remote page with shortcuts; remote has no bridge',
    );
    await dock.evaluate(() => window.dock.toggleExtension('at365.web-applet', false));
    await until(
      () =>
        !app
          .context()
          .pages()
          .some((p) => p.url().startsWith('https://second.test')),
      'remote closed',
    );
    const stopped = await snapshot();
    assert.equal(stopped.settings.value.extensions['at365.web-applet'].settings.items.length, 2);
    assert.equal(stopped.extensions.find((e) => e.id === added.id).state, 'stopped');
    await command('test.dynamic.remove');
    assert.equal(
      (await snapshot()).extensions.find((e) => e.id === 'test.dynamic').pages.length,
      0,
    );
    checks.push(
      'provider stop closes owned pages and keeps settings; dynamic removal clears catalogue',
    );
    await app.close();
    app = null;
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify({ ok: true, checks }, null, 2),
    );
    console.log(JSON.stringify({ ok: true, profile, checks }));
  } catch (error) {
    console.error(error);
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify({ ok: false, checks, error: String(error) }, null, 2),
    );
    if (app) {
      await dock?.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
      await app.close().catch(() => {});
    }
    process.exitCode = 1;
  }
})();
