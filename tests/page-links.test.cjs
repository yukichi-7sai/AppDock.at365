const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseDescriptionText, pageLinkIds } = require('../out/main/shared/description-text');
const { commandTextPlain, commandTextIds } = require('../out/main/shared/command-text');
const { pageReferences } = require('../out/main/shared/page-links');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const { settingsCatalog, searchSettings } = require('../out/main/shared/settings-catalog');
const { NavigationCoordinator } = require('../out/main/main/core/ui-presentation');
const { SettingsPageHost } = require('../out/main/main/core/settings-page-host');

test('mixed links retain order and duplicates; escaped or malformed references stay literal', () => {
  const text =
    '[page:text-library] [setting:command-triggers] [command:appdock.text-palette.open] [page:text-library]';
  assert.deepEqual(
    parseDescriptionText(text).filter((t) => t.kind !== 'text'),
    [
      { kind: 'page', id: 'text-library' },
      { kind: 'setting', id: 'command-triggers' },
      { kind: 'command', id: 'appdock.text-palette.open' },
      { kind: 'page', id: 'text-library' },
    ],
  );
  assert.deepEqual([...commandTextIds([text])], ['appdock.text-palette.open']);
  assert.deepEqual([...pageLinkIds([text])], ['page:text-library', 'setting:command-triggers']);
  assert.equal(
    commandTextPlain('\\[page:text-library] \\[setting:general]'),
    '[page:text-library] [setting:general]',
  );
  for (const text of [
    '[page:]',
    '[setting: general]',
    '[page:constructor]',
    '[Page:logs]',
    '[page:logs',
    '[page:x[command:a]]',
    '[page:https://example.com]',
    '<b>plain</b>',
  ])
    assert.deepEqual(parseDescriptionText(text), [{ kind: 'text', text }], text);
});
test('names track catalogs, unavailable Applet pages never enable or start their provider', () => {
  const settings = createDefaultSettings();
  const applet = {
    id: 'fixture.page',
    displayName: '提供元',
    enabled: false,
    state: 'stopped',
    pages: [{ id: 'main', title: '本文', defaultDisplay: 'page' }],
  };
  const before = JSON.stringify({ settings, applet });
  let refs = pageReferences([applet], settings);
  assert.equal(refs.get('page:page:fixture.page:main').available, false);
  assert.equal(refs.get('setting:applet:fixture.page').available, true);
  assert.equal(refs.has('page:theme'), false);
  assert.equal(refs.has('page:missing'), false);
  assert.equal(
    commandTextPlain('[page:text-library] [setting:command-triggers]', new Map(), refs),
    '文字ライブラリー コマンドトリガー',
  );
  assert.equal(JSON.stringify({ settings, applet }), before);
  applet.enabled = true;
  applet.state = 'running';
  applet.pages[0].title = '[command:literal]';
  refs = pageReferences([applet], settings);
  assert.equal(refs.get('page:page:fixture.page:main').available, true);
  assert.equal(
    commandTextPlain('[page:page:fixture.page:main]', new Map(), refs),
    '[command:literal]',
  );
  settings.extensions[applet.id] = { pages: { main: { display: 'window' } } };
  assert.equal(
    pageReferences([applet], settings).get('page:page:fixture.page:main').available,
    false,
  );
});
test('settings search resolves page names without rewriting metadata or input values', () => {
  const settings = createDefaultSettings();
  const raw = '[page:text-library] [setting:command-triggers]';
  const applets = [
    {
      id: 'fixture.links',
      displayName: 'Links',
      enabled: false,
      state: 'stopped',
      settings: [{ key: 'text', title: '本文', type: 'string', default: raw, description: raw }],
    },
  ];
  const before = JSON.stringify({ applets, settings });
  const pages = settingsCatalog(applets, settings);
  assert(searchSettings(pages, '文字ライブラリー').some((item) => item.key === 'setting:text'));
  assert(searchSettings(pages, 'command-triggers').some((item) => item.key === 'setting:text'));
  const item = pages
    .find((page) => page.id === 'applet:fixture.links')
    .items.find((item) => item.key === 'setting:text');
  assert.equal(item.description, '文字ライブラリー コマンドトリガー');
  assert.equal(item.definition.description, raw);
  assert.equal(JSON.stringify({ applets, settings }), before);
  applets[0].settings[0].description = '\\[page:logs]';
  const escaped = settingsCatalog(applets, settings)
    .find((page) => page.id === 'applet:fixture.links')
    .items.find((item) => item.key === 'setting:text');
  assert.equal(escaped.description, '[page:logs]');
  assert.deepEqual([...pageLinkIds(escaped.referenceTexts)], []);
});
test('page navigation waits for inputs, revalidates availability and participates in history', async () => {
  let release,
    valid = true;
  let flush = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const opened = [];
  const nav = new NavigationCoordinator(
    () => {},
    () => flush(),
    undefined,
    undefined,
    {
      settingsPlace: () => ({ route: 'settings', pageId: 'about' }),
      valid: () => true,
      open: async (p) => {
        opened.push(p.route);
      },
    },
  );
  const pending = nav.openPage('text-library', () => valid);
  assert.equal(nav.state.route, 'settings');
  valid = false;
  release();
  await pending;
  assert.deepEqual(opened, []);
  assert.equal(nav.history.availability.back, false);
  valid = true;
  flush = async () => {};
  await nav.openPage('text-library', () => valid);
  assert.deepEqual(opened, ['text-library']);
  await nav.travel('back');
  assert.equal(nav.state.route, 'settings');
  await nav.travel('forward');
  assert.equal(nav.state.route, 'text-library');
  flush = async () => {
    throw Error('save failed');
  };
  await assert.rejects(
    nav.openPage('logs', () => true),
    /save failed/,
  );
  assert.equal(nav.state.route, 'text-library');
});
test('a successful link may close its source, while a stale connection is rejected', async () => {
  let host,
    moved = 0,
    disposed = false;
  const page = {
    snapshot: () => ({}),
    isCurrent: () => !disposed,
    dispose: () => {
      disposed = true;
    },
    navigate: async () => {
      moved++;
      host.close();
    },
  };
  host = new SettingsPageHost({
    allowed: () => true,
    create: () => page,
    flush: async () => {},
    changed() {},
  });
  const { connectionId } = await host.open({
    id: 'link',
    route: 'settings',
    kind: 'settings',
    context: 'full',
  });
  await host.navigate(connectionId, {});
  assert.equal(moved, 1);
  await assert.rejects(host.navigate(connectionId, {}));
  assert.equal(moved, 1);
});
