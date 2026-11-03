const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async ({ app, page, profile, checks, select, info, until, snapshot }) => {
  const state = async (id) => (await snapshot()).extensions.find((a) => a.id === id);
  const marker = (id, name) => path.join(profile, 'extensions', id, name);
  const activations = (id) => JSON.parse(fs.readFileSync(marker(id, 'activations.json')));
  const lifecycle = info.getByTestId('applet-lifecycle');
  const commands = info.getByRole('button', {
    name: 'このAppletのコマンドトリガーを設定',
    exact: true,
  });
  const list = page.getByTestId('command-triggers-list');
  const rows = () =>
    list
      .locator('[data-shortcut-command]')
      .evaluateAll((elements) => elements.map((el) => el.dataset.shortcutCommand).sort());
  await select('fixture.info');
  assert.equal(await info.getByTestId('applet-command-count').innerText(), '2');
  assert(await commands.getByText('利用可能 2', { exact: true }).isVisible());
  const before = (await snapshot()).settings.value;
  await commands.focus();
  await page.keyboard.press('Enter');
  await list.waitFor();
  await until(
    async () =>
      JSON.stringify(await rows()) === JSON.stringify(['fixture.info.one', 'fixture.info.two']),
    'owner command rows updated',
  );
  assert(
    await list
      .getByTestId('command-provider-filter')
      .getByText('fixture.info', { exact: true })
      .isVisible(),
  );
  await list.getByTestId('command-provider-filter-clear').click();
  await until(async () => (await rows()).includes('appdock.noop'), 'provider filter cleared');
  await list.getByRole('searchbox').fill('does-not-match');
  await list
    .getByRole('combobox', { name: 'トリガーの絞り込み', exact: true })
    .selectOption('assigned');
  await page.getByTestId('command-trigger-tab:gestures').click();
  await select('fixture.info');
  await commands.click();
  await list.waitFor();
  await until(
    async () =>
      JSON.stringify(await rows()) === JSON.stringify(['fixture.info.one', 'fixture.info.two']),
    'owner command rows updated',
  );
  assert.equal(await list.getByRole('searchbox').inputValue(), '');
  assert.equal(
    await list.getByRole('combobox', { name: 'トリガーの絞り込み', exact: true }).inputValue(),
    'all',
  );
  assert.deepEqual((await snapshot()).settings.value, before);
  checks.push(
    'command count deduplicates declared/runtime commands, excludes host management, includes unassigned commands; Enter and pointer open the owner-filtered command tab, reset old filters and allow clearing without saves',
  );

  await select('fixture.info');
  fs.writeFileSync(marker('fixture.info', 'stop-gate'), '');
  await lifecycle.click();
  await until(async () => (await state('fixture.info')).state === 'stopping', 'stop in progress');
  assert(await lifecycle.isDisabled());
  assert.equal(await lifecycle.innerText(), '停止中…');
  assert(await info.getByRole('button', { name: '再起動', exact: true }).isDisabled());
  fs.writeFileSync(marker('fixture.info', 'stop-release'), '');
  await until(async () => (await state('fixture.info')).state === 'stopped', 'stop completed');
  await until(async () => !(await lifecycle.isDisabled()), 'stop action settled');
  assert.equal(await lifecycle.innerText(), '開始');
  assert.equal(await info.getByTestId('applet-command-count').innerText(), '2');
  assert(await commands.getByText('利用可能 0', { exact: true }).isVisible());
  assert.equal((await snapshot()).settings.value.extensions['fixture.info'].enabled, false);
  assert.equal(
    (await snapshot()).settings.value.extensions['fixture.info'].settings.text,
    'saved through JSON',
  );
  await commands.click();
  await list.waitFor();
  await until(
    async () =>
      JSON.stringify(await rows()) === JSON.stringify(['fixture.info.one', 'fixture.info.two']),
    'owner command rows updated',
  );
  assert.equal((await state('fixture.info')).state, 'stopped');

  await select('fixture.info');
  fs.unlinkSync(marker('fixture.info', 'release'));
  const count = activations('fixture.info');
  await lifecycle.click();
  await until(async () => (await state('fixture.info')).state === 'starting', 'start in progress');
  assert(await lifecycle.isDisabled());
  assert.equal(await lifecycle.innerText(), '起動中…');
  fs.writeFileSync(marker('fixture.info', 'release'), '');
  await until(async () => (await state('fixture.info')).state === 'running', 'start completed');
  await until(async () => !(await lifecycle.isDisabled()), 'start action settled');
  assert.equal(activations('fixture.info'), count + 1);
  assert.equal(await lifecycle.innerText(), '停止');
  assert(await commands.getByText('利用可能 2', { exact: true }).isVisible());
  assert.equal((await snapshot()).settings.value.extensions['fixture.info'].enabled, true);
  checks.push(
    'start/stop updates persisted enabled and availability, preserves the selected page/settings/command total, blocks pending lifecycle controls and starts once',
  );

  await select('fixture.empty');
  assert.equal(await info.getByTestId('applet-command-count').innerText(), '0');
  await commands.click();
  await list.waitFor();
  await until(async () => (await rows()).length === 0, 'empty command rows updated');
  assert.equal((await state('fixture.empty')).state, 'stopped');
  await select('fixture.empty');
  await lifecycle.click();
  await until(
    async () => (await state('fixture.empty')).state === 'running',
    'empty Applet starts',
  );

  await select('fixture.delayed');
  assert.equal(await lifecycle.innerText(), '今すぐ開始');
  await lifecycle.click();
  await until(
    async () => (await state('fixture.delayed')).state === 'running',
    'delayed Applet starts now',
  );
  await until(async () => !(await lifecycle.isDisabled()), 'delayed action settled');
  await lifecycle.click();
  await until(
    async () => (await state('fixture.delayed')).state === 'stopped',
    'delayed Applet stops',
  );
  await until(async () => !(await lifecycle.isDisabled()), 'delayed stop settled');
  await lifecycle.click();
  await until(
    async () => (await state('fixture.delayed')).state === 'running',
    'disabled delayed Applet starts now',
  );

  await select('fixture.failed');
  const failedCount = activations('fixture.failed');
  await lifecycle.click();
  await until(
    async () =>
      activations('fixture.failed') === failedCount + 1 && !(await lifecycle.isDisabled()),
    'failed retry settles',
  );
  assert.equal((await state('fixture.failed')).state, 'error');
  await page.getByRole('alert').filter({ hasText: '開始' }).waitFor();
  fs.writeFileSync(marker('fixture.failed', 'recover'), '');
  await lifecycle.click();
  await until(
    async () => (await state('fixture.failed')).state === 'running',
    'failed Applet retry recovers',
  );
  assert.equal(activations('fixture.failed'), failedCount + 2);
  checks.push(
    'zero commands remain navigable; waiting and disabled delayed Applets start immediately; failures remain retryable without repeated automatic activation',
  );

  await select('fixture.info');
  await lifecycle.click();
  await until(
    async () =>
      (await state('fixture.info')).state === 'stopped' && !(await lifecycle.isDisabled()),
    'stop before persistence check',
  );
  const saved = (await snapshot()).settings.value;
  await page.getByTestId('settings-nav:applets').click();
  await page.getByLabel('Appletを検索', { exact: true }).fill('fixture.info');
  assert.equal(
    await page
      .locator('[data-applet-id="fixture.info"]')
      .getByRole('switch')
      .first()
      .getAttribute('aria-checked'),
    'false',
  );
  assert.deepEqual((await snapshot()).settings.value, saved);
  checks.push(
    'information lifecycle controls and management enabled switch share the same persisted state',
  );
};
