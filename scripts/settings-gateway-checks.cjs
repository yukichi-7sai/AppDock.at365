const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

module.exports = async ({ client, page, fixtureId, checks, tool, value }) => {
  const allTools = (await client.listTools()).tools;
  const names = [
    'list_targets',
    'get_schema',
    'get_values',
    'list_items',
    'list_options',
    'apply',
  ].map((name) => 'appdock_settings_' + name);
  assert(names.every((name) => allTools.some((tool) => tool.name === name)));
  for (const name of names)
    assert.equal(
      allTools.find((tool) => tool.name === name).annotations.readOnlyHint,
      name !== 'appdock_settings_apply',
    );
  const targets = await value('appdock_settings_list_targets');
  const appearance = targets.items.find(
    (target) => target.ownerId === 'appdock' && target.category === 'appearance',
  );
  const applet = targets.items.find((target) => target.ownerId === fixtureId);
  assert(appearance && applet);
  const schema = await value('appdock_settings_get_schema', { targetId: appearance.targetId });
  const before = await value('appdock_settings_get_values', {
    targetId: appearance.targetId,
    keys: ['theme'],
  });
  const options = await value('appdock_settings_list_options', {
    targetId: appearance.targetId,
    key: 'theme',
    limit: 1,
  });
  assert(options.nextCursor);
  const rest = await value('appdock_settings_list_options', {
    targetId: appearance.targetId,
    key: 'theme',
    cursor: options.nextCursor,
  });
  assert.deepEqual(
    [...options.items, ...rest.items].map((option) => option.value),
    ['dark', 'light', 'system'],
  );
  const request = {
    targetId: appearance.targetId,
    expectedRevision: before.revision,
    expectedSchemaRevision: schema.schemaRevision,
    requestId: randomUUID(),
    dryRun: true,
    operations: [{ kind: 'set', changes: { theme: 'dark' } }],
  };
  const preview = await value('appdock_settings_apply', request);
  assert.equal(preview.completion, 'validated');
  assert.equal(preview.effectVerified, false);
  assert.equal(
    (await value('appdock_settings_get_values', { targetId: appearance.targetId, keys: ['theme'] }))
      .revision,
    before.revision,
  );
  const saveRequest = { ...request, dryRun: false, requestId: randomUUID() };
  const saved = await value('appdock_settings_apply', saveRequest);
  assert.equal(saved.completion, 'settingsSaved');
  assert.deepEqual(await value('appdock_settings_apply', saveRequest), saved);
  assert.equal((await value('appdock_get_settings')).values.theme, 'dark');
  assert.equal(
    (await page.evaluate(() => window.dock.snapshot())).settings.value.host.theme,
    'dark',
  );
  const changed = await value('appdock_settings_get_values', {
    targetId: appearance.targetId,
    keys: ['theme'],
  });
  assert.equal(changed.fields[0].inherited, false);
  const replayRequest = {
    targetId: appearance.targetId,
    expectedRevision: changed.revision,
    expectedSchemaRevision: schema.schemaRevision,
    requestId: randomUUID(),
    operations: [{ kind: 'reset', keys: ['theme'] }],
  };
  const reset = await value('appdock_settings_apply', replayRequest);
  assert.equal(reset.changes[0].inherited, true);
  assert.equal((await value('appdock_get_settings')).values.theme, 'light');
  assert.equal(
    (await value('appdock_settings_get_values', { targetId: appearance.targetId, keys: ['theme'] }))
      .fields[0].inherited,
    true,
  );
  checks.push(
    'fixed 6 settings entries: discover/schema/options, dryRun/save, stable replay, old API and host snapshot agree, reset restores inheritance',
  );
  const appletSchema = await value('appdock_settings_get_schema', { targetId: applet.targetId });
  assert.deepEqual(
    appletSchema.items.map((field) => field.key),
    ['flag', 'text', 'monitor'],
  );
  assert.equal(
    (await tool('appdock_settings_get_values', { targetId: applet.targetId, keys: ['secret'] }))
      .structuredContent.code,
    'NOT_FOUND',
  );
  assert.equal(
    (await tool('appdock_settings_list_items', { targetId: applet.targetId })).structuredContent
      .code,
    'INVALID_ARGUMENT',
  );
  const appletBefore = await value('appdock_settings_get_values', { targetId: applet.targetId });
  await value('appdock_settings_apply', {
    targetId: applet.targetId,
    expectedSchemaRevision: appletSchema.schemaRevision,
    expectedRevision: appletBefore.revision,
    requestId: randomUUID(),
    operations: [{ kind: 'set', changes: { flag: true, text: 'gateway fixture' } }],
  });
  assert.deepEqual((await value('appdock_get_settings', { appletId: fixtureId })).values, {
    flag: true,
    text: 'gateway fixture',
  });
  const appletAfter = await value('appdock_settings_get_values', { targetId: applet.targetId });
  await value('appdock_settings_apply', {
    targetId: applet.targetId,
    expectedSchemaRevision: appletSchema.schemaRevision,
    expectedRevision: appletAfter.revision,
    requestId: randomUUID(),
    operations: [{ kind: 'reset', keys: ['flag', 'text'] }],
  });
  assert.deepEqual((await value('appdock_get_settings', { appletId: fixtureId })).values, {
    flag: false,
    text: '',
  });
  assert.equal(JSON.stringify((await client.listTools()).tools), JSON.stringify(allTools));
  checks.push(
    'fixed settings entries reuse Applet validation/save and preserve private fields and tool definitions',
  );
  await require('./settings-list-gateway-checks.cjs')({
    client,
    page,
    fixtureId,
    checks,
    tool,
    value,
  });
  return replayRequest;
};
