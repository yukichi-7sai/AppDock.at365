const { launchTestHost } = require('./electron-test-launcher.cjs');
// Isolated Electron sessions and two independent consumers. No Google traffic or accounts.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { _electron: electron } = require('playwright');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', 'account-groups-ui-' + Date.now());
const local = path.join(profile, 'fixture-local'),
  shared = path.join(profile, 'fixture-shared');
const ids = [randomUUID(), randomUUID()];
const legacyRoot = path.join(local, 'web-accounts', 'fixture.mail');
fs.mkdirSync(legacyRoot, { recursive: true });
const legacy = JSON.stringify({
  version: 1,
  selected: ids[1],
  accounts: [
    { id: ids[0], name: 'Personal', monitoring: false, sound: { enabled: false, file: '' } },
    { id: ids[1], name: 'Work' },
  ],
});
fs.writeFileSync(path.join(legacyRoot, 'accounts.json'), legacy);
const assets = path.join(profile, 'fixture-applet');
fs.mkdirSync(assets, { recursive: true });
fs.writeFileSync(
  path.join(assets, 'index.html'),
  '<!doctype html><html><body><h1>Account group fixture</h1></body></html>',
);
fs.writeFileSync(path.join(assets, 'observer.js'), '({ready: true})');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
let executable = require('electron'),
  packedHash;
if (process.argv[2]) {
  executable = path.join(profile, 'AppDock.at365.exe');
  require('./copy-host.cjs').copyHost(path.resolve(process.argv[2]), executable);
  const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  packedHash = hash(executable);
  assert.equal(packedHash, hash(path.resolve(process.argv[2])));
}
let app;
async function launch(seed) {
  app = await launchTestHost({
    portable: !!process.argv[2],
    mainInspector: true,
    executablePath: executable,
    args: [...(process.argv[2] ? [] : [root]), '--test-profile=' + profile],
    env,
  });
  app.context().setDefaultTimeout(20000);
  let dock;
  await until(() => {
    dock = app
      .context()
      .pages()
      .find((p) => p.url().startsWith('appdock://host/'));
    return !!dock;
  }, 'host window');
  await dock.waitForFunction(() => !!window.dock);
  await app.evaluate(
    async ({ app, session }, data) => {
      const path = process.mainModule.require('node:path');
      const api = process.mainModule.require(
        path.join(app.getAppPath(), 'out/main/main/core/web-accounts.js'),
      );
      const errors = [];
      app.on('session-created', (ses) => {
        if (ses.storagePath && ses.storagePath.startsWith(data.local)) {
          ses.protocol.handle(
            'https',
            () =>
              new Response('<!doctype html><html><body>Offline session fixture</body></html>', {
                headers: { 'content-type': 'text/html' },
              }),
          );
        }
      });
      if (data.seed) {
        for (const [index, id] of data.ids.entries()) {
          const ses = session.fromPath(
            path.join(data.local, 'web-accounts/fixture.mail/sessions', id),
          );
          await ses.cookies.set({
            url: 'https://mail.fixture.test',
            domain: '.fixture.test',
            name: 'login',
            value: index ? 'work' : 'personal',
            expirationDate: Math.floor(Date.now() / 1000) + 86400,
            secure: true,
            sameSite: 'no_restriction',
          });
          await ses.cookies.flushStore();
        }
      }
      const make = (id, origin, group) =>
        api.getWebAccounts(
          id,
          id,
          data.assets,
          data.local,
          {
            accountGroup: { id: group, title: 'Fixture accounts' },
            url: origin + '/',
            observeOrigin: origin,
            origins: [origin],
            ui: 'index.html',
            observer: 'observer.js',
          },
          {
            sharedRoot: data.shared,
            capabilities: ['audio'],
            shortcut: () => false,
            failed: (message) => errors.push(message),
          },
        );
      globalThis.groupFixture = {
        api,
        make,
        errors,
        mail: make('fixture.mail', 'https://mail.fixture.test', 'fixture.google'),
        calendar: make('fixture.calendar', 'https://calendar.fixture.test', 'fixture.google'),
        other: make('fixture.other', 'https://mail.fixture.test', 'fixture.isolated'),
      };
      await groupFixture.mail.start();
      await groupFixture.calendar.start();
    },
    { local, shared, assets, ids, seed },
  );
}
async function until(fn, message) {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error(message);
}
async function shutdown() {
  if (!app) return;
  try {
    await app.evaluate(async () => {
      if (!globalThis.groupFixture) return;
      for (const id of ['fixture.mail', 'fixture.calendar', 'fixture.other'])
        await groupFixture.api.closeWebAccounts(id);
    });
  } finally {
    await app.close();
    app = undefined;
  }
}
(async () => {
  const checks = [];
  try {
    await launch(true);
    await until(
      () =>
        app.evaluate(() =>
          [...groupFixture.mail.views.values(), ...groupFixture.calendar.views.values()].every(
            (v) => !v.webContents.isLoading(),
          ),
        ),
      'fixture pages load',
    );
    const sharedSession = await app.evaluate(async (_, ids) => {
      const a = groupFixture.mail.views.get(ids[0]).webContents,
        b = groupFixture.calendar.views.get(ids[0]).webContents;
      return {
        same: a.session === b.session,
        separateView: a.id !== b.id,
        mail: await a.executeJavaScript('document.cookie'),
        calendar: await b.executeJavaScript('document.cookie'),
        work: await groupFixture.calendar.views
          .get(ids[1])
          .webContents.executeJavaScript('document.cookie'),
        monitoring: groupFixture.calendar.snapshot().accounts[0].monitoring,
      };
    }, ids);
    assert.equal(sharedSession.same, true);
    assert.equal(sharedSession.separateView, true);
    assert.match(sharedSession.mail, /login=personal/);
    assert.match(sharedSession.calendar, /login=personal/);
    assert.match(sharedSession.work, /login=work/);
    assert.equal(sharedSession.monitoring, true);
    checks.push(
      'legacy session reuse, same-account sharing, cross-account isolation, independent monitoring',
    );
    await require('./settings-web-account-live-checks.cjs').check({
      app,
      local,
      shared,
      assets,
      checks,
    });
    await app.evaluate(async () => {
      await groupFixture.mail.open();
    });
    let ui;
    await until(async () => {
      for (const p of app.context().pages())
        if (p.url().includes('/fixture-applet/index.html')) {
          ui = p;
          return true;
        }
      return false;
    }, 'local account UI');
    await ui.evaluate(async (ids) => {
      await window.webAccounts.rename(ids[0], 'Shared rename');
      await window.webAccounts.move(ids[0], 1);
      await window.webAccounts.select(ids[0]);
      await window.webAccounts.setMonitoring(ids[0], true);
    }, ids);
    const snapshots = await app.evaluate(() => ({
      mail: groupFixture.mail.snapshot(),
      calendar: groupFixture.calendar.snapshot(),
    }));
    assert.equal(snapshots.calendar.accounts[1].name, 'Shared rename');
    assert.equal(snapshots.calendar.selected, ids[0]);
    assert.equal(snapshots.mail.selected, ids[0]);
    checks.push('trusted local UI IPC, common rename/order, independent selection');
    await app.evaluate(async () => {
      await groupFixture.other.invoke('add', []);
      await groupFixture.other.start();
    });
    const isolated = await app.evaluate(async () => {
      const c = groupFixture.other,
        id = c.snapshot().selected;
      return (await c.views.get(id).webContents.session.cookies.get({ name: 'login' })).length;
    });
    assert.equal(isolated, 0);
    checks.push('separate group has separate cookies');
    const beforeStop = await app.evaluate(
      (_, id) => groupFixture.calendar.views.get(id).webContents.id,
      ids[0],
    );
    await app.evaluate(async () => {
      await groupFixture.api.closeWebAccounts('fixture.mail');
    });
    assert.equal(
      await app.evaluate((_, id) => groupFixture.calendar.views.get(id).webContents.id, ids[0]),
      beforeStop,
    );
    assert.match(
      await app.evaluate(
        (_, id) =>
          groupFixture.calendar.views.get(id).webContents.executeJavaScript('document.cookie'),
        ids[0],
      ),
      /login=personal/,
    );
    await app.evaluate(async () => {
      groupFixture.mail = groupFixture.make(
        'fixture.mail',
        'https://mail.fixture.test',
        'fixture.google',
      );
      await groupFixture.mail.open();
    });
    checks.push('stopping and restarting one consumer preserves the other consumer');
    await app.evaluate(async ({ dialog }, id) => {
      const original = dialog.showMessageBox;
      dialog.showMessageBox = async () => ({ response: 1 });
      try {
        const a = groupFixture.mail.views.get(id).webContents;
        const b = groupFixture.calendar.views.get(id).webContents;
        const ses = a.session;
        await groupFixture.mail.invoke('remove', [id]);
        groupFixture.removed = {
          allClosed: a.isDestroyed() && b.isDestroyed(),
          cookies: await ses.cookies.get({ name: 'login' }),
        };
        groupFixture.mail.report(id, 'late report', true, {});
        groupFixture.calendar.report(id, 'late report', true, {});
      } finally {
        dialog.showMessageBox = original;
      }
    }, ids[0]);
    const removed = await app.evaluate(() => ({
      ...groupFixture.removed,
      mail: groupFixture.mail.snapshot().accounts.length,
      calendar: groupFixture.calendar.snapshot().accounts.length,
    }));
    assert.equal(removed.allClosed, true);
    assert.deepEqual(removed.cookies, []);
    assert.equal(removed.mail, 1);
    assert.equal(removed.calendar, 1);
    checks.push(
      'confirmed group deletion closes all views, clears shared login and drops late reports',
    );
    await app.evaluate(async () => {
      await groupFixture.calendar.invoke('add', []);
      const id = groupFixture.calendar.snapshot().selected;
      const view = groupFixture.calendar.views.get(id);
      await view.webContents.session.cookies.set({
        url: 'https://calendar.fixture.test',
        name: 'remote-removal-login',
        value: 'keep',
        expirationDate: Math.floor(Date.now() / 1000) + 86400,
      });
      groupFixture.externalRemoval = {
        id,
        session: view.webContents.session,
        mail: groupFixture.mail.views.get(id).webContents,
        calendar: view.webContents,
      };
    });
    fs.writeFileSync(
      path.join(shared, 'web-account-groups/fixture.google/accounts.json'),
      JSON.stringify({ version: 1, accounts: [{ id: ids[1], name: 'Sync work' }] }),
    );
    await until(
      () => app.evaluate(() => groupFixture.calendar.snapshot().accounts[0].name === 'Sync work'),
      'sync rename',
    );
    assert.deepEqual(
      await app.evaluate(async () => ({
        closed:
          groupFixture.externalRemoval.mail.isDestroyed() &&
          groupFixture.externalRemoval.calendar.isDestroyed(),
        cookies: (
          await groupFixture.externalRemoval.session.cookies.get({ name: 'remote-removal-login' })
        ).map((c) => c.value),
      })),
      { closed: true, cookies: ['keep'] },
    );
    checks.push(
      'external roster update reaches all consumers, closes removed views and retains local login',
    );
    await shutdown();
    await launch(false);
    assert.equal(await app.evaluate(() => groupFixture.mail.snapshot().accounts.length), 1);
    assert.equal(
      await app.evaluate(() => groupFixture.mail.snapshot().accounts[0].name),
      'Sync work',
    );
    assert.deepEqual(
      await app.evaluate(
        async (_, id) =>
          (
            await groupFixture.calendar.views
              .get(id)
              .webContents.session.cookies.get({ name: 'login' })
          ).map((c) => c.value),
        ids[1],
      ),
      ['work'],
    );
    assert.equal(fs.readFileSync(path.join(legacyRoot, 'accounts.json'), 'utf8'), legacy);
    assert.deepEqual(await app.evaluate(() => groupFixture.errors), []);
    checks.push(
      'whole application restart preserves surviving login and does not re-import removed legacy identity',
    );
    await shutdown();
    const result = { ok: true, profile, packedHash, checks };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    fs.writeFileSync(path.join(profile, 'failure.txt'), String(error.stack || error));
    await shutdown().catch(() => {});
    throw error;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
