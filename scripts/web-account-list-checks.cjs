const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { settleSettings } = require('./settings-immediate-helper.cjs');

// Isolated accounts only. Confirmations are operated through the shared settings dialog.
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
  assert.equal(await add.count(), 1);
  for (const name of ['名前', '使用先', '操作'])
    assert.equal(
      await table.getByRole('columnheader', { name: new RegExp(`^${name}`) }).count(),
      1,
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

  for (const [theme, width] of [
    ['light', 1280],
    ['dark', 760],
  ]) {
    await host.evaluate(async (theme) => {
      const state = await window.dock.snapshot();
      state.settings.value.host.theme = theme;
      await window.dock.saveSettings(state.settings.value, state.settings.revision);
    }, theme);
    await settleSettings(host);
    await host.waitForFunction((theme) => document.documentElement.dataset.theme === theme, theme);
    await select('Webアカウント');
    const actualWidth = await inspect(
      inspector,
      electronExpression +
        `.BrowserWindow.getAllWindows().filter(w=>w.webContents.getURL().startsWith('appdock://host/')).map(w=>{w.setSize(${width},850);return w.getContentSize()[0];})[0]`,
    );
    // Resize schedules a settings viewport action; wait for its model before changing hints.
    await until(
      () =>
        host.evaluate(async (width) => {
          const connection = document.querySelector('.settings-surface').dataset.settingsConnection;
          const model = await window.dock.settingsPage.get(connection);
          return window.innerWidth === width && model.content.hostWidth === width;
        }, actualWidth),
      'settings viewport after resize',
    );
    await settleSettings(host);
    await row(first)
      .getByRole('button', { name: '個人用のログイン情報をクリア', exact: true })
      .click();
    const modal = host.getByTestId('settings-dialog');
    await modal.waitFor();
    assert.equal(await modal.evaluate((e) => e.matches(':modal')), true);
    assert.equal(await modal.getByTestId('settings-dialog-cancel').isVisible(), true);
    await host.screenshot({
      path: path.join(profile, `web-accounts-${theme}-${width}.png`),
    });
    await modal.press('Escape');
    await modal.waitFor({ state: 'detached' });
  }
  checks.push(
    'Light 1280 and dark 760: confirmation uses the in-page modal top layer and remains cancellable',
  );

  // A rejected name stays in the input and uses the common fixed error area.
  await input(first).fill('不正\u0001入力');
  await input(first).press('Enter');
  await host.locator('.settings-status-area .settings-error[data-error=true]').waitFor();
  assert.equal((await accounts()).find((a) => a.id === first).name, '個人用');
  assert.equal(await input(first).inputValue(), '不正\u0001入力');
  await input(first).press('Escape');
  assert.equal(await input(first).inputValue(), '個人用');
  checks.push('Rejected input remains editable with an error; Escape restores saved name');

  // Reject accidental native confirmations and seed isolated session cookies.
  await inspect(
    inspector,
    `(() => {
    const e = ${electronExpression};
    globalThis.accountListDialogs = [];
    globalThis.accountListOriginalDialog = e.dialog.showMessageBox;
    e.dialog.showMessageBox = async (...args) => {
      globalThis.accountListDialogs.push(args.at(-1));
      return { response: 0, checkboxChecked: false };
    };
  })()`,
  );
  const cookie = async (id, seed = false) =>
    inspect(
      inspector,
      `(${async (e, directory, seed) => {
        const ses = e.session.fromPath(directory);
        if (seed)
          await ses.cookies.set({ url: 'https://fixture.invalid', name: 'fixture', value: 'keep' });
        return (await ses.cookies.get({ name: 'fixture' })).length;
      }})(${electronExpression},${JSON.stringify(path.join(profile, 'local/web-profiles/fixture.web-settings/sessions', id))},${seed})`,
    );
  try {
    const clear = row(first).getByRole('button', {
      name: '個人用のログイン情報をクリア',
      exact: true,
    });
    const remove = row(second).locator('.settings-list-delete');
    const roster = JSON.stringify(await accounts());
    // Initialize the second session through its owning service before seeding it.
    await host.evaluate(async (id) => {
      const account = (await window.dock.snapshot()).webAccounts.find((a) => a.id === id);
      await window.dock.clearWebAccount(id, account);
      await assertOwner();
      async function assertOwner() {
        let rejected = false;
        try {
          await window.dock.clearWebAccount(id, { ...account, owner: 'wrong.owner' });
        } catch {
          rejected = true;
        }
        if (!rejected) throw Error('Wrong account owner accepted');
      }
    }, second);
    assert.equal(await cookie(first, true), 1);
    assert.equal(await cookie(second, true), 1);
    const dialog = host.getByTestId('settings-dialog');
    const cancel = dialog.getByTestId('settings-dialog-cancel');
    const confirm = dialog.getByTestId('settings-dialog-confirm');
    await clear.click();
    await dialog.waitFor();
    assert.match(await dialog.innerText(), /個人用.*ログイン情報とサイトデータ/);
    await dialog.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await clear.evaluate((e) => document.activeElement === e), true);
    assert.equal(JSON.stringify(await accounts()), roster);
    assert.equal(await cookie(first), 1);
    await remove.click();
    await dialog.waitFor();
    assert.match(await dialog.innerText(), /元に戻せません/);
    await cancel.click();
    await dialog.waitFor({ state: 'detached' });
    assert.equal(JSON.stringify(await accounts()), roster);
    assert.equal(await cookie(second), 1);
    checks.push(
      'In-page clear/delete dialogs cancel without changing roster or cookies and restore focus',
    );

    // A name changed while the dialog is open invalidates its confirmation.
    await clear.click();
    await dialog.waitFor();
    await host.evaluate((id) => window.dock.renameWebAccount(id, '変更された個人用'), first);
    await confirm.click();
    await dialog.getByRole('alert').filter({ hasText: /変更/ }).waitFor();
    assert.equal(await cookie(first), 1);
    await cancel.click();
    await dialog.waitFor({ state: 'detached' });
    await rename(first, '個人用');

    // A newly assigned page must prevent deletion at the host boundary too.
    await remove.click();
    await dialog.waitFor();
    await host.evaluate(async (id) => {
      const state = await window.dock.snapshot();
      const items = state.settings.value.extensions['fixture.web-settings'].settings.items;
      items.push({
        ...items[0],
        id: 'site.assigned',
        name: 'Assigned while confirming',
        accountId: id,
      });
      await window.dock.saveSettings(state.settings.value, state.settings.revision);
    }, second);
    await confirm.click();
    await dialog.getByRole('alert').filter({ hasText: /使用/ }).waitFor();
    assert.equal(await cookie(second), 1);
    assert.equal((await accounts()).length, 2);
    await cancel.click();
    await dialog.waitFor({ state: 'detached' });
    await host.evaluate(async () => {
      const state = await window.dock.snapshot();
      const settings = state.settings.value.extensions['fixture.web-settings'].settings;
      settings.items = settings.items.filter((item) => item.id !== 'site.assigned');
      await window.dock.saveSettings(state.settings.value, state.settings.revision);
    });
    await until(() => remove.isEnabled(), 'unassigned account');
    checks.push(
      'Changed target and newly referenced account are rejected in the dialog before cookie deletion',
    );

    await clear.click();
    await dialog.waitFor();
    await host.screenshot({ path: path.join(profile, 'web-account-clear-modal.png') });
    await confirm.click();
    await dialog.waitFor({ state: 'detached' });
    await until(async () => await clear.isEnabled(), 'clear accepted');
    assert.equal(JSON.stringify(await accounts()), roster);
    assert.equal(await cookie(first), 0);
    assert.equal(await cookie(second), 1);
    await remove.click();
    await dialog.waitFor();
    await host.screenshot({ path: path.join(profile, 'web-account-delete-modal.png') });
    await confirm.click();
    await dialog.waitFor({ state: 'detached' });
    await until(async () => (await accounts()).length === 1, 'delete accepted');
    const dialogs = await inspect(inspector, 'globalThis.accountListDialogs');
    assert.deepEqual(dialogs, [], 'settings actions never open a native confirmation');
    assert.equal(await cookie(second), 0);
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
    'Clear/delete use one in-page confirmation; clear preserves roster and the other session, delete removes only its target',
  );

  for (let i = 1; i < 33; i++)
    await host.evaluate((i) => window.dock.createWebAccount(`上限確認 ${i}`), i);
  await until(
    async () => (await accounts()).length === 33 && (await add.isEnabled()),
    'larger account roster',
  );
  await until(async () => (await table.locator('tbody tr').count()) === 33, 'roster rendering');
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
  checks.push('More than 32 accounts remain addable; keyboard reaches actions on the final row');
};
