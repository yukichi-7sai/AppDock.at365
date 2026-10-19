const { settleSettings } = require('./settings-immediate-helper.cjs');
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `applet-pages-${Date.now()}`);
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.hardwareAcceleration = false;
settings.globalShortcutCommands = [];
const fixture = path.join(profile, 'extensions', 'test.pages');
fs.mkdirSync(fixture, { recursive: true });
fs.writeFileSync(
  path.join(fixture, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'test.pages',
    name: 'Pages fixture',
    displayName: 'ページ検証',
    version: '1.0.0',
    minimumHostVersion: '0.18.0',
    runtime: 'node',
    entry: 'index.js',
    capabilities: ['pages', 'settings', 'storage'],
    settings: [{ key: 'flag', title: 'Flag', type: 'boolean', default: true }],
    commands: [
      { id: 'test.pages.open', title: 'Fixtureを開く', activateOnExecute: true },
      { id: 'test.pages.mark', title: 'Mark' },
    ],
    pages: [
      {
        id: 'main',
        title: 'ページ検証',
        icon: 'folder',
        source: 'local',
        ui: 'index.html',
        openCommand: 'test.pages.open',
      },
    ],
  }),
);
fs.writeFileSync(
  path.join(fixture, 'index.js'),
  `exports.activate = async c => {
  c.commands.register('test.pages.open', 'Fixtureを開く', () => c.pages.open('main'));
  c.commands.register('test.pages.mark', 'Mark', () => c.storage.set('marked', true));
};`,
);
fs.writeFileSync(
  path.join(fixture, 'index.html'),
  `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'"></head><body><h1>ページ検証</h1><input aria-label="保持する入力"><p id="theme"></p><script src="ui.js"></script></body></html>`,
);
fs.writeFileSync(
  path.join(fixture, 'ui.js'),
  `const update = () => window.appletPage.snapshot().then(s => document.getElementById('theme').textContent = s.dark ? 'dark' : 'light'); update(); window.appletPage.onChanged(update);`,
);
const gmail = path.resolve(root, '../../40.ARTIFACT/Applet.Gmail.at365/Applet.Gmail.at365');
fs.cpSync(gmail, path.join(profile, 'extensions', 'Applet.Gmail.at365'), { recursive: true });
settings.extensions['test.pages'] = { enabled: false, settings: {} };
settings.extensions['at365.gmail'] = { enabled: false, settings: { notifications: false } };
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
const checks = [];
let app, dock, rail;
const until = async (fn, message) => {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error(message);
};
const localUi = async (suffix) =>
  until(
    () =>
      app
        .context()
        .pages()
        .find((page) => page.url().endsWith(suffix)),
    `Missing UI ${suffix}`,
  );
const settingsUi = () => require('./settings-host-helper.cjs').settingsPage(dock);
const button = (title) =>
  title === 'Gmail'
    ? rail.locator('[data-ribbon-id="page:at365.gmail:gmail"]')
    : require('./settings-host-helper.cjs')
        .deferred(async () => {
          if (['ホーム', '設定', 'Applet', 'ログ', 'ページ検証', 'Gmail'].includes(title))
            return rail;
          const snapshot = await dock.evaluate(() => window.dock.snapshot());
          return snapshot.navigation.route === 'settings' ? settingsUi() : dock;
        })
        .getByRole('button', { name: title, exact: true });
const setDisplay = (extensionId, pageId, display) =>
  dock.evaluate(
    async ({ extensionId, pageId, display }) => {
      const snapshot = await window.dock.snapshot(),
        value = snapshot.settings.value;
      const current = value.extensions[extensionId];
      value.extensions[extensionId] = {
        ...current,
        pages: { ...current.pages, [pageId]: { display } },
      };
      await window.dock.saveSettings(value, snapshot.settings.revision);
    },
    { extensionId, pageId, display },
  );
const nativeWindows = () =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
const remote = (id, action) =>
  app.evaluate(
    async ({ webContents }, { id, action }) => {
      const contents = webContents
        .getAllWebContents()
        .find(
          (w) =>
            w.getURL().startsWith('https://mail.google.com') && w.session.storagePath.endsWith(id),
        );
      if (!contents) throw Error('Missing Gmail contents');
      return contents.executeJavaScript(action);
    },
    { id, action },
  );
async function launch() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath: process.argv[2] ? path.resolve(process.argv[2]) : require('electron'),
    args: [...(process.argv[2] ? [] : [root]), `--test-profile=${profile}`],
    env,
  });
  dock = require('./settings-aware-page.cjs').settingsAwarePage(await app.firstWindow());
  await until(() => {
    rail = app
      .context()
      .pages()
      .find((p) => p.url().includes('/shells/default/index.html'));
    return !!rail;
  }, 'Shell renderer');
  await rail.locator('[data-ribbon-id="home"]').waitFor();
  await require('./shell-overlay-helper.cjs').homePage(dock);
  await app.evaluate(({ app }) => {
    app.on('session-created', (ses) => {
      if (!ses.isPersistent()) return;
      ses.protocol.handle(
        'https',
        () =>
          new Response(
            `<!doctype html><html><body style="background:white"><main role="main"><table><tbody><tr class="zA zE"><td class="yW"><span email="fixture@example.test" name="Fixture">Fixture</span></td><td><span class="bog" data-legacy-thread-id="initial">初回未読</span></td></tr></tbody></table><input aria-label="mail input"></main></body></html>`,
            { headers: { 'content-type': 'text/html; charset=utf-8' } },
          ),
      );
    });
  });
}
(async () => {
  try {
    await launch();
    assert.equal(await rail.locator('[data-ribbon-id="page:test.pages:main"]').count(), 0);
    assert.equal(await rail.locator('[data-ribbon-id="page:at365.gmail:gmail"]').count(), 0);
    await dock.evaluate(() => window.dock.toggleExtension('test.pages', true));
    await button('ページ検証').click();
    let ui = await localUi('/test.pages/index.html');
    await ui.getByLabel('保持する入力').fill('表示先を変えても保持');
    await until(
      async () =>
        (await rail
          .locator('[data-ribbon-id="page:test.pages:main"]')
          .getAttribute('aria-current')) === 'page',
      'Page selection',
    );
    assert.ok((await dock.locator('.applet-page-viewport').boundingBox()).width > 700);
    assert.ok(await ui.evaluate(() => window.innerWidth > 700));
    await button('ページ検証').click();
    assert.ok(await ui.evaluate(() => window.innerWidth > 700));
    assert.equal(await nativeWindows(), 1);
    assert.deepEqual(
      await ui.evaluate(() => ({ node: typeof require, dock: typeof window.dock, flag: true })),
      { node: 'undefined', dock: 'undefined', flag: true },
    );
    await ui.evaluate(() => window.appletPage.executeCommand('test.pages.mark'));
    assert.equal(
      await ui.evaluate(() =>
        window.appletPage.executeCommand('appdock.quit').then(
          () => false,
          () => true,
        ),
      ),
      true,
    );
    checks.push(
      'Generic local page / owned command bridge / native Window count / process isolation',
    );
    await button('コマンドを検索 Ctrl+P').click();
    const palette = await require('./shell-overlay-helper.cjs').overlayPage(dock);
    await require('./shell-overlay-helper.cjs').closingAction(palette.keyboard.press('Escape'));
    assert.equal(await ui.getByLabel('保持する入力').inputValue(), '表示先を変えても保持');
    await setDisplay('test.pages', 'main', 'window');
    await button('ページ検証').click();
    assert.equal(await nativeWindows(), 2);
    assert.equal(await ui.getByLabel('保持する入力').inputValue(), '表示先を変えても保持');
    await setDisplay('test.pages', 'main', 'page');
    await until(
      async () =>
        (await rail
          .locator('[data-ribbon-id="page:test.pages:main"]')
          .getAttribute('aria-current')) === 'page',
      'Return to page',
    );
    assert.equal(await ui.getByLabel('保持する入力').inputValue(), '表示先を変えても保持');
    checks.push('Same UI/input survives page-window-page; command palette overlays page');

    await dock.evaluate(() => window.dock.toggleExtension('at365.gmail', true));
    await button('Gmail').click();
    const gmailUi = await localUi('/web/index.html');
    const snapshot = () => gmailUi.evaluate(() => window.webAccounts.snapshot());
    await gmailUi.evaluate(async () => {
      if (!(await window.webAccounts.snapshot()).accounts.length) await window.webAccounts.add();
    });
    await until(async () => (await snapshot()).accounts[0].data?.pending === 1, 'Gmail baseline');
    const account = (await snapshot()).selected;
    fs.writeFileSync(
      path.join(profile, 'view-diagnostics.json'),
      JSON.stringify(
        await app.evaluate(({ BrowserWindow }) => {
          const tree = (view) => ({
            type: view.constructor.name,
            bounds: view.getBounds(),
            url: view.webContents?.getURL(),
            children: view.children.map(tree),
          });
          return BrowserWindow.getAllWindows().map((window) => ({
            title: window.getTitle(),
            visible: window.isVisible(),
            tree: tree(window.contentView),
          }));
        }),
        null,
        2,
      ),
    );
    fs.writeFileSync(
      path.join(profile, 'layout-diagnostics.json'),
      JSON.stringify(
        await dock.evaluate(() =>
          [
            '.shell',
            'main',
            '.page-content',
            '.applet-page-viewport',
            '.settings-sidebar-slot',
          ].map((selector) => {
            const element = document.querySelector(selector);
            if (!element) return { selector, missing: true };
            const style = getComputedStyle(element);
            return {
              selector,
              rect: element.getBoundingClientRect().toJSON(),
              hidden: element.hidden,
              display: style.display,
              width: style.width,
              alignItems: style.alignItems,
              gridColumn: style.gridColumn,
              gridRow: style.gridRow,
            };
          }),
        ),
        null,
        2,
      ),
    );
    await remote(
      account,
      "document.cookie='fixture=persisted; Max-Age=3600; SameSite=Lax; Secure'",
    );
    await gmailUi.getByRole('button', { name: /^新着一覧/ }).click();
    await gmailUi.getByPlaceholder('送信元・件名・アカウント名で検索').fill('保持');
    const contentsId = await app.evaluate(
      ({ webContents }, account) =>
        webContents
          .getAllWebContents()
          .find(
            (w) =>
              w.getURL().startsWith('https://mail.google.com') &&
              w.session.storagePath.endsWith(account),
          ).id,
      account,
    );
    await button('設定').click();
    await (
      await settingsUi()
    )
      .locator('.settings-categories')
      .getByRole('button', { name: 'プロフィール', exact: true })
      .click();
    await (
      await settingsUi()
    )
      .getByRole('heading', { name: 'プロフィール', level: 1, exact: true })
      .waitFor();
    await button('JSON').click();
    const noticeDraft = await until(async () => {
      const value = JSON.parse(
        await (await settingsUi()).getByLabel('設定JSON', { exact: true }).inputValue(),
      );
      return value.profile ? value : null;
    }, 'Profile partial JSON rendered');
    noticeDraft.profile.name = 'Gmail overlay fixture';
    await (
      await settingsUi()
    )
      .getByLabel('設定JSON', { exact: true })
      .fill(JSON.stringify(noticeDraft));
    await button('Gmail').click();
    await settleSettings(dock);
    assert.equal(
      await gmailUi.getByPlaceholder('送信元・件名・アカウント名で検索').inputValue(),
      '保持',
    );
    assert.equal((await snapshot()).selected, account);
    assert.equal(
      await dock.evaluate(async () => (await window.dock.snapshot()).settings.value.profile.name),
      'Gmail overlay fixture',
    );
    assert.equal(
      await app.evaluate(({ webContents }, id) => !!webContents.fromId(id), contentsId),
      true,
    );
    checks.push('immediate settings preserve Gmail search/account and native WebContents');
    await setDisplay('at365.gmail', 'gmail', 'window');
    await button('Gmail').click();
    assert.equal(
      await gmailUi.getByPlaceholder('送信元・件名・アカウント名で検索').inputValue(),
      '保持',
    );
    await setDisplay('at365.gmail', 'gmail', 'page');
    await button('ホーム').click();
    const homeFocus = await app.evaluate(
      ({ webContents }) => webContents.getFocusedWebContents()?.id,
    );
    await dock.evaluate(() => window.dock.executeCommand('at365.gmail.nextAccount'));
    assert.equal(
      await app.evaluate(({ webContents }) => webContents.getFocusedWebContents()?.id),
      homeFocus,
    );
    await require('./shell-overlay-helper.cjs').homePage(dock);
    await remote(
      account,
      'document.querySelector(\'tbody\').insertAdjacentHTML(\'afterbegin\', \'<tr class="zA zE"><td class="yW"><span name="Fixture">Fixture</span></td><td><span class="bog" data-legacy-thread-id="new">背景で到着</span></td></tr>\')',
    );
    await until(
      async () => (await snapshot()).accounts[0].data?.pending === 2,
      'Background monitoring while away from page',
    );
    assert.equal(await remote(account, 'document.cookie'), 'fixture=persisted');
    assert.equal(
      await app.evaluate(
        ({ webContents }, account) =>
          webContents
            .getAllWebContents()
            .find(
              (w) =>
                w.getURL().startsWith('https://mail.google.com') &&
                w.session.storagePath.endsWith(account),
            ).id,
        account,
      ),
      contentsId,
    );
    checks.push(
      'Gmail same contents/session/account/search state and background monitoring while Home active',
    );
    await button('Gmail').click();
    await gmailUi.getByRole('button', { name: '受信トレイ', exact: true }).click();
    await dock.screenshot({ path: path.join(profile, 'gmail-page.png') });
    await app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find(
        (w) => w.webContents.getURL() === 'appdock://host/index.html',
      );
      window.minimize();
    });
    await remote(
      account,
      'document.querySelector(\'tbody\').insertAdjacentHTML(\'afterbegin\', \'<tr class="zA zE"><td><span class="bog" data-legacy-thread-id="minimized">最小化中</span></td></tr>\')',
    );
    await until(
      async () => (await snapshot()).accounts[0].data?.pending === 3,
      'Minimized monitoring',
    );
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL() === 'appdock://host/index.html')
        .restore(),
    );

    const ribbonBeforeStop = (await dock.evaluate(() => window.dock.snapshot())).settings.value
      .ribbon;
    await rail.locator('[data-ribbon-id="extensions"]').click();
    await dock
      .locator('.sidebar-extensions')
      .getByRole('button', { name: /^Gmail/ })
      .click();
    const gmailToggle = dock.getByRole('switch', { name: 'Gmailを有効にする', exact: true });
    await gmailToggle.click();
    await until(
      async () => (await rail.locator('[data-ribbon-id="page:at365.gmail:gmail"]').count()) === 0,
      'Stopped Gmail ribbon disappears',
    );
    await until(() => gmailUi.isClosed(), 'Stopped Gmail UI disposed');
    assert.equal(await rail.locator('[data-ribbon-id="page:test.pages:main"]').count(), 1);
    assert.deepEqual(
      (await dock.evaluate(() => window.dock.snapshot())).settings.value.ribbon,
      ribbonBeforeStop,
    );
    await gmailToggle.click();
    await until(
      async () => (await rail.locator('[data-ribbon-id="page:at365.gmail:gmail"]').count()) === 1,
      'Resumed Gmail ribbon returns',
    );
    await button('Gmail').click();
    const resumedUi = await localUi('/web/index.html');
    assert.equal((await resumedUi.evaluate(() => window.webAccounts.snapshot())).selected, account);
    await until(
      async () => (await remote(account, 'document.cookie')).includes('fixture=persisted'),
      'Resume retains Gmail Cookie',
    );
    checks.push(
      'Applet page stop hides Gmail ribbon without activating it; resume restores a usable ribbon, account/Cookie and saved preferences',
    );
    await button('設定').click();
    await (
      await settingsUi()
    )
      .locator('.settings-categories')
      .getByRole('button', { name: 'リボン', exact: true })
      .click();
    await (await settingsUi()).getByLabel('Gmailをリボンに表示').uncheck();
    await button('Gmailを上へ').click();
    await (await settingsUi()).getByLabel('設定をリボンに表示').uncheck();
    await settleSettings(dock);
    await until(
      async () => (await rail.locator('[data-ribbon-id="page:at365.gmail:gmail"]').count()) === 0,
      'Hidden Gmail',
    );
    await until(
      async () => (await rail.locator('[data-ribbon-id="settings"]').count()) === 0,
      'Hidden Settings',
    );
    assert.equal(await rail.locator('[data-ribbon-id="settings"]').count(), 0);
    await button('ホーム').click();
    await rail.getByLabel('リボン', { exact: true }).click({ button: 'right' });
    await (
      await settingsUi()
    )
      .getByRole('heading', { name: 'リボン', level: 1, exact: true })
      .waitFor();
    await (await settingsUi()).screenshot({ path: path.join(profile, 'ribbon-settings.png') });
    checks.push(
      'Ribbon visibility/order editing / hidden settings recovery by right click / minimized monitoring',
    );
    const persisted = JSON.parse(fs.readFileSync(path.join(profile, 'settings.json')));
    assert.ok(persisted.ribbon.hidden.includes('page:at365.gmail:gmail'));
    assert.ok(
      persisted.ribbon.order.indexOf('page:at365.gmail:gmail') <
        persisted.ribbon.order.indexOf('page:test.pages:main'),
    );
    await app.close();
    app = null;
    // Install the offline session handler before the persisted Applet starts.
    const restartSettings = JSON.parse(fs.readFileSync(path.join(profile, 'settings.json')));
    restartSettings.extensions['at365.gmail'].enabled = false;
    fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(restartSettings));
    const deviceFile = path.join(profile, `settings-${require('node:os').hostname()}.json`);
    const deviceSettings = JSON.parse(fs.readFileSync(deviceFile));
    deviceSettings.extensions['at365.gmail'].enabled = false;
    fs.writeFileSync(deviceFile, JSON.stringify(deviceSettings));
    await launch();
    await until(
      async () => (await rail.locator('[data-ribbon-id="settings"]').count()) === 0,
      'Hidden Settings',
    );
    assert.equal(await rail.locator('[data-ribbon-id="settings"]').count(), 0);
    assert.equal(await rail.locator('[data-ribbon-id="page:at365.gmail:gmail"]').count(), 0);
    await dock.evaluate(() => window.dock.executeCommand('at365.gmail.open'));
    const restoredUi = await localUi('/web/index.html');
    const restored = await restoredUi.evaluate(() => window.webAccounts.snapshot());
    assert.equal(restored.selected, account);
    await until(
      async () => (await remote(account, 'document.cookie')).includes('fixture=persisted'),
      'Cookie restart persistence',
    );
    await until(
      async () =>
        (await dock.evaluate(() => window.dock.snapshot())).navigation.route ===
          'page:at365.gmail:gmail' &&
        (await app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().some(
            (window) =>
              window.webContents.getURL() === 'appdock://host/index.html' &&
              window.contentView.children.some(
                (view) =>
                  view.getBounds().width > 700 &&
                  view.children.some((child) =>
                    child.webContents?.getURL().endsWith('/web/index.html'),
                  ),
              ),
          ),
        )),
      'Restored Gmail page is attached before stopping',
    );
    await dock.evaluate(() => window.dock.toggleExtension('at365.gmail', false));
    await until(() => restoredUi.isClosed(), 'UI disposed on stop');
    assert.equal(
      await app.evaluate(({ webContents }) =>
        webContents
          .getAllWebContents()
          .some((w) => w.getURL().startsWith('https://mail.google.com')),
      ),
      false,
    );
    await until(
      async () =>
        (await dock.evaluate(() => window.dock.snapshot())).navigation.route === 'home' &&
        (await dock.locator('.applet-page-viewport').count()) === 0,
      'Stopped page returns Home and removes the viewport',
    );
    const errors = await dock.evaluate(async () =>
      (await window.dock.snapshot()).logs.filter((l) => l.level === 'error'),
    );
    assert.deepEqual(errors, []);
    checks.push(
      'Restart retains ribbon/pages/session; hidden page remains command-accessible; stop disposes views and navigates Home',
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
      try {
        await dock.screenshot({ path: path.join(profile, 'failure.png') });
      } catch {}
      await app.close().catch(() => {});
    }
    process.exitCode = 1;
  }
})();
