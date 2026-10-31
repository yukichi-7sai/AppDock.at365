const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const files = ['mcp-picture-a.png', 'mcp-picture-b.png'];
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
exports.install = (profile) => {
  const file = require('./test-settings.cjs').file(profile, 'settings.json');
  const settings = JSON.parse(fs.readFileSync(file));
  settings.imageLibrary = {
    groups: [
      { id: 'mcp-one', name: 'MCP image one', images: [{ file: files[0] }] },
      { id: 'mcp-two', name: 'MCP image two', images: [{ file: files[0] }] },
    ],
  };
  fs.writeFileSync(file, JSON.stringify(settings));
};

exports.check = async ({ page, profile, local, client, checks, tool, value, until }) => {
  const toolsBefore = JSON.stringify((await client.listTools()).tools);
  const assets = path.join(profile, 'data/assets/images');
  const preserved = [
    ...files.map((file) => path.join(assets, file)),
    ...['ai-keys.json', 'tts-key.json', 'mcp-client.json']
      .map((file) => path.join(local, file))
      .filter((file) => fs.existsSync(file)),
  ].map((file) => ({ file, sha256: hash(file) }));
  const targets = () => value('appdock_settings_list_targets', { ownerId: 'appdock', limit: 100 });
  const groups = (await targets()).items.find((item) => item.category === 'image-library');
  assert(groups && groups.available);
  const members = async (id) => {
    const targetId = 'service.image-library.members.' + Buffer.from(id).toString('base64url');
    const result = (await targets()).items.find((item) => item.targetId === targetId);
    assert(result, 'Discovered membership owner');
    return result;
  };
  const read = (target) => value('appdock_settings_list_items', { targetId: target.targetId });
  const request = async (target, operations, extra = {}) => ({
    targetId: target.targetId,
    expectedRevision: (await read(target)).revision,
    expectedSchemaRevision: (
      await value('appdock_settings_get_schema', { targetId: target.targetId })
    ).schemaRevision,
    requestId: randomUUID(),
    operations,
    ...extra,
  });
  const groupRow = async (id) => (await read(groups)).items.find((row) => row.values.id === id);
  const settingsFile = require('./test-settings.cjs').file(profile, 'settings.json'),
    before = fs.readFileSync(settingsFile);
  const usage = JSON.stringify(JSON.parse(before).extensions['test.settings-images']);
  const draft = await request(
    groups,
    [
      {
        kind: 'update',
        itemRef: (await groupRow('mcp-one')).itemRef,
        changes: { name: 'MCP gallery group' },
      },
    ],
    { dryRun: true },
  );
  assert.equal((await value('appdock_settings_apply', draft)).completion, 'validated');
  assert.deepEqual(fs.readFileSync(settingsFile), before);
  const save = { ...draft, requestId: randomUUID(), dryRun: false };
  const reply = await value('appdock_settings_apply', save);
  assert.deepEqual(await value('appdock_settings_apply', save), reply);
  assert.equal(reply.revision, (await read(groups)).revision);
  assert.doesNotMatch(
    JSON.stringify([groups, await read(groups), await read(await members('mcp-one'))]),
    /thumbnail|generation|data:image|[A-Z]:\\/,
  );
  await page.evaluate(() => window.dock.executeCommand('appdock.image-library.open'));
  await page.locator('.library-page').waitFor();
  await page.getByRole('button', { name: 'MCP gallery groupの操作', exact: true }).click();
  await page
    .locator('.library-group-menu')
    .getByRole('menuitem', { name: '名前を変更', exact: true })
    .click();
  let dialog = page.getByRole('dialog', { name: '画像グループの名前を変更', exact: true });
  await dialog.waitFor();
  // A native draft must retain a concurrent MCP edit to a different group.
  await value(
    'appdock_settings_apply',
    await request(groups, [
      {
        kind: 'update',
        itemRef: (await groupRow('mcp-two')).itemRef,
        changes: { name: 'MCP second group' },
      },
    ]),
  );
  await dialog.getByLabel('画像グループ名').fill('Native gallery group');
  await dialog.getByRole('button', { name: '適用', exact: true }).click();
  await until(
    async () => (await groupRow('mcp-one')).values.name === 'Native gallery group',
    'native group rename reaches MCP',
  );
  assert.equal((await groupRow('mcp-two')).values.name, 'MCP second group');
  await page.getByRole('button', { name: 'グループを追加', exact: true }).click();
  dialog = page.getByRole('dialog', { name: '画像グループを追加', exact: true });
  await dialog.getByLabel('画像グループ名').fill('Native added group');
  await dialog.getByRole('button', { name: '追加', exact: true }).click();
  const nativeGroup = await until(
    async () => (await read(groups)).items.find((row) => row.values.name === 'Native added group'),
    'native group addition',
  );
  await value(
    'appdock_settings_apply',
    await request(groups, [{ kind: 'add', values: { name: 'MCP added group' } }]),
  );
  const addedGroup = (await read(groups)).items.find(
    (row) => row.values.name === 'MCP added group',
  );
  await page.getByRole('button', { name: 'MCP added groupの操作', exact: true }).waitFor();
  assert((await members(addedGroup.values.id)).available);
  checks.push(
    'Image groups share native/MCP dryRun/save/replay and add/rename ownership; a native dialog retains a concurrent edit to another group, and new membership owners are discovered without tool refresh',
  );

  const one = await members('mcp-one'),
    nativeMembers = await members(nativeGroup.values.id);
  const options = await value('appdock_settings_list_options', {
    targetId: one.targetId,
    key: 'file',
  });
  assert(files.every((file) => options.items.some((item) => item.value === file)));
  await value(
    'appdock_settings_apply',
    await request(one, [
      {
        kind: 'add',
        beforeItemRef: (await read(one)).items[0].itemRef,
        values: { file: files[1] },
      },
    ]),
  );
  await page
    .locator('.library-sidebar .library-group-row')
    .filter({ hasText: 'Native gallery group' })
    .locator('button')
    .first()
    .click();
  const card = page.locator('.library-page .ad-gallery-card').filter({ hasText: files[0] });
  await card.getByRole('button', { name: 'グループ', exact: true }).click();
  dialog = page.getByRole('dialog', { name: '所属グループを編集', exact: true });
  await dialog.getByLabel('Native added group', { exact: true }).check();
  await dialog.getByLabel('Native gallery group', { exact: true }).uncheck();
  await dialog.getByRole('button', { name: '適用', exact: true }).click();
  await until(
    async () => (await read(nativeMembers)).items.some((row) => row.values.file === files[0]),
    'native membership reaches MCP',
  );
  assert.deepEqual(
    (await read(one)).items.map((row) => row.values.file),
    [files[1]],
  );
  await value(
    'appdock_settings_apply',
    await request(one, [{ kind: 'add', values: { file: files[0] } }]),
  );
  await value(
    'appdock_settings_apply',
    await request(one, [
      { kind: 'reorder', itemRefs: (await read(one)).items.map((row) => row.itemRef).reverse() },
    ]),
  );
  assert.deepEqual(
    (await read(one)).items.map((row) => row.values.file),
    files,
  );
  await value(
    'appdock_settings_apply',
    await request(one, [{ kind: 'remove', itemRef: (await read(one)).items[0].itemRef }]),
  );
  assert.deepEqual(
    (await read(one)).items.map((row) => row.values.file),
    [files[1]],
  );
  assert.equal((await read(nativeMembers)).items[0].values.file, files[0]);
  await until(
    async () => (await page.locator('.library-page .ad-gallery-card').count()) === 1,
    'MCP membership removal reaches the gallery',
  );
  await page.screenshot({ path: path.join(profile, 'mcp-image-groups.png') });
  checks.push(
    'Cached filename options support membership add/remove/reorder; native membership dialogs agree with MCP and keep other groups, original images and existing usage references',
  );

  await value(
    'appdock_settings_apply',
    await request(groups, [
      { kind: 'reorder', itemRefs: (await read(groups)).items.map((row) => row.itemRef).reverse() },
    ]),
  );
  const names = (await read(groups)).items.map((row) => row.values.name + 'の操作');
  await until(
    async () =>
      JSON.stringify(
        await page
          .locator('.library-sidebar .library-group-row > button[aria-label]')
          .evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label'))),
      ) === JSON.stringify(names),
    'native group order follows MCP',
  );
  await value(
    'appdock_settings_apply',
    await request(groups, [{ kind: 'remove', itemRef: (await groupRow('mcp-one')).itemRef }]),
  );
  assert.equal(
    (await tool('appdock_settings_list_items', { targetId: one.targetId })).structuredContent.code,
    'NOT_FOUND',
  );
  await page.getByRole('button', { name: 'MCP added groupの操作', exact: true }).click();
  await page
    .locator('.library-group-menu')
    .getByRole('menuitem', { name: 'グループを削除', exact: true })
    .click();
  dialog = page.getByRole('dialog', { name: '画像グループを削除', exact: true });
  await dialog.getByRole('button', { name: '削除', exact: true }).click();
  await until(
    async () => !(await read(groups)).items.some((row) => row.values.id === addedGroup.values.id),
    'native group deletion reaches MCP',
  );
  preserved.forEach((item) => assert.equal(hash(item.file), item.sha256));
  checks.push(
    'MCP group reorder/deletion and native group deletion change classification only; removed membership targets disappear while original bytes and encrypted files remain unchanged',
  );

  const two = await members('mcp-two');
  const stale = await request(two, [{ kind: 'add', values: { file: files[1] } }]);
  fs.copyFileSync(path.join(assets, files[0]), path.join(assets, 'mcp-group-late.png'));
  await until(
    async () =>
      (
        await value('appdock_settings_list_options', { targetId: two.targetId, key: 'file' })
      ).items.some((item) => item.value === 'mcp-group-late.png'),
    'new cached image candidate',
  );
  assert.equal(
    (await tool('appdock_settings_apply', stale)).structuredContent.code,
    'SCHEMA_CONFLICT',
  );
  const old = await value('appdock_settings_list_items', { targetId: groups.targetId, limit: 1 });
  const oldRequest = await request(groups, [
    { kind: 'update', itemRef: old.items[0].itemRef, changes: { name: 'Stale group' } },
  ]);
  await value(
    'appdock_settings_apply',
    await request(groups, [
      { kind: 'update', itemRef: old.items[0].itemRef, changes: { name: 'Current group' } },
    ]),
  );
  assert.equal(
    (await tool('appdock_settings_apply', oldRequest)).structuredContent.code,
    'REVISION_CONFLICT',
  );
  assert.equal(
    (
      await tool('appdock_settings_list_items', {
        targetId: groups.targetId,
        limit: 1,
        cursor: old.nextCursor,
      })
    ).structuredContent.code,
    'REVISION_CONFLICT',
  );
  const unchanged = fs.readFileSync(settingsFile);
  for (const file of [
    '../private.png',
    'unknown.png',
    'https://example.test/image.png',
    files[0],
  ]) {
    assert.equal(
      (
        await tool(
          'appdock_settings_apply',
          await request(two, [{ kind: 'add', values: { file } }]),
        )
      ).structuredContent.code,
      'INVALID_ARGUMENT',
    );
    assert.deepEqual(fs.readFileSync(settingsFile), unchanged);
  }
  assert.equal(JSON.stringify((await client.listTools()).tools), toolsBefore);
  assert.equal(
    JSON.stringify(JSON.parse(fs.readFileSync(settingsFile)).extensions['test.settings-images']),
    usage,
  );
  preserved.forEach((item) => assert.equal(hash(item.file), item.sha256));
  checks.push(
    'Image candidate changes expire membership schemas; stale edits/cursors, paths/URLs, unknown files and duplicate memberships are refused atomically with fixed tools and unchanged original/credential bytes',
  );
};
