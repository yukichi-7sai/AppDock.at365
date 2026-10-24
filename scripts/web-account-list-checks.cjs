const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { settleSettings } = require('./settings-immediate-helper.cjs');

// Isolated accounts only. Native confirmation responses are supplied by this fixture.
module.exports = async function ({
  host,
  select,
  snapshot,
  until,
  inspect,
  inspector,
  electronExpression,
  profile,
  checks,
  hints,
}) {
  const table = host.getByRole('table', { name: 'Webアカウント', exact: true });
  const add = host.getByRole('button', { name: 'アカウント枠を追加', exact: true });
  const row = (id) => table.locator(`[data-account-id="${id}"]`);
  const input = (id) => row(id).getByRole('textbox');
  const accounts = async () => (await snapshot()).webAccounts;
  const rename = async (id, name) => {
    await input(id).fill(name);
    await input(id).press('Enter');
    await until(async () => (await accounts()).find((a) => a.id === id)?.name === name, 'rename');
    await input(id).press('Tab');
    await settleSettings(host);
  };
  await select('Webアカウント');
  assert.equal((await accounts()).length, 0);
  await table.locator('.settings-list-empty').waitFor();
  assert.equal(await table.locator('thead button').count(), 1);
  assert.deepEqual(
    (await table.locator('th').allTextContents()).map((s) => s.replace('＋', '').trim()),
    ['名前', '使用先', '操作'],
  );
  await add.click();
  await until(async () => (await accounts()).length === 1, 'first addition');
  const first = (await accounts())[0].id;
  await rename(first, '個人用');
  await input(first).fill('取り消す名前');
  assert.equal((await accounts())[0].name, '個人用');
  await input(first).press('Escape');
  assert.equal(await input(first).inputValue(), '個人用');
  await input(first).fill('仕事用');
  await input(first).press('Tab');
  await until(async () => (await accounts())[0].name === '仕事用', 'blur confirmation');
  await input(first).focus();
  await input(first).dispatchEvent('compositionstart');
  await input(first).fill('日本語入力');
  await input(first).press('Enter');
  assert.equal((await accounts())[0].name, '仕事用');
  await input(first).dispatchEvent('compositionend');
  await input(first).press('Enter');
  await until(async () => (await accounts())[0].name === '日本語入力', 'IME confirmation');
  await rename(first, '個人用');
  checks.push(
    'Empty table/addition and inline Enter/blur/Escape/IME confirmation preserve stable IDs',
  );

  await add.click();
  await until(async () => (await accounts()).length === 2, 'second addition');
  const second = (await accounts())[1].id;
  await rename(second, '長いアカウント名'.repeat(8));
  await host.evaluate(async (id) => {
    const s = await window.dock.snapshot();
    s.settings.value.extensions['fixture.web-settings'].settings.items = [
      {
        id: 'site.fixture',
        name: '長い使用先の名前'.repeat(8),
        enabled: false,
        display: 'page',
        url: 'https://example.test/',
        navigation: 'same-origin',
        allowedOrigins: [],
        accountId: id,
      },
    ];
    await window.dock.saveSettings(s.settings.value, s.settings.revision);
  }, first);
  await until(
    async () =>
      await row(first).getByRole('button', { name: '個人用の枠を削除', exact: true }).isDisabled(),
    'referenced delete disabled',
  );
  assert.equal(await row(second).getByText('未使用', { exact: true }).count(), 1);
  assert.equal(
    await row(first)
      .getByRole('button', { name: '個人用のログイン情報をクリア', exact: true })
      .isEnabled(),
    true,
  );
  assert.equal(await host.getByRole('button', { name: '名前を変更', exact: true }).count(), 0);
  checks.push(
    'Usage names are visible; referenced deletion is disabled while clear and unused deletion remain available',
  );

  for (const theme of ['light', 'dark']) {
    await select('表示');
    await host
      .getByRole('region', { name: '共通', exact: true })
      .getByLabel('テーマ', { exact: true })
      .selectOption(theme);
    await settleSettings(host);
    await host.waitForFunction((theme) => document.documentElement.dataset.theme === theme, theme);
    await select('Webアカウント');
    for (const width of [1280, 760]) {
      const actualWidth = await inspect(
        inspector,
        electronExpression +
          `.BrowserWindow.getAllWindows().filter(w=>w.webContents.getURL().startsWith('appdock://host/')).map(w=>{w.setSize(${width},850);return w.getContentSize()[0];})[0]`,
      );
      // Resize schedules a settings viewport action; wait for its model before changing hints.
      await until(
        () =>
          host.evaluate(async (width) => {
            const connection =
              document.querySelector('.settings-surface').dataset.settingsConnection;
            const model = await window.dock.settingsPage.get(connection);
            return window.innerWidth === width && model.content.hostWidth === width;
          }, actualWidth),
        'settings viewport after resize',
      );
      await settleSettings(host);
      for (const enabled of [true, false]) {
        await hints(enabled);
        assert.equal(await host.locator('.command-list-description').count(), 0);
        assert.equal(
          await host
            .locator('.command-list-toolbar')
            .evaluate((e) => getComputedStyle(e).borderBottomWidth),
          '0px',
        );
        await host
          .locator('.settings-page-heading > p')
          .getByText(
            require('../src/shared/locales/ja/host.json')[
              'settings.settingsPageLayout.webAccounts'
            ],
            { exact: true },
          )
          .waitFor();
        const layout = await table.evaluate((table) => ({
          widths: [...table.querySelectorAll('.settings-list-icon')].map((b) => [
            b.offsetWidth,
            b.offsetHeight,
          ]),
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          usageWrap: getComputedStyle(table.querySelector('.settings-list-wrap')).whiteSpace,
          cards: document.querySelectorAll('.web-account-card').length,
        }));
        assert(layout.widths.every(([w, h]) => w === 32 && h === 32));
        assert.equal(layout.overflow, false);
        assert.equal(layout.usageWrap, 'normal');
        assert.equal(layout.cards, 0);
        await host.screenshot({
          path: path.join(profile, `web-accounts-${theme}-${width}-${enabled}.png`),
        });
      }
    }
  }
  checks.push(
    'Light/dark, 1280/760, hints ON/OFF: shared 32px actions, wrapped usage, long names and persistent warning without page overflow',
  );

  // A rejected name stays in the input and uses the common fixed error area.
  const before = await table.boundingBox();
  await input(first).fill('不正\u0001入力');
  await input(first).press('Enter');
  await host.locator('.settings-status-area .settings-error[data-error=true]').waitFor();
  assert.equal((await accounts()).find((a) => a.id === first).name, '個人用');
  assert.equal(await input(first).inputValue(), '不正\u0001入力');
  const after = await table.boundingBox();
  assert(Math.abs(before.y - after.y) <= 1, 'error does not shift table');
  await input(first).press('Escape');
  assert.equal(await input(first).inputValue(), '個人用');
  checks.push(
    'Rejected input remains editable; shared error area does not shift the table; Escape restores saved name',
  );

  // Record the actual host confirmation call made by the new icon buttons.
  await inspect(
    inspector,
    `(() => {
    const e = ${electronExpression};
    globalThis.accountListDialogs = [];
    globalThis.accountListResponse = 0;
    globalThis.accountListOriginalDialog = e.dialog.showMessageBox;
    e.dialog.showMessageBox = async (...args) => {
      globalThis.accountListDialogs.push(args.at(-1));
      return { response: globalThis.accountListResponse, checkboxChecked: false };
    };
  })()`,
  );
  try {
    const clear = row(first).getByRole('button', {
      name: '個人用のログイン情報をクリア',
      exact: true,
    });
    const remove = row(second).locator('.settings-list-delete');
    const roster = JSON.stringify(await accounts());
    await clear.click();
    await until(async () => await clear.isEnabled(), 'clear cancel');
    assert.equal(JSON.stringify(await accounts()), roster);
    await remove.click();
    await until(async () => await remove.isEnabled(), 'delete cancel');
    assert.equal(JSON.stringify(await accounts()), roster);
    await inspect(inspector, 'globalThis.accountListResponse = 1');
    await clear.click();
    await until(async () => await clear.isEnabled(), 'clear accepted');
    assert.equal(JSON.stringify(await accounts()), roster);
    await remove.click();
    await until(async () => (await accounts()).length === 1, 'delete accepted');
    const dialogs = await inspect(inspector, 'globalThis.accountListDialogs');
    assert.equal(dialogs.length, 4);
    assert.deepEqual(
      dialogs.map((d) => d.buttons),
      [
        ['キャンセル', 'クリア'],
        ['キャンセル', '枠を削除'],
        ['キャンセル', 'クリア'],
        ['キャンセル', '枠を削除'],
      ],
    );
    assert(dialogs.every((d) => d.defaultId === 0 && d.cancelId === 0 && d.detail));
    fs.writeFileSync(
      path.join(profile, 'web-account-dialogs.json'),
      JSON.stringify(dialogs, null, 2),
    );
  } finally {
    await inspect(
      inspector,
      `${electronExpression}.dialog.showMessageBox = globalThis.accountListOriginalDialog; delete globalThis.accountListOriginalDialog;`,
    );
  }
  checks.push(
    'Clear/delete icon clicks reach native warning contracts; cancel preserves accounts, clear keeps roster, delete removes only target',
  );

  for (let i = 1; i < 32; i++)
    await host.evaluate((i) => window.dock.createWebAccount(`上限確認 ${i}`), i);
  await until(
    async () => (await accounts()).length === 32 && (await add.isDisabled()),
    'account limit',
  );
  assert.equal(await table.locator('tbody tr').count(), 32);
  await table.locator('tbody tr').last().getByRole('textbox').focus();
  await table.locator('tbody tr').last().getByRole('textbox').press('Tab');
  assert.equal(
    await table
      .locator('tbody tr')
      .last()
      .locator('.settings-list-icon')
      .first()
      .evaluate((el) => el === document.activeElement),
    true,
  );
  checks.push('32-account limit disables addition; keyboard reaches actions on the final row');
};
