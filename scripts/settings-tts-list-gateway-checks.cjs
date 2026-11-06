const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');

module.exports = async ({ page, client, profile, local, checks, tool, value, until }) => {
  const tools = JSON.stringify((await client.listTools()).tools);
  const target = (await value('appdock_settings_list_targets', { limit: 100 })).items.find(
    (item) => item.targetId === 'service.tts.manual-voices',
  );
  assert(target);
  const targetId = target.targetId,
    items = (extra = {}) =>
      value('appdock_settings_list_items', { targetId, limit: 100, ...extra });
  const request = async (operations, dryRun = false) => {
    const before = await items();
    return {
      targetId,
      operations,
      dryRun,
      expectedRevision: before.revision,
      expectedSchemaRevision: before.schemaRevision,
      requestId: randomUUID(),
    };
  };
  const apply = async (operations, dryRun = false) =>
    value('appdock_settings_apply', await request(operations, dryRun));
  const sharedFile = require('./test-settings.cjs').file(profile, 'settings.json'),
    keyFile = path.join(local, 'tts-keys.json'),
    cipher = fs.readFileSync(keyFile),
    before = fs.readFileSync(sharedFile),
    ttsBefore = require('./test-settings.cjs').read(profile, local).tts.connections[0];
  const operation = { kind: 'add', values: { id: 'Voice-A😀' } };
  const preview = await apply([operation], true);
  assert.deepEqual(preview.changes[0].values, { id: 'Voice-A😀', name: 'Voice-A😀' });
  assert.equal(preview.completion, 'validated');
  assert.deepEqual(fs.readFileSync(sharedFile), before);
  const save = await request([operation]),
    saved = await value('appdock_settings_apply', save);
  assert.deepEqual(await value('appdock_settings_apply', save), saved);
  await page.evaluate(() => window.dock.navigate('settings'));
  await page.getByRole('button', { name: '音声生成AI', exact: true }).click();
  let manual;
  const refresh = async () => {
    const dialog = page.getByRole('dialog');
    if (await dialog.count())
      await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    const name = require('./test-settings.cjs').read(profile, local).tts.connections[0].name;
    await page.getByRole('button', { name: name + 'の設定', exact: true }).click();
    await dialog.getByRole('tab', { name: '詳細設定', exact: true }).click();
    await dialog.getByLabel('ボイス一覧の取得方式', { exact: true }).selectOption('manual');
    await dialog.getByRole('button', { name: 'JSONで編集', exact: true }).click();
    manual = dialog.locator('[data-testid="tts-manual-voices"]');
  };
  const saveManual = async () => {
    const dialog = page.getByRole('dialog');
    await dialog
      .getByLabel('ボイス一覧の取得方式', { exact: true })
      .selectOption(ttsBefore.voicesSource);
    await dialog.getByRole('button', { name: 'OK', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await refresh();
  };
  await refresh();
  await until(
    async () => JSON.parse(await manual.inputValue()).some((voice) => voice.id === 'Voice-A😀'),
    'TTS UI received list addition',
  );
  let rows = (await items()).items;
  const added = rows.find((row) => row.values.id === 'Voice-A😀');
  await apply([
    { kind: 'update', itemRef: added.itemRef, changes: { id: 'Voice-B😀', name: ' Same ' } },
  ]);
  await refresh();
  await until(
    async () =>
      JSON.parse(await manual.inputValue()).some(
        (voice) => voice.id === 'Voice-B😀' && voice.name === ' Same ',
      ),
    'TTS UI received explicit ID edit',
  );
  const fromUi = JSON.parse(await manual.inputValue()).map((voice) => ({
    ...voice,
    name: 'UI name',
  }));
  await manual.fill(JSON.stringify(fromUi));
  await manual.press('Tab');
  await saveManual();
  await until(
    async () => (await items()).items.every((row) => row.values.name === 'UI name'),
    'TTS JSON UI save reached MCP list',
  );
  assert.deepEqual(fs.readFileSync(keyFile), cipher);
  checks.push(
    'TTS manual list real MCP dryRun/add/replay and explicit voice-ID edits agree with existing JSON UI; key bytes remain identical',
  );

  rows = (await items()).items;
  const stale = await request([
    { kind: 'update', itemRef: rows[0].itemRef, changes: { name: 'Stale' } },
  ]);
  await apply([{ kind: 'reorder', itemRefs: rows.map((row) => row.itemRef).reverse() }]);
  await refresh();
  await until(
    async () => JSON.parse(await manual.inputValue())[0].id === rows.at(-1).values.id,
    'TTS UI received list order',
  );
  assert.equal(
    (await tool('appdock_settings_apply', stale)).structuredContent.code,
    'REVISION_CONFLICT',
  );
  rows = (await items()).items;
  assert.equal(
    (
      await tool(
        'appdock_settings_apply',
        await request([
          { kind: 'update', itemRef: rows[0].itemRef, changes: { id: rows[1].values.id } },
        ]),
      )
    ).structuredContent.code,
    'INVALID_ARGUMENT',
  );
  const defaultRow = rows.find((row) => row.values.id === ttsBefore.defaultVoice);
  assert(defaultRow);
  await apply([{ kind: 'remove', itemRef: defaultRow.itemRef }]);
  await refresh();
  await until(
    async () => JSON.parse(await manual.inputValue()).length === 1,
    'TTS UI received candidate removal',
  );
  let current = require('./test-settings.cjs').read(profile, local).tts.connections[0];
  assert.equal(current.defaultVoice, ttsBefore.defaultVoice);
  assert.equal(current.voicesSource, ttsBefore.voicesSource);
  assert.equal(current.baseUrl, ttsBefore.baseUrl);
  assert.equal(current.model, ttsBefore.model);
  assert.deepEqual(fs.readFileSync(keyFile), cipher);
  checks.push(
    'TTS manual list reorder/removal preserves default voice, endpoint, model and source mode; duplicate IDs and stale snapshots are refused',
  );

  const large = Array.from({ length: 1000 }, (_, index) => ({ id: 'v' + index, name: 'Same' }));
  await manual.fill(JSON.stringify(large));
  await manual.press('Tab');
  await saveManual();
  await until(
    async () =>
      require('./test-settings.cjs').read(profile, local).tts.connections[0].manualVoices
        ?.length === 1000,
    'TTS UI saved 1000 manual voices',
  );
  const schema = await value('appdock_settings_get_schema', { targetId });
  assert.equal(schema.maxItems, undefined);
  assert.equal(schema.operationSchemas.reorder.properties.itemRefs.maxItems, undefined);
  rows = [];
  let cursor, firstCursor;
  do {
    const result = await items(cursor ? { cursor } : {});
    rows.push(...result.items);
    cursor = result.nextCursor;
    firstCursor ??= cursor;
  } while (cursor);
  assert.equal(rows.length, 1000);
  const reorder = await request([
    { kind: 'reorder', itemRefs: rows.map((row) => row.itemRef).reverse() },
  ]);
  const wire = {
    jsonrpc: '2.0',
    method: 'tools/call',
    id: 999,
    params: { name: 'appdock_settings_apply', arguments: reorder },
  };
  assert(Buffer.byteLength(JSON.stringify(wire), 'utf8') < 65536);
  await value('appdock_settings_apply', reorder);
  await refresh();
  await until(
    async () => JSON.parse(await manual.inputValue())[0].id === 'v999',
    'TTS UI received all-row reorder',
  );
  assert.equal(
    (await tool('appdock_settings_list_items', { targetId, limit: 100, cursor: firstCursor }))
      .structuredContent.code,
    'REVISION_CONFLICT',
  );
  assert.equal((await apply([{ kind: 'add', values: { id: 'v1000' } }])).changed, true);
  assert.equal(
    require('./test-settings.cjs').read(profile, local).tts.connections[0].manualVoices.length,
    1001,
  );
  await refresh();
  await manual.fill('[]');
  await manual.press('Tab');
  await saveManual();
  await until(async () => (await items()).items.length === 0, 'TTS JSON UI cleared candidates');
  await apply([{ kind: 'add', values: { id: 'last' } }]);
  await apply([{ kind: 'remove', itemRef: (await items()).items[0].itemRef }]);
  current = require('./test-settings.cjs').read(profile, local).tts.connections[0];
  assert.deepEqual(current.manualVoices, []);
  assert.equal(current.defaultVoice, ttsBefore.defaultVoice);
  assert.equal(current.voicesSource, ttsBefore.voicesSource);
  assert.deepEqual(fs.readFileSync(keyFile), cipher);
  assert.equal(JSON.stringify((await client.listTools()).tools), tools);
  await page.getByRole('dialog').getByRole('button', { name: 'キャンセル', exact: true }).click();
  checks.push(
    'TTS manual list pagination and real MCP full reorder fit the fixed transport; adding beyond the former 1000-row limit, empty-list persistence and tool definitions stay consistent',
  );
};
