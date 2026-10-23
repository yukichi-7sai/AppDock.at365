const { settleSettings } = require('./settings-immediate-helper.cjs');
const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', `navigation-${Date.now()}`);
const settings = require('../out/main/shared/settings-schema.js').createDefaultSettings();
settings.profile = { name: 'Legacy fixture', avatar: null };
settings.host.notifications = false;
settings.globalShortcutCommands = [];
settings.shortcuts['missing.command'] = ['Ctrl+Alt+9'];
settings.extensions['appdock.dotnet-demo'] = { enabled: true, settings: {} };
require('../tests/fixtures/install.cjs')(profile, settings);
for (let i = 0; i < 24; i++) {
  const id = `test.applet-${i}`;
  const folder = path.join(profile, 'extensions', id);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(
    path.join(folder, 'extension.json'),
    JSON.stringify({
      apiVersion: 1,
      id,
      name: `検証Applet ${String(i).padStart(2, '0')}`,
      version: '1.0.0',
      runtime: 'node',
      entry: 'index.js',
      capabilities: [],
      ...(i === 1
        ? {
            commands: [{ id: `${id}.apply`, title: '検証操作' }],
            settingActions: [
              {
                title: '検証操作',
                command: `${id}.apply`,
                successMessage: '共通パネルの操作が成功しました。',
              },
            ],
          }
        : {}),
      settings:
        i === 0
          ? []
          : [
              ...Array.from({ length: 24 }, (_, n) => ({
                key: `value${n}`,
                title: `検証項目 ${n}`,
                type: 'string',
                default: `初期値 ${n}`,
              })),
              { key: 'flag', title: '検証スイッチ', type: 'boolean', default: true },
              {
                key: 'amount',
                title: '検証数値',
                type: 'number',
                default: 2,
                minimum: 1,
                maximum: 10,
              },
              {
                key: 'choice',
                title: '検証選択',
                type: 'select',
                default: 'a',
                options: [
                  { value: 'a', label: '選択A' },
                  { value: 'b', label: '選択B' },
                ],
              },
              {
                key: 'monitor',
                title: '未接続の選択',
                type: 'select',
                default: 'disconnected',
                dynamic: true,
                options: [],
              },
            ],
    }),
  );
  fs.writeFileSync(
    path.join(folder, 'index.js'),
    i === 1
      ? `module.exports = { activate(context) { let calls = 0; context.commands.register('${id}.apply', '検証操作', async () => { await new Promise(resolve => setTimeout(resolve, 150)); if (calls++ > 0) throw new Error('fixture action failure'); }); } };`
      : 'module.exports = {};',
  );
  if (i === 1) settings.extensions[id] = { enabled: true, settings: {} };
}
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(settings));
const checks = [];
(async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: process.argv[2] ? path.resolve(process.argv[2]) : require('electron'),
    args: [...(process.argv[2] ? [] : [root]), `--test-profile=${profile}`],
    env,
  });
  const page = require('./settings-aware-page.cjs').settingsAwarePage(await app.firstWindow());
  const shell = await require('./shell-overlay-helper.cjs').ribbonPage(page);
  page.setDefaultTimeout(12000);
  const body = require('./settings-host-helper.cjs').deferred(() =>
    require('./settings-host-helper.cjs').settingsPage(page),
  );
  const saveSurface = require('./settings-host-helper.cjs').deferred(async () =>
    (await page.evaluate(() => window.dock.snapshot())).navigation.route === 'settings'
      ? require('./settings-host-helper.cjs').settingsPage(page)
      : page,
  );
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const rawButton = (name) =>
    name === 'ショートカットキー'
      ? detailTab('ショートカット')
      : name === '設定項目'
        ? detailTab('設定')
        : (['画像ライブラリー', 'Applet', '設定', 'ログ', 'Appletに戻る'].includes(name)
            ? shell
            : ['JSON', 'フォーム', '表示', '一般', 'ショートカット', '検証操作'].includes(name)
              ? body
              : page
          ).getByRole('button', {
            name:
              name === 'Appletに戻る'
                ? 'Applet'
                : name === 'ショートカット'
                  ? 'ショートカットキー'
                  : name,
            exact: true,
          });
  const button = (name) => {
    const locator = rawButton(name);
    const route = {
      画像ライブラリー: 'image-library',
      Applet: 'extensions',
      Appletに戻る: 'extensions',
      設定: 'settings',
      ログ: 'logs',
    }[name];
    if (!route) return locator;
    return new Proxy(locator, {
      get(target, key) {
        if (key === 'click')
          return async (...args) => {
            await target.click(...args);
            await require('./settings-host-helper.cjs').waitForHost(
              page,
              async (route) => (await window.dock.snapshot()).navigation.route === route,
              route,
            );
            if (route === 'settings') await page.waitForSelector('.settings-surface.full');
          };
        const value = target[key];
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  };
  const detailTab = (name) => {
    const locator = page
      .getByRole('tablist', { name: 'Applet詳細の切り替え' })
      .getByRole('tab', { name, exact: true });
    const click = locator.click.bind(locator);
    locator.click = async (...args) => {
      await click(...args);
      await page.waitForFunction(
        (name) =>
          [...document.querySelectorAll('.detail-tabs [role="tab"]')].some(
            (el) => el.textContent === name && el.getAttribute('aria-selected') === 'true',
          ),
        name,
      );
    };
    return locator;
  };
  // JSON state tests do not depend on Windows focus/select-all during Electron fill.
  const setJsonDraft = (value) =>
    body.getByLabel('設定JSON').evaluate((element, text) => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(
        element,
        text,
      );
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
  const switchAppearance = (selector = '#applet-detail-tab-settings') =>
    page.locator(selector).evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const heading = document.querySelector('.detail-heading').getBoundingClientRect();
      return {
        bounds: [bounds.x, bounds.y, bounds.width, bounds.height],
        heading: [heading.x, heading.y, heading.width, heading.height],
      };
    });
  const settingsNav = () => body.locator('.settings-categories');
  const save = async () => {
    await settleSettings(page);
  };
  const chooseApplet = async (name) => {
    const view = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('appdock.restart-view.detailView') ?? '"settings"'),
    );
    await button('Applet').click();
    await page.getByLabel('Appletを検索', { exact: true }).fill(name);
    await page
      .getByRole('complementary', { name: 'Applet一覧' })
      .getByRole('button', { name: new RegExp(name) })
      .click();
    await detailTab(view === 'shortcuts' ? 'ショートカット' : '設定').click();
  };
  try {
    await require('./shell-overlay-helper.cjs').startupPage(page);
    await page.waitForFunction(() =>
      window.dock
        .snapshot()
        .then((s) => s.extensions.find((e) => e.id === 'appdock.dotnet-demo')?.state === 'running'),
    );
    for (const name of ['画像ライブラリー', 'Applet', '設定', 'ログ'])
      assert.equal(await button(name).count(), 1);
    assert.equal(await page.getByText('My Dock', { exact: true }).count(), 0);
    await button('Applet').click();
    const selected = page.locator('.sidebar-extensions [aria-current="true"]');
    const selectedName = await selected.locator('span').textContent();
    assert.equal(await page.locator('.detail > .detail-heading h2').textContent(), selectedName);
    assert.deepEqual(
      await page
        .getByRole('tablist', { name: 'Applet詳細の切り替え' })
        .getByRole('tab')
        .allTextContents(),
      ['説明', '設定', 'ショートカット', 'ログ'],
    );
    const assertDetailTab = async (name) => {
      await page.waitForFunction(
        (name) =>
          [...document.querySelectorAll('.detail-tabs [role="tab"]')].some(
            (el) => el.textContent === name && el.getAttribute('aria-selected') === 'true',
          ),
        name,
      );
      assert.equal(await page.locator('.detail-tabs [aria-selected="true"]').count(), 1);
      assert.equal(await detailTab(name).getAttribute('aria-selected'), 'true');
      assert.equal(await page.getByRole('tabpanel', { name, exact: true }).count(), 1);
    };
    await assertDetailTab('説明');
    await detailTab('説明').press('ArrowRight');
    await assertDetailTab('設定');
    await detailTab('設定').press('ArrowRight');
    await assertDetailTab('ショートカット');
    await detailTab('ショートカット').press('End');
    await assertDetailTab('ログ');
    await detailTab('ログ').press('ArrowRight');
    await assertDetailTab('説明');
    await detailTab('説明').press('ArrowLeft');
    await assertDetailTab('ログ');
    await detailTab('ログ').press('Home');
    await assertDetailTab('説明');
    checks.push(
      'horizontal description/settings/shortcuts/log tabs / exclusive selection and panel / keyboard arrows, Home, End',
    );
    const descriptionAppearance = await switchAppearance();
    await detailTab('設定').click();
    assert.deepEqual(await switchAppearance(), descriptionAppearance);
    assert.equal(await page.locator('.detail > .detail-heading h2').textContent(), selectedName);
    assert.equal(await page.getByRole('complementary', { name: 'Applet一覧' }).count(), 1);
    assert.equal(await button('ショートカットを設定').count(), 0);
    await detailTab('説明').click();
    await page.getByLabel('Appletを検索', { exact: true }).fill('検証Applet 01');
    await page
      .getByRole('complementary', { name: 'Applet一覧' })
      .getByRole('button', { name: /検証Applet 01/ })
      .click();
    await detailTab('設定').click();
    await body.getByLabel('検証項目 0', { exact: true }).fill('詳細からの編集');
    const settingAction = button('検証操作');
    await body.waitForFunction(
      () =>
        !document.querySelector(
          'button[aria-describedby="setting-action-help-test.applet-1.apply"]',
        )?.disabled,
    );
    await body.locator('.settings-body').evaluate((e) => {
      e.scrollTop = e.scrollHeight;
    });
    await settingAction.click();
    await body
      .getByRole('status')
      .filter({ hasText: '共通パネルの操作が成功しました。' })
      .waitFor();
    assert.equal(
      await body.getByLabel('検証項目 0', { exact: true }).inputValue(),
      '詳細からの編集',
    );
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'))).extensions['test.applet-1']
        .settings.value0,
      '詳細からの編集',
    );
    await settingAction.click();
    await body.getByRole('alert').filter({ hasText: 'fixture action failure' }).first().waitFor();
    assert.equal(
      await body.getByLabel('検証項目 0', { exact: true }).inputValue(),
      '詳細からの編集',
    );
    checks.push(
      'main setting actions in the shared inline panel / success and failure / durable input preserved',
    );
    await body.getByLabel('検証数値', { exact: true }).fill('');
    await settleSettings(page);
    await body.getByRole('alert').filter({ hasText: '検証数値' }).waitFor();
    await body.getByLabel('検証数値', { exact: true }).fill('3');
    await detailTab('説明').click();
    await detailTab('設定').click();
    assert.equal(
      await body.getByLabel('検証項目 0', { exact: true }).inputValue(),
      '詳細からの編集',
    );
    await button('設定').click();
    await chooseApplet('検証Applet 01');
    assert.equal(
      await body.getByLabel('検証項目 0', { exact: true }).inputValue(),
      '詳細からの編集',
    );
    checks.push(
      'inline settings / description return / unified shortcut entry / persisted settings / validation',
    );

    await chooseApplet('検証Applet 01');
    await body.getByLabel('検証項目 0', { exact: true }).fill('編集した値');
    assert.equal(await body.getByLabel('Appletの設定項目を検索').count(), 0);
    assert.equal(
      await body.locator('.applet-settings [data-setting-item]').count(),
      30, // 24 strings, four typed settings, startup delay and the action row.
      'all declared settings, the common startup delay and action remain visible',
    );
    await body.getByLabel('検証項目 23', { exact: true }).fill('末尾の値');
    await chooseApplet('検証Applet 02');
    await body.getByLabel('検証項目 0', { exact: true }).fill('別Appletの値');
    await button('Appletに戻る').click();
    assert.equal(await page.locator('.detail > .detail-heading h2').textContent(), '検証Applet 02');
    await detailTab('設定').click();
    assert.equal(await body.getByLabel('検証項目 0', { exact: true }).inputValue(), '別Appletの値');
    await button('設定').click();
    await chooseApplet('検証Applet 01');
    assert.equal(await body.getByLabel('検証項目 0', { exact: true }).inputValue(), '編集した値');
    await button('設定').click();
    await settingsNav().getByRole('button', { name: 'バージョン情報・更新', exact: true }).click();
    await body.getByRole('region', { name: 'バージョン情報・更新', exact: true }).waitFor();
    assert.equal(
      await saveSurface.getByRole('button', { name: '変更をすべて保存', exact: true }).count(),
      0,
    );
    assert.equal(
      await body.getByRole('button', { name: 'Appletを一括更新', exact: true }).isDisabled(),
      false,
    );
    await chooseApplet('検証Applet 01');
    assert.equal(await body.getByLabel('検証項目 0', { exact: true }).inputValue(), '編集した値');
    await save();
    const stored = JSON.parse(fs.readFileSync(path.join(profile, 'settings.json')));
    assert.equal(stored.extensions['test.applet-1'].settings.value23, '末尾の値');
    assert.equal(stored.extensions['test.applet-2'].settings.value0, '別Appletの値');
    checks.push('search / immediate writes across applets / return link');
    await body.getByRole('switch', { name: '検証スイッチ' }).click();
    await body.getByLabel('検証選択', { exact: true }).selectOption('b');
    assert.equal(
      await body.getByLabel('未接続の選択', { exact: true }).inputValue(),
      'disconnected',
    );
    await body.getByLabel('検証数値', { exact: true }).fill('');
    await settleSettings(page);
    await body.getByRole('alert').filter({ hasText: '検証数値' }).waitFor();
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'))).extensions['test.applet-1']
        .settings.flag,
      false,
    );
    await body.getByLabel('検証数値', { exact: true }).fill('5');
    await save();
    const typed = JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'))).extensions[
      'test.applet-1'
    ].settings;
    assert.equal(typed.flag, false);
    assert.equal(typed.choice, 'b');
    assert.equal(typed.amount, 5);
    checks.push(
      'boolean / select / unavailable dynamic option / numeric validation and persistence',
    );

    await chooseApplet('検証Applet 00');
    await body
      .getByText('個別の設定項目はありません。操作キーは本体の「ショートカット」で設定できます。')
      .waitFor();
    await button('Appletに戻る').click();
    await detailTab('設定').click();
    await button('ショートカットキー').click();
    await page.locator('.applet-shortcuts').waitFor();
    assert.equal(await page.locator('.applet-shortcuts > h2').count(), 0);
    assert.equal(await page.locator('.applet-shortcuts tbody tr').count(), 0);
    checks.push('no settings / no commands / inline shortcuts');
    await button('設定').click();
    await chooseApplet('検証Applet 00');
    await button('ショートカットキー').click();

    await chooseApplet('Welcome to your Dock');
    await detailTab('ショートカット').click();
    assert.equal(await page.locator('.applet-shortcuts tbody tr').count(), 3);
    assert.equal(await page.locator('.applet-shortcuts input').count(), 0);
    await button('設定').click();
    await button('ショートカット').click();
    await body
      .getByRole('button', { name: 'ウェルカムを更新に割り当てを追加', exact: true })
      .click();
    const shortcutDialog = body.locator('.applet-shortcut-dialog');
    await shortcutDialog.getByText('押して入力', { exact: true }).waitFor();
    await shortcutDialog
      .getByRole('button', { name: 'ショートカットキーを入力', exact: true })
      .press('Control+Alt+r');
    await shortcutDialog.getByRole('button', { name: '追加', exact: true }).click();
    await save();
    assert.equal(await page.locator('.settings-applet-list').count(), 0);
    assert(await body.locator('.shortcuts-editor kbd').filter({ hasText: 'Ctrl+Alt+R' }).count());
    await body.getByLabel('ショートカットキーの絞り込み').selectOption('conflict');
    assert.equal(await body.locator('.shortcuts-editor tbody tr').count(), 0);
    await body.getByLabel('ショートカットキーの絞り込み').selectOption('all');
    assert(await body.locator('[data-shortcut-command^="appdock."]').count());
    checks.push(
      'Applet overview / command-first addition / flat catalog / error filter / host keys',
    );
    await page.evaluate(() => window.dock.toggleExtension('appdock.welcome', false));
    await chooseApplet('Welcome to your Dock');
    await detailTab('ショートカット').click();
    await button('設定').click();
    await button('ショートカット').click();
    await body.getByText('現在利用できません', { exact: false }).first().waitFor();
    assert.equal(
      await body
        .getByRole('button', { name: 'ウェルカムを更新のCtrl+Alt+Rを編集', exact: true })
        .locator('kbd')
        .innerText(),
      'Ctrl+Alt+R',
    );
    await page.evaluate(() => window.dock.toggleExtension('appdock.welcome', true));
    await page.waitForFunction(() =>
      window.dock
        .snapshot()
        .then((s) => s.extensions.find((e) => e.id === 'appdock.welcome')?.state === 'running'),
    );
    checks.push('stopped applet retains known ownership and key bindings');

    await button('設定').click();
    await button('JSON').click();
    await setJsonDraft('{broken');
    await body.getByRole('alert').first().waitFor();
    await button('Applet').click();
    await detailTab('設定').click();
    await button('設定').click();
    await button('フォーム').click();
    checks.push('invalid JSON remains local and does not prevent navigation');

    await chooseApplet('検証Applet 01');
    await detailTab('設定').click();
    await body.getByLabel('検証項目 0', { exact: true }).waitFor();
    await button('設定').click();
    await button('JSON').click();
    const jsonDraft = JSON.parse(await body.getByLabel('設定JSON').inputValue());
    jsonDraft.extensions['test.applet-1'].settings.value0 = 'JSONから共通編集';
    await setJsonDraft(JSON.stringify(jsonDraft));
    await button('Applet').click();
    await page.getByLabel('Appletを検索', { exact: true }).fill('検証Applet 01');
    await page
      .getByRole('complementary', { name: 'Applet一覧' })
      .getByRole('button', { name: /検証Applet 01/ })
      .click();
    await detailTab('設定').click();
    await button('フォーム').click();
    assert.equal(
      await body.getByLabel('検証項目 0', { exact: true }).inputValue(),
      'JSONから共通編集',
    );
    await button('設定').click();
    await chooseApplet('検証Applet 01');
    await button('設定項目').click();
    assert.equal(
      await body.getByLabel('検証項目 0', { exact: true }).inputValue(),
      'JSONから共通編集',
    );
    await settleSettings(page);
    await button('設定').click();
    await button('ショートカット').click();
    await body
      .getByRole('button', { name: 'ウェルカムを更新のCtrl+Alt+Rを編集', exact: true })
      .click();
    await shortcutDialog.getByText('押して入力', { exact: true }).waitFor();
    await shortcutDialog
      .getByRole('button', { name: 'ショートカットキーを入力', exact: true })
      .press('Control+Alt+w');
    await shortcutDialog.getByRole('button', { name: '適用', exact: true }).click();
    await chooseApplet('Welcome to your Dock');
    await detailTab('ショートカット').click();
    await page.locator('.applet-shortcuts kbd').filter({ hasText: 'Ctrl+Alt+W' }).waitFor();
    assert(
      await page
        .locator('.applet-shortcuts kbd')
        .allTextContents()
        .then((keys) => keys.includes('Ctrl+Alt+W')),
    );
    await settleSettings(page);
    assert(
      await page
        .locator('.applet-shortcuts kbd')
        .allTextContents()
        .then((keys) => keys.includes('Ctrl+Alt+W')),
    );
    await button('設定').click();
    checks.push('valid JSON persists into inline form / shortcuts save when applied');

    await chooseApplet('検証Applet 01');
    await button('設定項目').click();
    await body.getByLabel('検証項目 0', { exact: true }).fill('競合しても残す');
    await button('Appletに戻る').click();
    await detailTab('設定').click();
    const external = JSON.parse(fs.readFileSync(path.join(profile, 'settings.json')));
    external.profile.name = '外部変更';
    fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(external));
    await page.waitForFunction(
      async () => (await window.dock.snapshot()).settings.value.profile.name === '外部変更',
    );
    await settleSettings(page);
    assert.equal(
      await body.getByLabel('検証項目 0', { exact: true }).inputValue(),
      '競合しても残す',
    );
    await chooseApplet('検証Applet 01');
    await detailTab('設定').click();
    assert.equal(
      await body.getByLabel('検証項目 0', { exact: true }).inputValue(),
      '競合しても残す',
    );
    checks.push('external updates reach inline saved settings without losing unrelated values');

    await button('Applet').click();
    await page.getByLabel('Appletを検索', { exact: true }).fill('Welcome');
    await page.locator('.sidebar-extensions button').click();
    const logAppearance = await switchAppearance('#applet-detail-tab-logs');
    await detailTab('ログ').click();
    assert.deepEqual(await switchAppearance('#applet-detail-tab-logs'), logAppearance);
    assert.equal(
      await page.getByRole('heading', { name: 'Applet', exact: true, level: 1 }).count(),
      1,
    );
    assert.equal(await page.locator('.sidebar[aria-label="Applet一覧"]').count(), 1);
    let logsPage = await require('./shell-overlay-helper.cjs').logsPage(page, {
      type: 'applet',
      id: 'appdock.welcome',
    });
    assert.equal(await logsPage.getByLabel('ログのApplet').count(), 0);
    assert((await logsPage.locator('.log-row').count()) > 0);
    for (const source of await logsPage.locator('.log-row > div > span').allTextContents())
      assert.equal(source, 'appdock.welcome');
    await logsPage.getByLabel('ログを検索').fill('no-such-log-entry');
    await logsPage.getByText('該当するログはありません。', { exact: true }).waitFor();
    await logsPage.getByLabel('ログを検索').fill('');
    await logsPage.getByLabel('ログレベル').selectOption('error');
    await logsPage.waitForFunction(() =>
      [...document.querySelectorAll('.log-level')].every((e) => e.textContent === 'error'),
    );
    for (const level of await logsPage.locator('.log-row .log-level').allTextContents())
      assert.equal(level, 'error');
    await logsPage.getByLabel('ログレベル').selectOption('all');
    await page.screenshot({ path: path.join(profile, 'inline-applet-logs.png') });
    await detailTab('説明').click();
    assert.equal(await page.locator('.detail-logs').count(), 0);
    await detailTab('設定').click();
    await detailTab('ログ').click();
    assert.equal(await page.locator('.detail-settings').count(), 0);
    await detailTab('設定').click();
    assert.equal(await page.locator('.detail-logs').count(), 0);
    await detailTab('説明').click();
    await detailTab('ログ').click();
    await button('ログ').click();
    logsPage = await require('./shell-overlay-helper.cjs').logsPage(page, { type: 'all' });
    await logsPage.getByRole('heading', { name: 'ログ', exact: true, level: 1 }).waitFor();
    assert.equal(
      await logsPage.getByRole('heading', { name: 'ログ', exact: true, level: 1 }).count(),
      1,
    );
    assert.equal(await logsPage.getByLabel('ログのApplet').inputValue(), '');
    await logsPage.getByLabel('ログのApplet').selectOption('host');
    await button('Applet').click();
    logsPage = await require('./shell-overlay-helper.cjs').logsPage(page, {
      type: 'applet',
      id: 'appdock.welcome',
    });
    for (const source of await logsPage.locator('.log-row > div > span').allTextContents())
      assert.equal(source, 'appdock.welcome');
    await page.getByLabel('Appletを検索', { exact: true }).fill('検証Applet 01');
    await page.locator('.sidebar-extensions button').click();
    assert.equal(await page.locator('.detail-logs').count(), 1);
    assert.equal(await detailTab('ログ').getAttribute('aria-selected'), 'true');
    logsPage = await require('./shell-overlay-helper.cjs').logsPage(page, {
      type: 'applet',
      id: 'test.applet-1',
    });
    for (const source of await logsPage.locator('.log-row > div > span').allTextContents())
      assert.equal(source, 'test.applet-1');
    await detailTab('設定').click();
    await body.getByLabel('検証項目 0', { exact: true }).fill('ログ切替で保持する下書き');
    await detailTab('ログ').click();
    await detailTab('設定').click();
    assert.equal(
      await body.getByLabel('検証項目 0', { exact: true }).inputValue(),
      'ログ切替で保持する下書き',
    );
    await settleSettings(page);
    await detailTab('説明').click();
    checks.push(
      'inline applet logs / fixed source / search and level / stable tabs / persisted settings / independent global logs / applet selection retains tab',
    );

    const searchButton = page.locator('.titlebar-search');
    let palette;
    await searchButton.click();
    palette = await require('./shell-overlay-helper.cjs').overlayPage(page);
    await palette.getByPlaceholder('コマンドを入力…').fill('Welcome');
    assert.deepEqual(
      (
        await palette
          .locator('.palette-command')
          .evaluateAll((rows) => rows.map((r) => r.dataset.commandId))
      ).sort(),
      [
        'appdock.welcome.refresh',
        'appdock.welcome.notify',
        'appdock.welcome.verify-storage',
        'appdock.applets.appdock.welcome.enable',
        'appdock.applets.appdock.welcome.disable',
        'appdock.applets.appdock.welcome.restart',
      ].sort(),
    );
    await palette.getByPlaceholder('コマンドを入力…').press('ArrowDown');
    assert.equal(await palette.locator('.palette-command[aria-selected="true"]').count(), 1);
    await require('./shell-overlay-helper.cjs').closingAction(
      palette.getByPlaceholder('コマンドを入力…').press('Escape'),
    );
    assert.equal(await searchButton.evaluate((el) => el === document.activeElement), true);
    await searchButton.click();
    palette = await require('./shell-overlay-helper.cjs').overlayPage(page);
    await palette.getByPlaceholder('コマンドを入力…').fill('ウェルカムを更新');
    await app.evaluate(() => {
      const { ExtensionManager } = process
        .getBuiltinModule('module')
        .createRequire(process.cwd() + '/package.json')('./out/main/main/core/extensions');
      const original = ExtensionManager.prototype.execute;
      globalThis.paletteExecutionFixture = {
        original,
        prototype: ExtensionManager.prototype,
        completed: false,
      };
      ExtensionManager.prototype.execute = async function (id, ...args) {
        const result = await original.call(this, id, ...args);
        if (id === 'appdock.welcome.refresh') globalThis.paletteExecutionFixture.completed = true;
        return result;
      };
    });
    await require('./shell-overlay-helper.cjs').closingAction(
      palette.getByPlaceholder('コマンドを入力…').press('Enter'),
    );
    assert(
      await app.evaluate(async () => {
        const end = Date.now() + 10000;
        while (!globalThis.paletteExecutionFixture.completed && Date.now() < end)
          await new Promise((resolve) => setTimeout(resolve, 30));
        const fixture = globalThis.paletteExecutionFixture;
        fixture.prototype.execute = fixture.original;
        return fixture.completed;
      }),
      'palette dispatch completes the selected Applet handler',
    );
    checks.push('palette owner search / arrows / Enter / focus restoration');

    for (const theme of ['dark', 'light']) {
      await button('設定').click();
      await button('表示').click();
      await body.getByLabel('テーマ', { exact: true }).selectOption(theme);
      await save();
      await chooseApplet('検証Applet 01');
      await button('設定項目').click();
      for (const size of [
        { width: 1280, height: 840 },
        { width: 900, height: 620 },
      ]) {
        await page.setViewportSize(size);
        await page.locator('main').evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });
        await settleSettings(page);
        assert.equal(
          await page.locator('main').evaluate((el) => el.scrollWidth <= el.clientWidth),
          true,
          'no horizontal overflow',
        );
        await page.locator('main').evaluate((el) => {
          el.scrollTop = 0;
        });
        await page.screenshot({ path: path.join(profile, `${theme}-${size.width}-settings.png`) });
      }
      await button('Appletに戻る').click();
      await page.getByLabel('Appletを検索', { exact: true }).fill('');
      await detailTab('設定').click();
      await body.getByLabel('検証項目 0', { exact: true }).fill(`詳細で保存 ${theme}`);
      await page.screenshot({ path: path.join(profile, `${theme}-inline-settings-top.png`) });
      for (const width of [1280, 900, 700]) {
        await page.setViewportSize({ width, height: 620 });
        await detailTab('説明').click();
        await page.locator('main').evaluate((el) => {
          el.scrollTop = 0;
        });
        const appearance = await switchAppearance();
        const tabs = page.getByRole('tablist', { name: 'Applet詳細の切り替え' }).getByRole('tab');
        for (const tab of await tabs.all()) {
          assert(
            await tab.evaluate((el) => {
              const range = document.createRange();
              range.selectNode(el.lastChild);
              return range.getClientRects().length === 1 && el.scrollWidth <= el.clientWidth;
            }),
            'tab labels stay on one line without clipping',
          );
        }
        await page.screenshot({
          path: path.join(profile, `${theme}-${width}-description-switch.png`),
        });
        const logAppearance = await switchAppearance('#applet-detail-tab-logs');
        await detailTab('ログ').click();
        assert.deepEqual(await switchAppearance('#applet-detail-tab-logs'), logAppearance);
        assert(await page.locator('main').evaluate((el) => el.scrollWidth <= el.clientWidth));
        await page.screenshot({ path: path.join(profile, `${theme}-${width}-inline-logs.png`) });
        await detailTab('説明').click();
        await detailTab('設定').click();
        assert.deepEqual(
          await switchAppearance(),
          appearance,
          'tabs and heading stay in place across detail panels',
        );
        await page.locator('.detail-settings > .applet-settings-panel').evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });
        await settleSettings(page);
        assert(await page.locator('main').evaluate((el) => el.scrollWidth <= el.clientWidth));
        await page.screenshot({
          path: path.join(profile, `${theme}-${width}-inline-settings.png`),
        });
      }
      await save();
      checks.push(
        `${theme}: stable description/settings/shortcuts/log tabs at 1280, 900 and 700px; single-line labels`,
      );
      assert.equal(
        JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'))).extensions['test.applet-1']
          .settings.value0,
        `詳細で保存 ${theme}`,
      );
      await button('ショートカットキー').click();
      await detailTab('説明').click();
      await detailTab('設定').click();
      await button('設定').click();
      await chooseApplet('検証Applet 01');
      assert.equal(
        await body.getByLabel('検証項目 0', { exact: true }).inputValue(),
        `詳細で保存 ${theme}`,
      );
      await button('ショートカットキー').click();
      await chooseApplet('Welcome to your Dock');
      await button('設定').click();
      await button('ショートカット').click();
      for (const width of [1280, 900, 700]) {
        await page.setViewportSize({ width, height: 620 });
        const search = await body.locator('.command-shortcut-search').boundingBox();
        const statusGroup = body.getByLabel('ショートカットキーの絞り込み');
        const status = await statusGroup.boundingBox();
        assert.equal(await statusGroup.inputValue(), 'all');
        assert.equal(search.y, status.y, 'search and status filter share one row');
        assert.equal(search.height, status.height, 'filter controls have equal height');
        assert(search.x + search.width < status.x, 'filter controls do not overlap');
        assert(await page.locator('main').evaluate((el) => el.scrollWidth <= el.clientWidth));
        await page.screenshot({ path: path.join(profile, `${theme}-${width}-shortcuts.png`) });
      }
      await page.setViewportSize({ width: 900, height: 620 });
      for (const name of ['画像ライブラリー', 'Applet', 'ログ']) {
        await button(name).click();
        await page.locator('main').evaluate((el) => {
          el.scrollTop = 0;
        });
        assert.equal(
          await page.locator('main').evaluate((el) => el.scrollWidth <= el.clientWidth),
          true,
          `${name} fits minimum width`,
        );
        await page.screenshot({ path: path.join(profile, `${theme}-900-${name}.png`) });
      }
    }
    checks.push(
      '24 applets / long forms / dark and light / 1280x840 and 900x620 / immediate save / no overflow',
      'command search and status filter share a row at 1280 / 900 / 700px in both themes',
    );
    assert.deepEqual(errors, []);
    const result = { ok: true, profile, checks };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(
      'SETTINGS-DIAGNOSTIC',
      await page
        .evaluate(async () => {
          const state = await window.dock.settingsEditing();
          const id = document.querySelector('.settings-surface')?.dataset.settingsConnection;
          let model;
          try {
            model = await window.dock.settingsPage.get(id);
          } catch {}
          return {
            pageId: state.pageId,
            mode: state.mode,
            editRevision: state.editRevision,
            modelPage: model?.content.page.id,
            modelMode: model?.content.editing.mode,
            alerts: [...document.querySelectorAll('[role="alert"]')].map((el) => el.textContent),
            controls: [...document.querySelectorAll('.settings-page-toolbar button')].map((el) => [
              el.textContent,
              el.className,
              el.disabled,
            ]),
          };
        })
        .catch(() => null),
    );
    await page.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
