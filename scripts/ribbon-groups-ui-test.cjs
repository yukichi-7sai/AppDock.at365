const { _electron: electron, chromium } = require('playwright');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { inspect, electronExpression } = require('./electron-main-helper.cjs');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `ribbon-groups-ui-${Date.now()}`);
const portable = process.argv[2] && path.resolve(process.argv[2]);
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const { ribbonPage, closingAction } = require('./shell-overlay-helper.cjs');
const { settingsPage } = require('./settings-host-helper.cjs');
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.hardwareAcceleration = false;
settings.host.closeToTray = false;
settings.globalShortcutCommands = [];
const fixture = path.join(profile, 'extensions', 'ribbon');
fs.mkdirSync(fixture, { recursive: true });
const pages = Array.from({ length: 10 }, (_, i) => ({
  id: i === 0 ? 'main' : 'p' + i,
  title: i === 0 ? 'Badge fixture' : 'Item ' + i,
  source: 'local',
  ui: 'page.html',
  openCommand: 'fixture.ribbon.open' + i,
}));
fs.writeFileSync(
  path.join(fixture, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'fixture.ribbon',
    name: 'Ribbon fixture',
    version: '1.0.0',
    runtime: 'node',
    entry: 'worker.cjs',
    capabilities: ['pages', 'ribbon-badges'],
    commands: pages.map((p) => ({ id: p.openCommand, title: p.title, activateOnExecute: true })),
    pages,
  }),
);
fs.writeFileSync(
  path.join(fixture, 'page.html'),
  '<!doctype html><title>Fixture</title><p>Local fixture page</p>',
);
fs.writeFileSync(
  path.join(fixture, 'worker.cjs'),
  `exports.activate=async c=>{
  for(let i=0;i<10;i++) c.commands.register('fixture.ribbon.open'+i,'Open '+i,()=>c.pages.open(i===0?'main':'p'+i));
  c.commands.register('fixture.ribbon.clear','Clear badge',()=>c.ribbon.setBadge({pageId:'main'},null));
  c.commands.register('fixture.ribbon.dot','Dot badge',()=>c.ribbon.setBadge({pageId:'main'},{kind:'dot'}));
  await c.ribbon.setBadge({pageId:'main'},{kind:'count',count:123,label:'Pending fixture'});
};`,
);
settings.extensions['fixture.ribbon'] = { enabled: true, settings: {} };
const native = path.join(profile, 'extensions', 'native');
fs.mkdirSync(native, { recursive: true });
fs.copyFileSync(
  path.join(
    root,
    'tests/fixtures/dotnet/AppDock.RibbonBadge/bin/Release/net10.0/AppDock.RibbonBadge.dll',
  ),
  path.join(native, 'AppDock.RibbonBadge.dll'),
);
fs.writeFileSync(
  path.join(native, 'page.html'),
  '<!doctype html><title>Native fixture</title><p>Native badge fixture</p>',
);
fs.writeFileSync(
  path.join(native, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'fixture.ribbon-dotnet',
    name: 'Native badge fixture',
    version: '1.0.0',
    runtime: 'dotnet',
    entry: 'AppDock.RibbonBadge.dll',
    type: 'AppDock.RibbonBadge.Extension',
    capabilities: ['pages', 'ribbon-badges'],
    commands: [{ id: 'fixture.ribbon-dotnet.open', title: 'Open', activateOnExecute: true }],
    pages: [
      {
        id: 'main',
        title: 'Native badge',
        source: 'local',
        ui: 'page.html',
        openCommand: 'fixture.ribbon-dotnet.open',
      },
    ],
  }),
);
settings.extensions['fixture.ribbon-dotnet'] = { enabled: true, settings: {} };
settings.ribbon = {
  custom: { preserved: true },
  order: ['group:persistent', 'group:temporary', 'settings', 'page:missing:root'],
  hidden: [],
  bottom: ['theme', 'profile'],
  separators: [],
  groups: [
    {
      id: 'group:persistent',
      title: 'Persistent',
      icon: 'folder',
      expansion: 'persistent',
      children: ['home', 'page:fixture.ribbon:main', 'page:missing:child'],
    },
    {
      id: 'group:temporary',
      title: 'Temporary',
      icon: 'mail',
      expansion: 'temporary',
      children: [
        'logs',
        'extensions',
        'notifications',
        ...pages.slice(1).map((p) => 'page:fixture.ribbon:' + p.id),
      ],
    },
  ],
  itemOverrides: {
    'page:missing:root': { title: 'Missing root' },
    'page:missing:child': { lastKnownTitle: 'Missing child' },
  },
};
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
const exe = portable ? path.join(profile, 'AppDock.at365.exe') : require('electron');
if (portable) {
  fs.copyFileSync(portable, exe);
  assert.equal(hash(exe), hash(portable));
}
const checks = [],
  errors = [];
let app, host, rail;
const until = async (fn, label) => {
  const deadline = Date.now() + 20000;
  let last;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (e) {
      last = String(e);
    }
    await new Promise((r) => setTimeout(r, 70));
  }
  throw Error(label + (last ? ': ' + last : ''));
};
const snapshot = () => host.evaluate(() => window.dock.snapshot());
const saved = async (fn, label = 'saved layout') =>
  until(async () => fn((await snapshot()).settings.value.ribbon), label);
const button = (id) => rail.locator(`[data-ribbon-id="${id}"]`);
const overlay = () =>
  until(async () => {
    const page = app
      .context()
      .pages()
      .find((p) => p.url().endsWith('/overlay.html'));
    if (!page || !(await page.locator('.ribbon-flyout').count())) return;
    return page;
  }, 'group overlay');
async function openTemporary() {
  await button('group:temporary').click();
  return overlay();
}
async function launch() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  if (!portable)
    app = await electron.launch({
      executablePath: exe,
      args: [root, `--test-profile=${profile}`],
      env,
    });
  else {
    const port = async () => {
      const server = net.createServer();
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      const value = server.address().port;
      await new Promise((r) => server.close(r));
      return value;
    };
    const debug = await port(),
      inspector = await port();
    const child = spawn(
      exe,
      [
        `--test-profile=${profile}`,
        `--remote-debugging-port=${debug}`,
        `--inspect=127.0.0.1:${inspector}`,
      ],
      {
        cwd: profile,
        env,
        windowsHide: true,
        stdio: 'ignore',
      },
    );
    const browser = await until(
      () => chromium.connectOverCDP(`http://127.0.0.1:${debug}`, { timeout: 1000 }),
      'portable CDP',
    );
    const context = browser.contexts()[0];
    app = {
      context: () => context,
      firstWindow: () =>
        until(
          () => context.pages().find((p) => p.url().startsWith('appdock://host/index.html')),
          'host page',
        ),
      evaluate: (fn, arg) =>
        inspect(
          inspector,
          `(${fn.toString()})(${electronExpression},${JSON.stringify(arg) ?? 'undefined'})`,
        ),
      close: async () => {
        if (child.exitCode === null) {
          await host?.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
          await until(() => child.exitCode !== null, 'portable stops');
        }
        await browser.close();
      },
    };
  }
  host = await app.firstWindow();
  host.setDefaultTimeout(15000);
  app.context().on('page', (p) => p.on('pageerror', (e) => errors.push(String(e))));
  rail = await ribbonPage(host);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(760, 820));
  await until(
    async () =>
      (await snapshot()).extensions?.find((e) => e.id === 'fixture.ribbon')?.state === 'running',
    'Node fixture ready',
  );
}
(async () => {
  try {
    await launch();
    await until(
      async () =>
        (await rail.evaluate(() => window.appdockShell.get())).items.some(
          (i) => i.id === 'page:fixture.ribbon-dotnet:main' && i.badge?.text === '7',
        ),
      '.NET badge ready',
    );
    assert.equal(await button('group:persistent').getAttribute('aria-expanded'), 'false');
    assert.equal(await button('page:fixture.ribbon:main').count(), 0);
    assert.equal(await button('group:persistent').locator('.ribbon-badge.dot').count(), 1);
    await button('group:persistent').click();
    await button('page:fixture.ribbon:main').waitFor();
    assert.equal(
      await button('page:fixture.ribbon:main').locator('.ribbon-badge').textContent(),
      '99+',
    );
    assert.match(await button('page:fixture.ribbon:main').getAttribute('aria-label'), /123/);
    const stateFile = path.join(profile, 'data', 'ribbon-state.json');
    await until(() => fs.existsSync(stateFile), 'local expansion file');
    const beforeSettings = JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'))).ribbon;
    assert(!JSON.stringify(beforeSettings).includes('expanded'));
    await rail.screenshot({ path: path.join(profile, 'persistent.png') });
    checks.push(
      'Node and .NET badge API; 99+ and raw accessible count; collapsed aggregate dot; separate local expansion state',
    );

    const positions = () =>
      rail.locator('[data-ribbon-id]').evaluateAll((elements) =>
        elements.map((element) => ({
          id: element.dataset.ribbonId,
          y: element.getBoundingClientRect().y,
          height: element.getBoundingClientRect().height,
        })),
      );
    const closedPositions = await positions();
    let flyout = await openTemporary();
    await flyout.locator('.ribbon-flyout-row button').first().waitFor();
    await until(
      async () => (await button('group:temporary').getAttribute('aria-expanded')) === 'true',
      'temporary expanded accessibility',
    );
    assert.deepEqual(
      await positions(),
      closedPositions,
      'opening a temporary group must not move rail buttons',
    );
    assert.equal(await flyout.locator('.ribbon-flyout-heading').count(), 0);
    assert.equal(await flyout.getByRole('button', { name: 'グループを閉じる' }).count(), 0);
    const aligned = async () => {
      const anchor = (await flyout.evaluate(() => window.appdockOverlay.connect())).snapshot.content
        .anchor;
      const child = await flyout
        .locator('.ribbon-flyout-row [data-ribbon-id]')
        .first()
        .boundingBox();
      return Math.abs(child.y + child.height / 2 - (anchor.y + anchor.height / 2)) < 1;
    };
    await until(aligned, 'popup button aligns vertically with source group');
    const geometry = await flyout
      .locator('.ribbon-flyout-row button')
      .evaluateAll((buttons) => buttons.map((b) => b.getBoundingClientRect().y));
    assert.equal(new Set(geometry).size, 1);
    const dimensions = await flyout
      .locator('.ribbon-flyout-row')
      .evaluate((el) => ({ width: el.clientWidth, scroll: el.scrollWidth }));
    assert(dimensions.scroll > dimensions.width);
    await flyout.getByRole('button', { name: '右へスクロール' }).click();
    assert(await flyout.locator('.ribbon-flyout-row').evaluate((el) => el.scrollLeft > 0));
    await flyout.locator('.ribbon-flyout-row button').first().focus();
    await app.evaluate(({ BrowserWindow, webContents }) => {
      BrowserWindow.getAllWindows()[0].focus();
      webContents
        .getAllWebContents()
        .find((c) => c.getURL().endsWith('/overlay.html'))
        .focus();
    });
    await flyout.locator('.ribbon-flyout-row button').first().press('End');
    assert.equal(
      await flyout.evaluate(() => document.activeElement.dataset.ribbonId),
      'page:fixture.ribbon:p9',
    );
    await flyout.screenshot({ path: path.join(profile, 'temporary.png') });
    await closingAction(flyout.keyboard.press('Escape'));
    await until(() => flyout.isClosed(), 'Escape closes');
    assert.equal(
      await rail.evaluate(() => document.activeElement.dataset.ribbonId),
      'group:temporary',
    );
    const fullChildren = (await snapshot()).settings.value.ribbon.groups.find(
      (g) => g.id === 'group:temporary',
    ).children;
    const replaceChildren = (children) =>
      host.evaluate(async (children) => {
        const s = await window.dock.snapshot();
        s.settings.value.ribbon.groups.find((g) => g.id === 'group:temporary').children = children;
        await window.dock.saveSettings(s.settings.value, s.settings.revision);
      }, children);
    await replaceChildren(['logs']);
    flyout = await openTemporary();
    await flyout.locator('[data-ribbon-id="logs"]').waitFor();
    await until(aligned, 'single button aligns');
    assert.equal(await flyout.getByRole('button', { name: /へスクロール/ }).count(), 0);
    await flyout.screenshot({ path: path.join(profile, 'temporary-single.png') });
    await closingAction(flyout.keyboard.press('Escape'));
    await until(() => flyout.isClosed(), 'single panel closes');
    await replaceChildren(fullChildren);
    flyout = await openTemporary();
    const originalRoute = (await snapshot()).navigation.route;
    await closingAction(flyout.mouse.click(5, 5));
    await until(() => flyout.isClosed(), 'outside closes');
    assert.equal((await snapshot()).navigation.route, originalRoute);
    flyout = await openTemporary();
    await closingAction(flyout.locator('[data-ribbon-id="logs"]').click());
    await until(
      async () => (await snapshot()).navigation.route === 'logs',
      'selected button executes',
    );
    assert(flyout.isClosed());
    assert.equal(await button('group:persistent').getAttribute('aria-expanded'), 'true');
    checks.push(
      'Temporary horizontal overflow; keyboard End/Escape and focus return; outside click consumed; selection closes and executes; persistent state retained on navigation',
    );

    flyout = await openTemporary();
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      const [w, h] = window.getSize();
      window.setSize(w + 20, h);
    });
    await until(() => flyout.isClosed(), 'resize cancels overlay');
    flyout = await openTemporary();
    await rail.evaluate(() => window.appdockShell.invalidateAnchor());
    await until(() => flyout.isClosed(), 'scroll invalidation cancels overlay');
    flyout = await openTemporary();
    await host.evaluate(() => window.dock.navigate('home'));
    await until(() => flyout.isClosed(), 'navigation cancels overlay');
    checks.push('Window resize, source invalidation and route changes close temporary group');

    await host.evaluate(async () => {
      const s = await window.dock.snapshot();
      await window.dock.saveSettings(
        { ...s.settings.value, host: { ...s.settings.value.host, theme: 'dark' } },
        s.settings.revision,
      );
    });
    flyout = await openTemporary();
    await flyout.locator('.ribbon-flyout-row button').first().waitFor();
    await flyout.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    const box = await flyout.locator('.ribbon-flyout').boundingBox();
    const viewport = await flyout.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    assert(
      box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= viewport.width &&
        box.y + box.height <= viewport.height,
    );
    await flyout.screenshot({ path: path.join(profile, 'temporary-dark.png') });
    await closingAction(flyout.keyboard.press('Escape'));
    await until(() => flyout.isClosed(), 'dark panel closes');

    await host.evaluate(() => window.dock.executeCommand('fixture.ribbon.clear'));
    await until(
      async () => (await button('page:fixture.ribbon:main').locator('.ribbon-badge').count()) === 0,
      'clear badge',
    );
    await host.evaluate(() => window.dock.executeCommand('fixture.ribbon-dotnet.clear'));
    await until(
      async () =>
        (await button('page:fixture.ribbon-dotnet:main').locator('.ribbon-badge').count()) === 0,
      'native clear badge',
    );
    await host.evaluate(() => window.dock.executeCommand('fixture.ribbon.dot'));
    await until(
      async () =>
        (await button('page:fixture.ribbon:main').locator('.ribbon-badge.dot').count()) === 1,
      'dot badge',
    );
    await host.evaluate(() => window.dock.toggleExtension('fixture.ribbon', false));
    await until(
      async () => (await button('page:fixture.ribbon:main').count()) === 0,
      'disabled pages hidden',
    );
    assert.equal(await button('group:persistent').locator('.ribbon-badge').count(), 0);
    await host.evaluate(() => window.dock.toggleExtension('fixture.ribbon', true));
    await until(
      async () =>
        (await button('page:fixture.ribbon:main').locator('.ribbon-badge.count').count()) === 1,
      'new runtime badge',
    );
    checks.push(
      'Runtime badge clear/dot, .NET clear, disable cleanup and fresh generation restore',
    );

    await button('settings').click();
    let page = await settingsPage(host);
    await page
      .locator('.settings-categories')
      .getByRole('button', { name: 'リボン', exact: true })
      .click();
    const settingRow = (id) => page.locator(`[data-ribbon-setting="${id}"]`);
    const controls = await page
      .locator('.ribbon-row-controls')
      .evaluateAll((rows) =>
        rows.map((row) => [...row.children].map((child) => child.getBoundingClientRect().x)),
      );
    assert(controls.length > 4);
    for (const row of controls)
      assert.deepEqual(row, controls[0], 'all action slots align across root and child rows');
    assert.equal(await settingRow('home').locator('.settings-list-icon svg').count(), 1);
    assert.equal(await settingRow('home').locator('.ribbon-action-placeholder').count(), 1);
    await page.getByRole('button', { name: 'ホームを編集', exact: true }).click();
    await page.getByLabel('ボタン名', { exact: true }).fill('My home');
    await page.getByLabel('リボンにアイコンのみを表示する', { exact: true }).check();
    await page.getByRole('button', { name: '適用', exact: true }).click();
    await saved((r) => r.itemOverrides.home?.title === 'My home' && r.itemOverrides.home.iconOnly);
    await until(
      async () => (await button('home').getAttribute('aria-label')) === 'My home',
      'custom accessible name',
    );
    assert.equal(await button('home').locator('.rail-label').count(), 0);
    await page.getByRole('button', { name: 'My homeを編集', exact: true }).click();
    await page.getByLabel('ボタン名', { exact: true }).fill('');
    await page.getByLabel('リボンにアイコンのみを表示する', { exact: true }).uncheck();
    await page.getByRole('button', { name: '適用', exact: true }).click();
    await saved((r) => !r.itemOverrides.home?.title && r.itemOverrides.home?.iconOnly === false);
    for (const [id, title] of [
      ['page:missing:root', 'Missing root'],
      ['page:missing:child', 'Missing child'],
    ]) {
      await page.getByRole('button', { name: `${title}を設定から削除`, exact: true }).click();
      await page
        .getByRole('dialog', { name: 'リボン項目を設定から削除' })
        .getByRole('button', { name: '削除', exact: true })
        .click();
      await saved((r) => !JSON.stringify(r).includes(id));
      assert.equal(await settingRow(id).count(), 0);
    }
    await page
      .getByRole('region', { name: '上寄せのリボン設定', exact: true })
      .getByRole('button', { name: '＋ グループ', exact: true })
      .click();
    await page.getByLabel('グループ名', { exact: true }).fill('Created group');
    await page.getByLabel('展開方法', { exact: true }).selectOption('temporary');
    const gaps = await page
      .locator('.ribbon-edit-fields > label')
      .evaluateAll((labels) =>
        labels
          .slice(1)
          .map(
            (label, i) =>
              label.getBoundingClientRect().top - labels[i].getBoundingClientRect().bottom,
          ),
      );
    assert(gaps.every((gap) => gap >= 20));
    const checkboxGeometry = await page.locator('.ribbon-icon-only').evaluate((label) => {
      const checkbox = label.querySelector('input').getBoundingClientRect();
      return { width: checkbox.width, left: checkbox.left - label.getBoundingClientRect().left };
    });
    assert(
      checkboxGeometry.width < 24 && checkboxGeometry.left < 2,
      'compact checkbox at start of label',
    );
    await page.screenshot({ path: path.join(profile, 'group-dialog.png') });
    await page.getByRole('button', { name: '追加', exact: true }).click();
    const newLayout = await saved((r) => r.groups.find((g) => g.title === 'Created group'));
    const createdId = newLayout.id;
    await page.getByLabel('ホームの配置', { exact: true }).selectOption(createdId);
    await saved((r) => r.groups.find((g) => g.id === createdId)?.children.includes('home'));
    await page.getByRole('button', { name: 'Created groupを編集', exact: true }).click();
    await page.getByLabel('グループ名', { exact: true }).fill('');
    await page.getByRole('button', { name: '適用', exact: true }).click();
    await saved((r) => r.groups.find((g) => g.id === createdId)?.title === '');
    await until(
      async () => (await button(createdId).getAttribute('aria-label')) === 'グループ',
      'empty group retains accessible fallback',
    );
    assert.equal(await button(createdId).locator('.rail-label').count(), 0);
    await settingRow(createdId)
      .getByRole('button', { name: 'グループを編集', exact: true })
      .click();
    await page.getByLabel('グループ名', { exact: true }).fill('Renamed group');
    await page.getByLabel('リボンにアイコンのみを表示する', { exact: true }).check();
    await page.getByLabel('展開方法', { exact: true }).selectOption('persistent');
    await page.getByRole('button', { name: '適用', exact: true }).click();
    await saved((r) => r.groups.find((g) => g.id === createdId)?.title === 'Renamed group');
    assert.equal(await button(createdId).locator('.rail-label').count(), 0);
    await page.getByLabel('Renamed groupの配置', { exact: true }).selectOption('bottom');
    await saved((r) => r.bottom.includes(createdId));
    await page.getByRole('button', { name: 'Renamed groupのグループを解除', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'グループを解除', exact: true })
      .getByRole('button', { name: '解除', exact: true })
      .click();
    await saved((r) => !r.groups.some((g) => g.id === createdId) && r.bottom.includes('home'));
    assert.deepEqual((await snapshot()).settings.value.ribbon.custom, { preserved: true });
    await page.screenshot({ path: path.join(profile, 'settings.png') });
    checks.push(
      'Settings dialog add/edit; immediate persisted membership and placement; ungroup returns child with inherited bottom placement',
    );
    checks.push(
      'Popup alignment and stable rail positions; overflow-only controls; aligned shared action icons; aliases, icon-only, blank group names, missing root/child removal and spacious dialog',
    );
    await app.close();
    app = undefined;
    await launch();
    await button('page:fixture.ribbon:main').waitFor();
    assert.equal(await button('group:persistent').getAttribute('aria-expanded'), 'true');
    assert.equal(await button('group:temporary').getAttribute('aria-expanded'), 'false');
    checks.push(
      'Real host restart restores persistent expansion and keeps temporary groups closed',
    );
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify(
        {
          ok: true,
          checks,
          profile,
          errors,
          portable: portable ?? null,
          executableSha256: portable ? hash(exe) : null,
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ ok: true, checks, profile }, null, 2));
  } catch (error) {
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify({ ok: false, checks, error: String(error), errors }, null, 2),
    );
    console.error(error);
    console.error('Evidence: ' + profile);
    process.exitCode = 1;
  } finally {
    if (app) await app.close().catch(() => {});
  }
})();
