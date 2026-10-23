const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  shortcutPageChoices,
  validShortcutTarget,
  hostShortcutPage,
  shortcutTargetTitle,
} = require('../out/main/shared/shortcut-pages');
const {
  parseKeybindings,
  resolveKeybindings,
  keybindingConditionLabel,
} = require('../out/main/shared/keybindings');
const {
  defaultGestures,
  parseGestures,
  nativeGestureRows,
} = require('../out/main/shared/gestures');

const applets = [
  {
    id: 'test.wallpaper',
    displayName: 'Wallpaper',
    enabled: false,
    pages: [
      { id: 'history', title: '壁紙履歴' },
      { id: 'preview', title: 'プレビュー' },
    ],
  },
  { id: 'test.other', displayName: 'Other', pages: [{ id: 'preview', title: 'プレビュー' }] },
  { id: 'test.background', displayName: 'Background', pages: [] },
];
const row = (id, scope, appletIds = []) => ({
  id,
  command: 'test.run.' + id,
  key: 'Ctrl+F12',
  enabled: true,
  when: { scope, appletIds },
});

test('candidates include four host pages and each declared page, excluding background Applets', () => {
  const pages = shortcutPageChoices(applets);
  assert.deepEqual(
    pages.filter((p) => p.id.startsWith('host:')).map((p) => p.title),
    ['画像ライブラリー', '設定', 'ログ', '通知センター'],
  );
  assert.equal(pages.find((p) => p.id === 'page:test.wallpaper:history').title, '壁紙履歴');
  assert.equal(
    pages.find((p) => p.id === 'page:test.wallpaper:preview').title,
    'プレビュー（Wallpaper）',
  );
  assert.equal(pages.find((p) => p.id === 'page:test.other:preview').title, 'プレビュー（Other）');
  assert.equal(pages.length, 7);
  assert.equal(
    pages.some((p) => p.id.includes('background')),
    false,
  );
  assert.equal(
    keybindingConditionLabel({ scope: 'applets', appletIds: ['test.wallpaper'] }, undefined, pages),
    'Wallpaper（Applet内のすべてのページ）',
  );
});

test('targets preserve legacy assignments and reject unknown host pages and malformed page identities', () => {
  for (const id of [
    'test.wallpaper',
    'host:settings',
    'host:home',
    'page:test.wallpaper:history',
  ]) {
    const value = row('one', 'applets', [id]);
    assert.equal(validShortcutTarget(id), true);
    assert.deepEqual(parseKeybindings([value]), [value]);
    const gestures = defaultGestures();
    gestures.bindings = [{ ...value, gesture: 'move-up', when: { ...value.when, processes: [] } }];
    delete gestures.bindings[0].key;
    assert.deepEqual(parseGestures(gestures).bindings, gestures.bindings);
  }
  for (const id of [
    'host:theme',
    'host:missing',
    'page:test:__proto__',
    'page:test:main:extra',
    'page::main',
  ]) {
    assert.equal(validShortcutTarget(id), false);
    assert.throws(() => parseKeybindings([row('one', 'applets', [id])]));
  }
});

test('page conditions distinguish sibling pages, settings, actual focus and legacy whole-Applet targets', () => {
  const rows = [
    row('all', 'pages'),
    row('history', 'applets', ['page:test.wallpaper:history']),
    row('settings', 'applets', ['host:settings']),
    row('legacy', 'applets', ['test.wallpaper']),
    row('owner', 'owner'),
  ];
  const commands = rows.map((r) => ({ id: r.command, title: r.id, extensionId: 'test.wallpaper' }));
  const resolve = (context) =>
    resolveKeybindings(rows, 'Ctrl+F12', context, commands).map((id) => id.split('.').at(-1));
  assert.deepEqual(
    resolve({
      appFocused: true,
      pageId: 'page:test.wallpaper:history',
      appletId: 'test.wallpaper',
    }),
    ['all', 'history', 'legacy', 'owner'],
  );
  assert.deepEqual(
    resolve({
      appFocused: true,
      pageId: 'page:test.wallpaper:preview',
      appletId: 'test.wallpaper',
    }),
    ['all', 'legacy', 'owner'],
  );
  for (const pageId of ['host:image-library', 'host:logs', 'host:notifications'])
    assert.deepEqual(resolve({ appFocused: true, pageId }), ['all']);
  assert.deepEqual(resolve({ appFocused: true, pageId: 'host:settings' }), ['all', 'settings']);
  assert.deepEqual(resolve({ appFocused: false, pageId: 'host:settings' }), []);
  assert.deepEqual(resolve({ appFocused: true }), []);
  const gestures = {
    ...defaultGestures(),
    bindings: rows.map(({ key, ...r }) => ({
      ...r,
      gesture: 'move-up',
      when: { ...r.when, processes: [] },
    })),
  };
  assert.deepEqual(
    nativeGestureRows(
      gestures,
      { appFocused: true, pageId: 'host:settings', window: '123' },
      commands,
    ).map((r) => [r.id, r.window]),
    [
      ['all', '123'],
      ['settings', '123'],
    ],
  );
});

test('retired home references remain saved but have no active page or candidate', () => {
  assert.equal(hostShortcutPage('home'), undefined);
  assert.equal(
    shortcutPageChoices(applets).some((page) => page.id === 'host:home'),
    false,
  );
  assert.equal(shortcutTargetTitle('host:home', []), '廃止: ホーム');
  const saved = row('retired', 'applets', ['host:home']);
  for (const page of shortcutPageChoices(applets)) {
    assert.deepEqual(
      resolveKeybindings([saved], 'Ctrl+F12', { appFocused: true, pageId: page.id }, [
        { id: saved.command, title: 'Retired' },
      ]),
      [],
    );
  }
});
