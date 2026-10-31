const { settleSettings } = require('./settings-immediate-helper.cjs');
const { _electron: electron, chromium } = require('playwright');
const { spawn } = require('node:child_process'),
  net = require('node:net');
const { createHash } = require('node:crypto');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `settings-search-${Date.now()}`);
fs.mkdirSync(profile, { recursive: true });
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.hardwareAcceleration = false;
settings.host.notifications = false;
settings.globalShortcutCommands = [];
settings.extensions['missing.applet'] = { enabled: false, settings: { private: 'never-in-shell' } };
settings.host.closeToTray = false;
require('./profile-settings-fixture.cjs').installProfileSettings(profile, settings);
require('./settings-web-fixture.cjs').installWebSettings(profile, settings);
settings.extensions['fixture.settings'] = { enabled: false, settings: {} };
settings.appletOrder = ['fixture.settings', 'fixture.stalled-settings'];
for (const id of ['fixture.settings-shell', 'fixture.stalled-settings'])
  settings.extensions[id] = { enabled: true, settings: {} };
fs.writeFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), JSON.stringify(settings));
const fixture = path.join(profile, 'extensions', 'fixture.settings');
fs.mkdirSync(fixture, { recursive: true });
fs.writeFileSync(
  path.join(fixture, 'extension.json'),
  JSON.stringify({
    apiVersion: 1,
    id: 'fixture.settings',
    name: 'Settings fixture',
    version: '1.0.0',
    runtime: 'node',
    entry: 'index.js',
    settings: [
      {
        key: 'text.value',
        title: 'Fixture text',
        description: 'Searchable description',
        aliases: ['legacy.text'],
        type: 'string',
        default: '',
      },
      { key: 'amount', title: 'Fixture amount', type: 'number', default: 1 },
      ...Array.from({ length: 48 }, (_, i) => ({
        key: 'field.' + i,
        title: 'Fixture field ' + i,
        type: 'string',
        default: '',
      })),
    ],
  }),
);
fs.writeFileSync(path.join(fixture, 'index.js'), 'module.exports = {};');
const external = path.join(profile, 'extensions', 'fixture.settings-shell');
fs.cpSync(path.join(root, 'out/shells/default'), external, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(external, 'extension.json')));
manifest.id = 'fixture.settings-shell';
manifest.name = 'Settings shell fixture';
manifest.minimumHostVersion = '0.33.0';
manifest.shell = { apiVersion: 1, views: { 'page.settings': 'settings.html' } };
fs.writeFileSync(
  path.join(external, 'settings.html'),
  '<body>Legacy settings must not be opened</body>',
);
fs.writeFileSync(path.join(external, 'extension.json'), JSON.stringify(manifest));
const stalled = path.join(profile, 'extensions', 'fixture.stalled-settings');
fs.mkdirSync(stalled, { recursive: true });
fs.writeFileSync(
  path.join(stalled, 'extension.json'),
  JSON.stringify({ ...manifest, id: 'fixture.stalled-settings', name: 'Stalled settings' }),
);
fs.writeFileSync(path.join(stalled, 'worker.cjs'), 'exports.activate=async()=>{};');
fs.writeFileSync(path.join(stalled, 'settings.html'), '<body>Not ready</body>');
const hash = (f) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');
async function until(fn, label) {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    const r = await fn();
    if (r) return r;
    await new Promise((r) => setTimeout(r, 75));
  }
  throw Error(label);
}
(async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  let app, context, child, connection, portable;
  async function launch(extra = []) {
    if (process.argv[2]) {
      portable = path.join(profile, 'AppDock.at365.exe');
      require('./copy-host.cjs').copyHost(path.resolve(process.argv[2]), portable);
      assert.equal(hash(portable), hash(path.resolve(process.argv[2])));
      const probe = net.createServer();
      await new Promise((r) => probe.listen(0, '127.0.0.1', r));
      const port = probe.address().port;
      await new Promise((r) => probe.close(r));
      child = spawn(
        portable,
        [`--test-profile=${profile}`, `--remote-debugging-port=${port}`, ...extra],
        { env, windowsHide: true, stdio: 'ignore' },
      );
      connection = await until(async () => {
        try {
          return await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 });
        } catch {}
      }, 'portable CDP');
      context = connection.contexts()[0];
    } else {
      app = await electron.launch({
        executablePath: require('electron'),
        args: [root, `--test-profile=${profile}`, ...extra],
        env,
      });
      context = app.context();
    }
    return until(
      () => context.pages().find((p) => p.url().startsWith('appdock://host/index.html')),
      'host',
    );
  }
  let host = await launch();
  async function close() {
    if (app) {
      await app.close();
      app = undefined;
    } else {
      await host.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
      await until(() => child.exitCode !== null, 'portable shutdown');
      await connection.close();
    }
  }
  const settingsPage = () => require('./settings-host-helper.cjs').settingsPage(host);
  const provider = async (id) => {
    await host.evaluate(async (id) => {
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
  };
  const modelOf = (p) =>
    p.evaluate(() =>
      window.dock.settingsPage.get(
        document.querySelector('.settings-surface').dataset.settingsConnection,
      ),
    );
  const providerPage = (id) =>
    until(async () => {
      const p = await settingsPage();
      try {
        if (!(await context.pages()).some((surface) => surface.url().endsWith('/settings.html')))
          return p;
      } catch {}
    }, `provider ${id}`);
  const checks = [];
  const itemId = require('../out/main/shared/settings-catalog').settingsItemId;
  const op = (page, operation) =>
    page.evaluate(async (operation) => {
      const m = await window.dock.settingsPage.get(
        document.querySelector('.settings-surface').dataset.settingsConnection,
      );
      return window.dock.settingsPage.act(
        document.querySelector('.settings-surface').dataset.settingsConnection,
        {
          id: m.id,
          type: 'settings',
          sessionId: m.content.editing.sessionId,
          editRevision: m.content.editing.editRevision,
          operationId: crypto.randomUUID(),
          operation,
        },
      );
    }, operation);
  try {
    await until(
      () => host.evaluate(() => window.dock.snapshot().then((s) => s.startupReady)),
      'startup',
    );
    await host.evaluate(() => window.dock.navigate('settings'));
    let shell = await settingsPage();
    let m = await modelOf(shell);
    assert.equal(m.content.navigation.find((p) => p.owner)?.id, 'applet:fixture.settings');
    assert(!m.content.navigation.some((p) => p.id.includes('web-manager')));
    for (const page of m.content.navigation.filter((p) => !p.owner)) {
      await op(shell, { kind: 'select', pageId: page.id });
      await until(
        async () => (await modelOf(shell)).content.page.id === page.id,
        'page ' + page.id,
      );
      const items = (await modelOf(shell)).content.page.items;
      for (const item of items) {
        await until(
          () => shell.locator(`[data-setting-item="${item.id}"]`).count(),
          'anchor ' + item.id,
        );
        await op(shell, { kind: 'move', itemId: item.id });
        await until(
          async () => (await modelOf(shell)).content.move?.completed,
          'movement ' + item.id,
        );
        assert.equal(
          await shell.evaluate(() => document.activeElement?.getAttribute('data-setting-item')),
          item.id,
        );
      }
    }
    checks.push(
      'all host catalog items resolve to stable rendered anchors without executing actions',
    );
    await op(shell, { kind: 'select', pageId: 'applet:fixture.profile' });
    await shell.getByLabel('ユーザー名', { exact: true }).fill('Unpublished profile');
    await shell.getByLabel('ユーザー名', { exact: true }).press('Enter');
    await op(shell, { kind: 'select', pageId: 'applet:fixture.settings' });
    await shell.getByLabel('Fixture text', { exact: true }).fill('private-current-text');
    const before = (await modelOf(shell)).content.page.id;
    const search = () => shell.getByRole('combobox', { name: '設定を検索' });
    await search().fill('nothing-matches-private-current-text');
    await shell.getByText('0件の設定', { exact: true }).waitFor();
    assert.equal((await modelOf(shell)).content.page.id, before);
    await search().fill('ＦＩＸＴＵＲＥ　legacy.text');
    await shell.getByRole('option', { name: /Fixture text/ }).waitFor();
    await shell.getByRole('option', { name: /Fixture text/ }).click();
    assert.equal(await shell.getByLabel('Fixture field 47', { exact: true }).count(), 1);
    assert.equal(await shell.getByLabel('Appletの設定項目を検索').count(), 0);
    assert.equal(
      await shell.getByLabel('Fixture text', { exact: true }).inputValue(),
      'private-current-text',
    );
    await search().fill('Fixture field 47');
    await shell.getByRole('option', { name: /Fixture field 47/ }).waitFor();
    await search().press('ArrowDown');
    await search().press('Enter');
    const lastId = itemId('applet:fixture.settings', 'setting:field.47');
    await until(
      () =>
        shell.evaluate(
          (id) => document.activeElement?.getAttribute('data-setting-item') === id,
          lastId,
        ),
      'keyboard target',
    );
    assert(await shell.locator('.settings-body').evaluate((el) => el.scrollTop > 0));
    assert.equal(await shell.locator('.setting-highlight').count(), 1);
    assert(
      await shell.locator(`[data-setting-item="${lastId}"]`).evaluate((el) => {
        const r = el.getBoundingClientRect(),
          b = el.closest('.settings-body').getBoundingClientRect();
        return r.top >= b.top && r.top < b.bottom;
      }),
    );
    await shell.getByLabel('Fixture field 47', { exact: true }).fill('Last field saved');
    await shell.getByLabel('Fixture field 47', { exact: true }).press('Enter');
    await until(
      async () => (await shell.locator('.setting-highlight').count()) === 0,
      'highlight expires',
    );
    assert.notEqual(
      (await host.evaluate(() => window.dock.snapshot())).extensions.find(
        (a) => a.id === 'fixture.settings',
      ).state,
      'running',
    );
    checks.push(
      'NFKC AND/legacy keys, zero results, complete right page, keyboard movement, scroll/focus/highlight without starting disabled Applet',
    );
    await host.evaluate(() => window.dock.navigate('logs'));
    await host.evaluate(() => window.dock.navigate('settings'));
    shell = await settingsPage();
    assert.equal(await search().inputValue(), 'Fixture field 47');
    await op(shell, { kind: 'select', pageId: 'applets' });
    await host.getByRole('button', { name: 'Settings fixtureの設定を開く', exact: true }).click();
    shell = await settingsPage();
    assert.equal(
      await shell.getByLabel('Fixture field 47', { exact: true }).inputValue(),
      'Last field saved',
    );
    assert.equal(await search().inputValue(), 'Fixture field 47');
    await shell.getByLabel('Fixture text', { exact: true }).fill('Edited in detail');
    await shell.getByLabel('Fixture text', { exact: true }).press('Enter');
    await host.evaluate(() => window.dock.navigate('settings'));
    shell = await settingsPage();
    assert.equal(await search().inputValue(), 'Fixture field 47');
    assert.equal(
      await shell.getByLabel('Fixture text', { exact: true }).inputValue(),
      'Edited in detail',
    );
    await settleSettings(shell);
    await until(
      () =>
        host.evaluate(() =>
          window.dock
            .snapshot()
            .then(
              (s) =>
                s.settings.value.extensions['fixture.profile'].settings.name ===
                  'Unpublished profile' &&
                s.settings.value.extensions['fixture.settings'].settings['text.value'] ===
                  'Edited in detail',
            ),
        ),
      'whole save',
    );
    checks.push(
      'index and management reuse complete body and edit state; query survives routes; save includes other pages',
    );
    await shell.getByRole('button', { name: 'JSON', exact: true }).click();
    const json = await shell.getByLabel('設定JSON').inputValue();
    assert.deepEqual(Object.keys(JSON.parse(json).extensions), ['fixture.settings']);
    await search().fill('unmatched');
    await shell.getByText('0件の設定', { exact: true }).waitFor();
    assert.equal(await shell.getByLabel('設定JSON').inputValue(), json);
    await shell.getByLabel('設定JSON').fill('{broken');
    await search().fill('テーマ');
    await shell.getByRole('option', { name: /テーマ/ }).click();
    await shell.getByLabel('テーマ', { exact: true }).waitFor();
    assert.equal((await modelOf(shell)).content.page.id, 'appearance');
    await settleSettings(shell);
    checks.push(
      'JSON scope ignores query and scrolling; invalid raw JSON stays local and result movement opens persisted form',
    );
    await search().fill('テーマ');
    await search().press('ArrowDown');
    await search().evaluate((el) => {
      el.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true }),
      );
      el.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }),
      );
    });
    assert.equal(await search().inputValue(), 'テーマ');
    await search().press('Escape');
    await until(async () => (await modelOf(shell)).content.query === '', 'escape');
    assert.equal(await shell.locator('[aria-current="true"] span[title]').innerText(), '表示');
    await search().fill('起動から確認まで');
    await shell.getByRole('option', { name: /起動から確認まで/ }).click();
    const updateId = itemId('about', 'startupDelaySeconds');
    await until(
      () =>
        shell.evaluate(
          (id) => document.activeElement?.getAttribute('data-setting-item') === id,
          updateId,
        ),
      'disclosure focus',
    );
    assert.equal(
      await shell
        .locator(`[data-setting-item="${updateId}"]`)
        .evaluate((el) => el.closest('details').open),
      true,
    );
    await search().fill('テーマ');
    await shell.getByRole('option', { name: /テーマ/ }).click();
    await search().fill('ユーザー名');
    await shell.getByRole('option', { name: /ユーザー名/ }).click();
    await until(
      () =>
        shell.evaluate(
          (id) => document.activeElement?.getAttribute('data-setting-item') === id,
          itemId('applet:fixture.profile', 'setting:name'),
        ),
      'last move',
    );
    assert.equal(await shell.locator('.setting-highlight').count(), 1);
    checks.push(
      'IME Enter/Escape guard, Escape clears index, disclosure expansion and last-result movement',
    );
    const webId = 'web.11111111-1111-1111-1111-111111111111';
    await search().fill('New search site');
    await shell.getByText('0件の設定', { exact: true }).waitFor();
    await host.evaluate(async (id) => {
      const account = await window.dock.createWebAccount('Search account');
      const s = await window.dock.snapshot();
      s.settings.value.extensions['fixture.web-settings'].settings.items.push({
        id,
        name: 'New search site',
        url: 'https://example.com/',
        icon: '',
        enabled: false,
        display: 'page',
        navigation: 'none',
        allowedOrigins: [],
        accountId: account.id,
      });
      await window.dock.saveSettings(s.settings.value, s.settings.revision);
    }, webId);
    await shell.getByRole('option', { name: /^WebAppletの名前/ }).waitFor();
    await shell.getByRole('option', { name: /^WebAppletの名前/ }).click();
    await shell.getByLabel('WebAppletの名前').waitFor();
    m = await modelOf(shell);
    const oldItem = m.content.page.items[0].id;
    for (const item of m.content.page.items)
      assert.equal(await shell.locator(`[data-setting-item="${item.id}"]`).count(), 1, item.id);
    await host.evaluate(async (id) => {
      const s = await window.dock.snapshot();
      s.settings.value.extensions['fixture.web-settings'].settings.items =
        s.settings.value.extensions['fixture.web-settings'].settings.items.filter(
          (a) => a.id !== id,
        );
      await window.dock.saveSettings(s.settings.value, s.settings.revision);
    }, webId);
    await shell.getByText('0件の設定', { exact: true }).waitFor();
    await shell
      .getByText('設定対象が削除されたか、現在利用できません。別の設定を選んでください。')
      .waitFor();
    await assert.rejects(op(shell, { kind: 'move', itemId: oldItem }), /見つかりません/);
    await op(shell, { kind: 'select', pageId: 'appearance' });
    await shell.getByLabel('テーマ', { exact: true }).waitFor();
    await search().fill('テーマ');
    // The fixture switches legacy assignments through the host API after input settles.
    await until(
      async () => (await modelOf(shell)).content.query === 'テーマ',
      'search accepted before provider replacement',
    );
    checks.push(
      'live added WebApplet indexed, individual body anchors, deleted target removed and stale movement rejected',
    );
    await provider('fixture.settings-shell');
    shell = await providerPage('fixture.settings-shell');
    assert.equal(await search().inputValue(), 'テーマ');
    assert.equal(
      context.pages().some((p) => p.url().endsWith('/settings.html')),
      false,
    );
    checks.push('settings remain in the host document; legacy Shell HTML is never loaded');
    await provider('fixture.stalled-settings');
    shell = await providerPage('appdock.default-shell');
    assert.equal(await search().inputValue(), 'テーマ');
    await shell.getByRole('option', { name: /テーマ/ }).click();
    await shell.getByLabel('テーマ', { exact: true }).waitFor();
    await shell.emulateMedia({ reducedMotion: 'reduce' });
    if (app) {
      for (const width of [900, 700]) {
        await app.evaluate(
          ({ BrowserWindow }, width) =>
            BrowserWindow.getAllWindows()
              .find((w) => w.webContents.getURL().startsWith('appdock://host/index.html'))
              .setContentSize(width, 700),
          width,
        );
        await shell.screenshot({ path: path.join(profile, `search-${width}.png`) });
        assert(await shell.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      }
    } else await shell.screenshot({ path: path.join(profile, 'search-portable.png') });
    checks.push(
      app
        ? 'query and selection survive legacy provider assignments; narrow 900/700 and reduced motion'
        : 'fixed EXE query survives inert legacy provider assignments; reduced motion',
    );
    const result = {
      success: true,
      checks,
      profile,
      mode: portable ? 'portable' : 'source',
      sha256: portable ? hash(portable) : undefined,
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
