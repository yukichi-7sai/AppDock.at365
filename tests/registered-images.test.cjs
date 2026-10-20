const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'),
  path = require('node:path');
const { RegisteredImages } = require('../out/main/main/core/registered-images');
const {
  parseImageLibrary,
  editImageLibrary,
  imageReference,
} = require('../out/main/shared/registered-images');
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema');
const {
  parseSettingDefinitions,
  validateSettingValue,
} = require('../out/main/shared/setting-definitions');
const { parseRibbonItems } = require('../out/main/shared/ribbon-items');
const { ribbonItems, defaultRibbon, parseRibbon } = require('../out/main/shared/applet-pages');
const { editRibbon, ribbonPlacement } = require('../out/main/shared/ribbon-layout');
const { UiPresentation, NavigationCoordinator } = require('../out/main/main/core/ui-presentation');
const bytes = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  Buffer.from('original-fixture'),
]);
const decoded = () => ({
  width: 320,
  height: 180,
  thumbnail: 'data:image/png;base64,AA==',
  circle: 'data:image/png;base64,AQ==',
});
const runRoot = path.join(__dirname, '../.artifacts', `registered-images-unit-${Date.now()}`);
let serial = 0;
async function fixture(decoder = decoded) {
  const directory = path.join(runRoot, String(++serial));
  await fs.mkdir(directory, { recursive: true });
  return new RegisteredImages(path.join(directory, 'images'), decoder);
}
const ref = { file: 'flower.png' };
const groups = {
  groups: [
    { id: 'icons', name: 'アイコン', images: [ref] },
    { id: 'backgrounds', name: '背景', images: [ref] },
  ],
};

test('image references reject paths, URLs, reserved names and extra fields', () => {
  assert(imageReference(ref));
  for (const value of [
    { file: '../a.png' },
    { file: 'C:\\a.png' },
    { file: 'CON.png' },
    { file: 'https://a/x.png' },
    { file: 'a.svg' },
    { file: 'a.png', group: 'x' },
    'a.png',
    null,
  ])
    assert.equal(imageReference(value), false);
});
test('multiple memberships keep original identity and survive group rename and deletion', () => {
  let value = parseImageLibrary(groups);
  value = editImageLibrary(value, {
    kind: 'update',
    before: groups.groups[0],
    group: { ...groups.groups[0], name: 'ボタン' },
  });
  assert.deepEqual(value.groups[0].images, [ref]);
  value = editImageLibrary(value, { kind: 'delete', id: 'icons', before: value.groups[0] });
  assert.deepEqual(value.groups[0].images, [ref]);
  assert.deepEqual(groups.groups[0].name, 'アイコン');
});
test('membership edits merge unrelated image changes and reject same-image conflicts atomically', () => {
  const current = structuredClone(groups);
  current.groups[0].images.push({ file: 'other.png' });
  const changed = editImageLibrary(current, {
    kind: 'membership',
    image: ref,
    ids: ['backgrounds'],
    before: ['icons', 'backgrounds'],
  });
  assert.deepEqual(changed.groups[0].images, [{ file: 'other.png' }]);
  assert.throws(
    () =>
      editImageLibrary(changed, {
        kind: 'membership',
        image: ref,
        ids: [],
        before: ['icons', 'backgrounds'],
      }),
    /変更/,
  );
  assert.deepEqual(current.groups[0].images, [ref, { file: 'other.png' }]);
});
test('groups reject duplicate IDs, case-insensitive names, duplicate members and stale order', () => {
  assert.throws(() => parseImageLibrary({ groups: [groups.groups[0], groups.groups[0]] }));
  assert.throws(() =>
    parseImageLibrary({
      groups: [
        { id: 'a', name: 'Photos', images: [] },
        { id: 'b', name: 'photos', images: [] },
      ],
    }),
  );
  assert.throws(() =>
    parseImageLibrary({ groups: [{ id: 'a', name: 'A', images: [ref, { file: 'FLOWER.PNG' }] }] }),
  );
  assert.throws(() =>
    editImageLibrary(groups, { kind: 'order', ids: ['backgrounds', 'icons'], before: ['icons'] }),
  );
  const result = editImageLibrary(groups, {
    kind: 'order',
    ids: ['backgrounds', 'icons'],
    before: ['icons', 'backgrounds'],
  });
  assert.deepEqual(
    result.groups.map((g) => g.id),
    ['backgrounds', 'icons'],
  );
});
test('registration preserves original bytes; duplicate content reuses names without overwrite', async () => {
  const images = await fixture();
  assert.deepEqual(await images.add(bytes, 'flower.png'), ref);
  assert.deepEqual(await images.add(bytes, 'FLOWER.PNG'), ref);
  await assert.rejects(
    images.add(Buffer.concat([bytes, Buffer.from('changed')]), 'flower.png'),
    /同名/,
  );
  assert.deepEqual((await images.read(ref)).bytes, bytes);
  assert.equal(images.list()[0].width, 320);
  assert.equal(images.icon(ref), 'data:image/png;base64,AA==');
  assert.equal(images.icon(ref, 'circle'), 'data:image/png;base64,AQ==');
});
test('simultaneous registrations publish one complete original and remove temporary files', async () => {
  const images = await fixture();
  const results = await Promise.all([images.add(bytes, 'a.png'), images.add(bytes, 'A.PNG')]);
  assert.deepEqual(results, [{ file: 'a.png' }, { file: 'a.png' }]);
  assert.deepEqual(await fs.readdir(images.directory), ['a.png']);
});

test('asynchronous decode failures leave registered originals intact and publish no new file', async () => {
  let fail = false;
  const images = await fixture(async () => {
    if (fail) throw Error('decode failed');
    return decoded();
  });
  await images.add(bytes, 'existing.png');
  fail = true;
  await assert.rejects(images.add(bytes, 'rejected.png'), /decode failed/);
  assert.deepEqual(await fs.readdir(images.directory), ['existing.png']);
  fail = false;
  assert.deepEqual((await images.read({ file: 'existing.png' })).bytes, bytes);
});
test('size, dimensions, extension mismatch, invalid bytes and RPC import limits are enforced', async () => {
  const images = await fixture();
  await assert.rejects(images.add(bytes, 'a.jpg'), /形式/);
  await assert.rejects(images.add(Buffer.alloc(5 * 1024 * 1024 + 1), 'a.png'), /5MiB/);
  await assert.rejects(images.add(Buffer.from('invalid'), 'a.png'), /PNG/);
  const huge = await fixture(() => ({ ...decoded(), width: 8193 }));
  await assert.rejects(huge.add(bytes, 'a.png'), /サイズ/);
  assert.throws(
    () => images.import({ base64: Buffer.alloc(512 * 1024 + 1).toString('base64') }),
    /512KiB/,
  );
  const imported = await images.import({ base64: bytes.toString('base64') });
  assert.match(imported.file, /^web-[a-f0-9]{64}\.png$/);
});
test('missing or incomplete images preserve references and recover without settings changes', async () => {
  const images = await fixture();
  await images.add(bytes, ref.file);
  await fs.unlink(path.join(images.directory, ref.file));
  await images.refresh();
  assert.equal(images.list()[0].available, false);
  assert.equal(images.icon(ref), decoded().thumbnail);
  await fs.writeFile(path.join(images.directory, ref.file), Buffer.from('partial'));
  await images.refresh();
  assert.equal(images.list()[0].available, false);
  await fs.writeFile(path.join(images.directory, ref.file), bytes);
  await images.refresh();
  assert.equal(images.list()[0].available, true);
});
test('transferred image roots are rejected without writing originals into the target', async () => {
  const directory = path.join(runRoot, String(++serial)),
    target = path.join(directory, 'target'),
    link = path.join(directory, 'images');
  await fs.mkdir(target, { recursive: true });
  await fs.symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  const images = new RegisteredImages(link, decoded);
  await assert.rejects(images.add(bytes, 'a.png'), /転送/);
  assert.deepEqual(await fs.readdir(target), []);
});
test('new defaults omit host profile; opaque old data and library groups survive save parsing', () => {
  const settings = createDefaultSettings();
  assert.equal('profile' in settings, false);
  const legacy = {
    name: '  Legacy unchanged  ',
    avatar: '../unused-legacy-reference.png',
    extra: { retained: true },
  };
  settings.profile = legacy;
  settings.imageLibrary = groups;
  const parsed = parseSettings(settings);
  assert.deepEqual(parsed.profile, legacy);
  assert.deepEqual(parsed.imageLibrary, groups);
});
test('registered image fields and string constraints validate normal and object-list settings', () => {
  const definitions = parseSettingDefinitions([
    { key: 'avatar', title: '画像', type: 'registered-image', default: null },
    { key: 'name', title: '名前', type: 'string', minLength: 1, maxLength: 80 },
    {
      key: 'rows',
      title: 'Rows',
      type: 'object-list',
      fields: [{ key: 'image', title: 'Image', type: 'registered-image' }],
      list: { columns: ['image'], titleKey: 'image', imageKey: 'image' },
    },
  ]);
  validateSettingValue(definitions[0], ref);
  assert.throws(() => validateSettingValue(definitions[0], { file: '../a.png' }));
  assert.throws(() => validateSettingValue(definitions[1], ' '));
  assert.throws(() => validateSettingValue(definitions[1], 'x'.repeat(81)));
  validateSettingValue(definitions[2], [{ image: ref }]);
  assert.throws(() => validateSettingValue(definitions[2], [{ image: { file: 'http://a' } }]));
});
function applet() {
  return {
    id: 'test.profile',
    displayName: 'Profile',
    enabled: true,
    state: 'error',
    settings: [{ key: 'avatar', type: 'registered-image', default: null }],
    commands: [],
    ribbonItems: [
      {
        id: 'main',
        title: 'プロフィール',
        action: 'settings',
        imageSetting: 'avatar',
        imageShape: 'circle',
        icon: 'user',
        iconOnly: true,
        defaultPlacement: 'bottom',
      },
    ],
  };
}
test('declarative ribbon items validate self references and allow explicit top placement to override defaults', () => {
  const a = applet();
  a.capabilities = ['settings', 'ribbon-items'];
  assert.equal(parseRibbonItems(a)[0].imageSetting, 'avatar');
  assert.throws(() =>
    parseRibbonItems({ ...a, ribbonItems: [{ ...a.ribbonItems[0], imageSetting: 'other' }] }),
  );
  const items = ribbonItems([a]),
    id = 'applet:test.profile:main';
  assert.equal(ribbonPlacement(defaultRibbon(), id, items), 'bottom');
  const changed = editRibbon(defaultRibbon(), items, {
    kind: 'update',
    id,
    changes: { placement: 'top' },
  });
  assert.equal(ribbonPlacement(parseRibbon(changed), id, items), 'top');
});
test('profile-style contributions use common image assets and open own settings even when runtime failed', async () => {
  const settings = createDefaultSettings();
  settings.extensions['test.profile'] = {
    enabled: true,
    settings: { name: 'DO NOT DISPLAY', avatar: ref },
  };
  const a = applet(),
    nav = new NavigationCoordinator(() => {});
  const ui = new UiPresentation({
    settings: () => settings,
    applets: () => [a],
    dark: () => false,
    navigation: nav,
    execute: async () => {
      throw Error('must not execute');
    },
    theme: async () => {},
    image: (image, shape) =>
      image?.file === ref.file
        ? shape === 'circle'
          ? decoded().circle
          : decoded().thumbnail
        : undefined,
  });
  const view = ui.get(),
    button = view.items.find((i) => i.id === 'applet:test.profile:main');
  assert.equal(button.tooltip, 'プロフィール');
  assert.equal(button.iconOnly, true);
  assert.equal(button.enabled, true);
  assert.equal(JSON.stringify(view).includes('DO NOT DISPLAY'), false);
  assert.equal(JSON.stringify(view).includes(ref.file), false);
  assert.equal(ui.getAsset(button.icon.assetId).dataUrl, decoded().circle);
  await ui.invoke({ epoch: view.epoch, requestId: 'open', actionId: button.actionId }, 'fixture');
  assert.equal(nav.state.appletId, 'test.profile');
  assert.equal(nav.state.appletDetail, 'settings');
});
