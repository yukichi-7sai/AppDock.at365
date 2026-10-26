const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { deflateSync } = require('node:zlib');
const { settingsItemId } = require('../out/main/shared/settings-catalog');
const ownerId = 'test.settings-images';
const filenames = ['mcp-picture-a.png', 'mcp-picture-b.png'];
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function png(color) {
  const chunk = (type, bytes) => {
    const data = Buffer.concat([Buffer.from(type), bytes]);
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const length = Buffer.alloc(4),
      checksum = Buffer.alloc(4);
    length.writeUInt32BE(bytes.length);
    checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, data, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.from([0, color, 100, 200, 255]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
exports.install = (profile) => {
  const images = path.join(profile, 'data/assets/images');
  fs.mkdirSync(images, { recursive: true });
  filenames.forEach((file, index) =>
    fs.writeFileSync(path.join(images, file), png(40 + index * 80)),
  );
  const directory = path.join(profile, 'extensions', 'images');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, 'extension.json'),
    JSON.stringify({
      apiVersion: 1,
      minimumHostVersion: '0.96.3',
      id: ownerId,
      name: 'Image settings fixture',
      version: '1.0.0',
      runtime: 'node',
      entry: 'index.cjs',
      capabilities: ['settings'],
      settings: [
        {
          key: 'picture',
          title: 'Picture',
          type: 'registered-image',
          default: { file: filenames[0] },
        },
        {
          key: 'privatePicture',
          title: 'Private picture',
          type: 'registered-image',
          automation: false,
          default: { file: 'PRIVATE_IMAGE.png' },
        },
        {
          key: 'rows',
          title: 'Picture records',
          type: 'object-list',
          default: [
            { id: 'image-one', name: 'Picture row', media: { picture: { file: filenames[0] } } },
          ],
          list: { idKey: 'id', titleKey: 'name', columns: ['name'], imageKey: 'image' },
          fields: [
            { key: 'id', title: 'ID', type: 'string' },
            { key: 'name', title: 'Record name', type: 'string', default: 'New picture' },
            {
              key: 'image',
              title: 'Row picture',
              type: 'registered-image',
              default: { file: filenames[0] },
              propertyPath: ['media', 'picture'],
            },
          ],
        },
      ],
    }),
  );
  fs.writeFileSync(path.join(directory, 'index.cjs'), 'exports.activate = async () => {};');
};

exports.check = async ({ page, profile, local, client, checks, tool, value, until }) => {
  const toolsBefore = JSON.stringify((await client.listTools()).tools);
  const assets = path.join(profile, 'data/assets/images');
  const assetHashes = filenames.map((file) => hash(path.join(assets, file)));
  const credentials = ['ai-keys.json', 'tts-key.json', 'mcp-client.json']
    .map((name) => path.join(local, name))
    .filter((file) => fs.existsSync(file))
    .map((file) => ({ file, sha256: hash(file) }));
  const targets = await until(async () => {
    const result = (await value('appdock_settings_list_targets', { ownerId })).items.filter(
      (item) => item.category === 'settings',
    );
    return result.length === 2 && result.every((item) => item.available) && result;
  }, 'image settings owners ready');
  const fields = targets.find((item) => item.kind === 'fields'),
    list = targets.find((item) => item.kind === 'list');
  const schema = (target) => value('appdock_settings_get_schema', { targetId: target.targetId });
  const read = (target) =>
    value(target.kind === 'list' ? 'appdock_settings_list_items' : 'appdock_settings_get_values', {
      targetId: target.targetId,
    });
  const request = async (target, operations, extra = {}) => {
    const current = await read(target),
      definition = await schema(target);
    return {
      targetId: target.targetId,
      expectedSchemaRevision: definition.schemaRevision,
      expectedRevision: current.revision,
      requestId: randomUUID(),
      operations,
      ...extra,
    };
  };
  const options = () =>
    value('appdock_settings_list_options', { targetId: fields.targetId, key: 'picture' });
  await until(async () => (await options()).items.length === 2, 'cached images available');
  const definition = await schema(fields);
  assert.deepEqual(
    definition.items.map((item) => item.key),
    ['picture'],
  );
  assert.doesNotMatch(
    JSON.stringify([definition, await options(), await read(fields)]),
    /PRIVATE_IMAGE|privatePicture|thumbnail|data:image/,
  );
  const before = fs.readFileSync(path.join(profile, 'settings.json'));
  const draft = await request(
    fields,
    [{ kind: 'set', changes: { picture: { file: filenames[1] } } }],
    { dryRun: true },
  );
  assert.equal((await value('appdock_settings_apply', draft)).completion, 'validated');
  assert.deepEqual(fs.readFileSync(path.join(profile, 'settings.json')), before);
  const save = { ...draft, requestId: randomUUID(), dryRun: false };
  const result = await value('appdock_settings_apply', save);
  assert.equal(result.completion, 'settingsSaved');
  assert.deepEqual(await value('appdock_settings_apply', save), result);
  const pageId = 'applet:' + ownerId;
  await page.locator(`[data-testid="settings-nav:${pageId}"]`).click();
  await page.locator(`[data-testid="settings-page:${pageId}"]`).waitFor();
  const field = (key) =>
    page.locator(`fieldset[data-setting-item="${settingsItemId(pageId, 'setting:' + key)}"]`);
  assert.equal(await field('picture').locator('[data-mcp-lock]').count(), 0);
  assert.equal(await field('privatePicture').locator('[data-mcp-lock="private"]').count(), 1);
  await field('picture').locator('.registered-image-input img').waitFor();
  await page.screenshot({ path: path.join(profile, 'mcp-image-selection.png') });
  await field('picture').locator('.registered-image-action').click();
  await until(
    async () => (await read(fields)).fields.find((item) => item.key === 'picture').value === null,
    'native image clear reaches MCP',
  );
  await field('picture').locator('.registered-image-empty').waitFor();
  await field('picture').locator('.registered-image-input-preview').click();
  const picker = page.getByRole('dialog', { name: '画像を選択', exact: true });
  await picker
    .locator('.ad-gallery-card')
    .filter({ hasText: filenames[0] })
    .locator('.ad-gallery-image')
    .click();
  await picker.getByRole('button', { name: '画像を使う', exact: true }).click();
  await until(
    async () =>
      (await read(fields)).fields.find((item) => item.key === 'picture').value?.file ===
      filenames[0],
    'native image choice reaches MCP',
  );
  await value(
    'appdock_settings_apply',
    await request(fields, [{ kind: 'reset', keys: ['picture'] }]),
  );
  assert.equal((await read(fields)).fields.find((item) => item.key === 'picture').inherited, true);
  checks.push(
    'Registered image fields use cached MCP candidates, dryRun/save/replay/reset and existing native selection/clear; private fields stay locked and original image bytes are retained',
  );

  let row = (await read(list)).items[0];
  assert.equal(row.removable, false);
  assert.equal(
    (
      await tool(
        'appdock_settings_apply',
        await request(list, [{ kind: 'remove', itemRef: row.itemRef }]),
      )
    ).structuredContent.code,
    'LOCAL_ACTION_REQUIRED',
  );
  await value(
    'appdock_settings_apply',
    await request(list, [
      { kind: 'update', itemRef: row.itemRef, changes: { image: { file: filenames[1] } } },
    ]),
  );
  await field('rows').getByRole('button', { name: /編集/ }).first().click();
  const dialog = page
    .getByRole('dialog')
    .filter({ has: page.locator('.registered-image-input[aria-label="Row picture"]') });
  const image = dialog.locator('.registered-image-input[aria-label="Row picture"]');
  await image.locator('img').waitFor();
  await page.screenshot({ path: path.join(profile, 'mcp-image-list-dialog.png') });
  assert.equal(
    await dialog
      .locator('fieldset')
      .filter({ has: image })
      .last()
      .locator('[data-mcp-lock]')
      .count(),
    0,
  );
  await image.locator('.registered-image-action').click();
  await dialog.getByRole('button', { name: 'OK', exact: true }).click();
  await until(
    async () => (await read(list)).items[0].values.image === null,
    'native list image clear reaches MCP',
  );
  row = (await read(list)).items[0];
  assert.equal(row.removable, true);
  await value(
    'appdock_settings_apply',
    await request(list, [{ kind: 'remove', itemRef: row.itemRef }]),
  );
  assert.equal((await read(list)).items.length, 0);
  checks.push(
    'Declared image list columns share real MCP options and the native row editor; image-bearing rows cannot be implicitly removed, explicit clear permits removal without deleting images',
  );

  const stale = await request(fields, [
    { kind: 'set', changes: { picture: { file: filenames[0] } } },
  ]);
  fs.writeFileSync(path.join(assets, 'mcp-picture-late.png'), png(230));
  await until(async () => (await options()).items.length === 3, 'new cached image candidate');
  assert.equal(
    (await tool('appdock_settings_apply', stale)).structuredContent.code,
    'SCHEMA_CONFLICT',
  );
  for (const picture of [
    { file: '../private.png' },
    { file: 'unknown.png' },
    { file: filenames[0], extra: true },
  ])
    assert.equal(
      (
        await tool(
          'appdock_settings_apply',
          await request(fields, [{ kind: 'set', changes: { picture } }], { dryRun: true }),
        )
      ).structuredContent.code,
      'INVALID_ARGUMENT',
    );
  assert.equal(JSON.stringify((await client.listTools()).tools), toolsBefore);
  filenames.forEach((file, index) =>
    assert.equal(hash(path.join(assets, file)), assetHashes[index]),
  );
  credentials.forEach(({ file, sha256 }) => assert.equal(hash(file), sha256));
  await page.screenshot({ path: path.join(profile, 'mcp-registered-images.png') });
  checks.push(
    'Image additions invalidate stale schemas through fixed MCP tools; paths/unknown images/extra properties are rejected and credentials and original assets remain unchanged',
  );
};
