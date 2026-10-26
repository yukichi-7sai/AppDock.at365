const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { settingsItemId } = require('../out/main/shared/settings-catalog');

module.exports = async ({ page, profile, local, checks, value, until, fixtureId }) => {
  const credentialFiles = ['ai-keys.json', 'tts-key.json', 'mcp-client.json']
    .map((name) => path.join(local, name))
    .filter((file) => fs.existsSync(file));
  const credentials = credentialFiles.map((file) => fs.readFileSync(file));
  const nav = async (id) => {
    await page.locator(`[data-testid="settings-nav:${id}"]`).click();
    await page.locator(`[data-testid="settings-page:${id}"]`).waitFor();
  };
  const field = (id, key) =>
    page.locator(`fieldset[data-setting-item="${settingsItemId(id, key)}"]`);
  const count = (locator) => locator.locator('[data-mcp-lock]').count();
  const appletPage = 'applet:' + fixtureId;
  await nav(appletPage);
  assert.equal(await count(field(appletPage, 'setting:flag')), 0);
  assert.equal(await count(field(appletPage, 'setting:text')), 0);
  assert.equal(await count(field(appletPage, 'setting:monitor')), 0);
  assert.equal(
    await field(appletPage, 'setting:private').locator('[data-mcp-lock="private"]').count(),
    1,
  );
  assert.equal(
    await field(appletPage, 'setting:opaque').locator('[data-mcp-lock="unsupported"]').count(),
    1,
  );
  const locked = field(appletPage, 'setting:private');
  const before = await locked.getByRole('switch').isChecked();
  await locked.getByRole('switch').click();
  await until(
    async () => (await locked.getByRole('switch').isChecked()) !== before,
    'local edit remains available while MCP is locked',
  );
  await locked.getByRole('switch').click();
  await until(
    async () => (await locked.getByRole('switch').isChecked()) === before,
    'local private value restored',
  );
  checks.push(
    'MCP locks are generated for private and unsupported Applet definitions; ordinary and dynamic fields have no lock, and local editing remains available',
  );

  await field(appletPage, 'setting:records').getByRole('button', { name: /編集/ }).first().click();
  const dialog = page.getByRole('dialog');
  const id = dialog.locator('fieldset:has(input[aria-label="ID"])').last();
  if (await id.count()) assert.equal(await id.locator('[data-mcp-lock="readOnly"]').count(), 1);
  const name = dialog.locator('fieldset:has(input[aria-label="Record name"])').last();
  assert.equal(await name.count(), 1);
  assert.equal(await count(name), 0);
  await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
  checks.push(
    'Shared list dialog inherits actual MCP column metadata: native immutable IDs stay hidden or locked while editable columns remain unlocked',
  );

  const appearance = (
    await value('appdock_settings_list_targets', { ownerId: 'appdock' })
  ).items.find((item) => item.category === 'appearance');
  const hostValues = async () =>
    value('appdock_settings_get_values', { targetId: appearance.targetId });
  const original = await hostValues();
  const originalValues = Object.fromEntries(
    original.fields.filter((field) => field.hasValue).map((field) => [field.key, field.value]),
  );
  const editAppearance = async (changes) => {
    const schema = await value('appdock_settings_get_schema', { targetId: appearance.targetId });
    const current = await hostValues();
    return value('appdock_settings_apply', {
      targetId: appearance.targetId,
      expectedSchemaRevision: schema.schemaRevision,
      expectedRevision: current.revision,
      requestId: randomUUID(),
      operations: [{ kind: 'set', changes }],
    });
  };
  await editAppearance({ showHints: false, theme: 'dark' });
  await nav(appletPage);
  const lock = locked.getByRole('button', { name: /MCPから変更できない設定/ });
  await lock.focus();
  const tooltipId = await lock.getAttribute('aria-describedby');
  await until(
    async () => page.locator(`[id="${tooltipId}"]`).isVisible(),
    'lock explanation stays available with hints disabled',
  );
  assert.match(await page.locator(`[id="${tooltipId}"]`).innerText(), /外部操作に公開/);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 700, height: 850 });
  await page.screenshot({ path: path.join(profile, 'mcp-lock-dark-700.png') });
  await editAppearance({ theme: 'light' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: path.join(profile, 'mcp-lock-light-1280.png') });
  await editAppearance({ showHints: originalValues.showHints, theme: originalValues.theme });
  checks.push(
    'Lock explanations use the shared accessible popover independently of optional hints; dark/narrow and light/wide layouts retain native controls',
  );

  await nav('tts');
  assert.equal(await field('tts', 'apiKey').locator('[data-mcp-lock]').count(), 1);
  assert.equal(await field('tts', 'baseUrl').locator('[data-mcp-lock="readOnly"]').count(), 1);
  assert.equal(await count(field('tts', 'model')), 0);
  await nav('applets');
  const enabledRow = page.locator('[data-applet-id="fixture.common-active"]');
  assert.equal(await enabledRow.locator('[data-mcp-lock]').count(), 0);
  await nav('permissions');
  assert.equal(
    await page.locator('[data-testid^="permission-row-"] [data-mcp-lock="unsupported"]').count(),
    8,
  );
  const write = page.locator('[data-testid="permission-row-write"]').getByRole('switch').nth(1);
  await write.click();
  await until(async () => !(await write.isChecked()), 'MCP write revoked');
  await nav('applets');
  await until(
    async () => (await enabledRow.locator('[data-mcp-lock="permission"]').count()) === 1,
    'Applet enable switch follows MCP write permission',
  );
  await nav('appearance');
  await until(
    async () =>
      (await field('appearance', 'theme').locator('[data-mcp-lock="permission"]').count()) === 1,
    'permission change updates locks',
  );
  await nav('permissions');
  await write.click();
  await until(async () => await write.isChecked(), 'MCP write restored');
  await nav('appearance');
  await until(
    async () => (await count(field('appearance', 'theme'))) === 0,
    'allowed field becomes unlocked without restart',
  );
  credentialFiles.forEach((file, index) =>
    assert.deepEqual(fs.readFileSync(file), credentials[index]),
  );
  checks.push(
    'Native encrypted-key fields and protected endpoints are locked; toggling MCP settings permission updates icons immediately without changing credential bytes',
  );
};
