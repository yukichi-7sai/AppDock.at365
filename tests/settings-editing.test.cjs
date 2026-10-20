const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema');
const { SettingsInputSession } = require('../out/main/main/core/settings-input-session');
const {
  settingsCatalog,
  settingsProjection,
  applySettingsJson,
  searchSettings,
  settingsItemId,
} = require('../out/main/shared/settings-catalog');
const applets = [
  {
    id: 'test.a.b',
    displayName: 'Fixture',
    runtime: 'node',
    settings: [
      { key: 'x.y', title: 'Interval', description: 'Polling seconds', type: 'number', minimum: 0 },
    ],
    pages: [{ id: 'main', title: 'Main' }],
    settingActions: [],
  },
];
function fixture() {
  let saved = { value: createDefaultSettings(), revision: 1, path: 'test' };
  let fail = false,
    saves = 0;
  const session = new SettingsInputSession({
    current: () => saved,
    applets: () => applets,
    save: async (value, revision) => {
      if (fail) throw Error('disk failure');
      if (revision !== saved.revision) throw Error('revision conflict');
      saves++;
      return (saved = { ...saved, value, revision: revision + 1 });
    },
    changed: () => {},
  });
  const act = (action, operationId = crypto.randomUUID()) => {
    const s = session.snapshot();
    return session.act({
      sessionId: s.sessionId,
      editRevision: s.editRevision,
      operationId,
      action,
    });
  };
  return {
    session,
    act,
    get saved() {
      return saved;
    },
    get saves() {
      return saves;
    },
    set fail(v) {
      fail = v;
    },
    external() {
      saved = {
        ...saved,
        revision: saved.revision + 1,
        value: { ...saved.value, profile: { ...saved.value.profile, name: 'External' } },
      };
    },
  };
}
test('general sound toggle is searchable and editable through partial JSON without losing other pages', () => {
  const settings = createDefaultSettings();
  const pages = settingsCatalog(applets, settings);
  const page = pages.find((p) => p.id === 'general');
  assert.equal(page.items[0].key, 'soundEnabled');
  const projection = settingsProjection(settings, page, applets);
  assert.equal(projection.host.soundEnabled, true);
  projection.host.soundEnabled = false;
  const saved = applySettingsJson(settings, page, applets, JSON.stringify(projection));
  assert.equal(saved.host.soundEnabled, false);
  assert.deepEqual(saved.tts, settings.tts);
  assert.ok(searchSettings(pages, '音の再生').some((r) => r.key === 'soundEnabled'));
});

test('hint visibility defaults on, preserves false, validates input and stays in the appearance projection', () => {
  const settings = createDefaultSettings();
  assert.equal(settings.host.showHints, true);
  delete settings.host.showHints;
  assert.equal(parseSettings(settings).host.showHints, true);
  settings.host.showHints = false;
  assert.equal(parseSettings(settings).host.showHints, false);
  settings.host.showHints = 'false';
  assert.throws(() => parseSettings(settings), /host.showHints/);
  settings.host.showHints = true;
  const pages = settingsCatalog(applets, settings);
  const page = pages.find((p) => p.id === 'appearance');
  assert.deepEqual(
    page.items.slice(0, 2).map((i) => i.key),
    ['theme', 'showHints'],
  );
  const projection = settingsProjection(settings, page, applets);
  projection.host.showHints = false;
  const saved = applySettingsJson(settings, page, applets, JSON.stringify(projection));
  assert.equal(saved.host.showHints, false);
  assert.deepEqual(saved.tts, settings.tts);
  assert.ok(searchSettings(pages, 'ヒントの表示').some((r) => r.key === 'showHints'));
  assert.ok(
    page.items.filter((i) => i.key.startsWith('shellProviders.')).every((i) => !i.description),
  );
});

test('valid edits save immediately; invalid JSON/numbers and save failures never enter host state', async () => {
  const f = fixture();
  await f.act({ type: 'select-page', pageId: 'image-library' });
  await f.act({ type: 'mode', value: 'json' });
  await assert.rejects(
    f.act({
      type: 'partial-text',
      pageId: 'image-library',
      before: f.session.projection(),
      value: '{broken',
    }),
    /JSON/,
  );
  assert.equal(f.saves, 0);
  assert.equal('text' in f.session.snapshot(), false);
  assert.equal('dirty' in f.session.snapshot(), false);
  await f.act({
    type: 'partial-text',
    pageId: 'image-library',
    before: f.session.projection(),
    value: JSON.stringify({ imageLibrary: { groups: [{ id: 'one', name: 'Saved', images: [] }] } }),
  });
  assert.equal(f.saved.value.imageLibrary.groups[0].name, 'Saved');
  f.fail = true;
  const before = f.session.value,
    next = { ...before, imageLibrary: { groups: [{ id: 'one', name: 'Rejected', images: [] }] } };
  await assert.rejects(f.act({ type: 'values', before, value: next }), /disk failure/);
  assert.equal(f.saved.value.imageLibrary.groups[0].name, 'Saved');
  assert.equal(f.session.snapshot().pending, false);
  f.fail = false;
  await f.act({ type: 'values', before, value: next });
  assert.equal(f.saved.value.imageLibrary.groups[0].name, 'Rejected');
  await assert.rejects(
    f.act({ type: 'avatar', bytes: new Uint8Array([137, 80]), name: 'fixture.png' }),
    /不正/,
  );
  assert.equal('avatarChanged' in f.session.snapshot(), false);
  await f.act({ type: 'select-page', pageId: 'applet:test.a.b' });
  const raw = f.session.projection();
  raw.extensions['test.a.b'].settings['x.y'] = '-';
  await assert.rejects(
    f.act({
      type: 'page-values',
      pageId: 'applet:test.a.b',
      before: f.session.projection(),
      value: raw,
    }),
  );
  assert.notEqual(f.saved.value.extensions['test.a.b']?.settings['x.y'], '-');
  await f.act({ type: 'select-page', pageId: 'appearance' });
  assert.equal(f.session.snapshot().pageId, 'appearance');
});
test('stale view writes are rejected and operation ID replay saves once', async () => {
  const f = fixture(),
    s = f.session.snapshot(),
    id = crypto.randomUUID();
  const action = {
    type: 'values',
    before: s.value,
    value: { ...s.value, profile: { name: 'One', avatar: null } },
  };
  await f.act(action, id);
  await f.act(action, id);
  assert.equal(f.saves, 1);
  await assert.rejects(
    f.session.act({
      sessionId: s.sessionId,
      editRevision: s.editRevision,
      operationId: 'stale',
      action,
    }),
    /別の画面/,
  );
  f.external();
  assert.equal(f.session.snapshot().value.profile.name, 'External');
  await assert.rejects(f.act(action), /同じ設定/);
});
test('field merge preserves unrelated external updates, detects same-field conflicts, and treats arrays atomically', () => {
  const { mergeSettingsInput } = require('../out/main/shared/settings-input');
  const a = { host: { theme: 'light', startMinimized: false }, items: [1] },
    b = { host: { theme: 'dark', startMinimized: false }, items: [1] },
    c = { host: { theme: 'light', startMinimized: true }, items: [1], future: 'keep' };
  assert.deepEqual(mergeSettingsInput(a, b, c), {
    ...c,
    host: { theme: 'dark', startMinimized: true },
  });
  assert.throws(
    () => mergeSettingsInput(a, b, { ...c, host: { theme: 'system', startMinimized: true } }),
    /同じ設定/,
  );
  assert.throws(
    () => mergeSettingsInput(a, { ...a, items: [2] }, { ...a, items: [3] }),
    /同じ設定/,
  );
  assert.throws(() => mergeSettingsInput(a, { ...a, items: [NaN] }, a), /不正/);
});
test('settings is host owned and retired assignments remain inert compatibility data', () => {
  const { shellRegions, parseShellProviders, isShellRegion } = require('../out/main/shared/shell');
  assert.equal(isShellRegion('page.settings'), false);
  assert.equal(shellRegions.length, 10);
  const { parseDeclaredCommands } = require('../out/main/shared/extension-commands');
  const requirement = { region: 'page.settings', state: 'visible' };
  assert.deepEqual(
    parseDeclaredCommands('legacy.shell', [
      { id: 'legacy.shell.action', title: 'Legacy', shellRequirement: requirement },
    ])[0].shellRequirement,
    requirement,
  );
  assert.deepEqual(parseShellProviders({ shellProviders: { 'page.settings': 'legacy.shell' } }), {
    'page.settings': 'legacy.shell',
  });
});

test('all JSON pages round-trip only selected ranges; unknown owners, leaves and order survive', () => {
  const value = createDefaultSettings();
  value.extensions['test.a.b'] = {
    enabled: true,
    settings: { 'x.y': 3, unknown: 'keep' },
    pages: { main: { display: 'page' }, unknown: { display: 'window' } },
    updateSource: 'github:a/b',
  };
  value.extensions['missing.owner'] = { enabled: false, settings: { secret: 'keep' } };
  value.host.unknown = 'keep';
  value.profile = { extra: 'keep' };
  const catalog = settingsCatalog(applets, value);
  for (const page of catalog.filter((p) => p.json)) {
    const projected = settingsProjection(value, page, applets);
    const next = applySettingsJson(value, page, applets, JSON.stringify(projected));
    assert.deepEqual(next.extensions['missing.owner'], value.extensions['missing.owner']);
    assert.equal(next.host.unknown, 'keep');
    assert.equal(next.profile.extra, 'keep');
  }
  const page = catalog.find((p) => p.owner === 'test.a.b');
  const part = settingsProjection(value, page, applets);
  part.extensions['test.a.b'].settings = { 'x.y': 4 };
  const next = applySettingsJson(value, page, applets, JSON.stringify(part));
  assert.deepEqual(next.extensions['test.a.b'].settings, { 'x.y': 4 });
  assert.equal(next.extensions['test.a.b'].enabled, true);
  assert.equal(next.extensions['test.a.b'].pages.unknown.display, 'window');
  part.extensions['test.a.b'].enabled = false;
  assert.throws(
    () => applySettingsJson(value, page, applets, JSON.stringify(part)),
    /変更できない/,
  );
  assert.throws(
    () =>
      applySettingsJson(
        value,
        catalog[0],
        applets,
        '{"host":{"theme":"dark","notifications":false}}',
      ),
    /変更できない/,
  );
  assert.throws(() => applySettingsJson(value, catalog[0], applets, '{"host":{}}'), /theme/);
});
test('web partial arrays preserve other rows and immutable fields', () => {
  const v = createDefaultSettings(),
    id = 'web.11111111-1111-1111-1111-111111111111';
  v.extensions['at365.web-applet'] = { enabled: true, settings: { items: [] } };
  v.extensions['at365.web-applet'].settings.items = [
    {
      id,
      name: 'Site',
      url: 'https://example.com/',
      icon: '',
      enabled: false,
      display: 'page',
      navigation: 'none',
      allowedOrigins: [],
      accountId: 'account.11111111-1111-1111-1111-111111111111',
      imported: { name: 'Original' },
    },
  ];
  const a = [
      {
        id,
        displayName: 'Site',
        runtime: 'node',
        collection: { owner: 'at365.web-applet', key: 'items', itemId: id },
        settings: require('../../Applet.WebApplet.at365/extension.json').pageCollections[0].fields,
      },
    ],
    p = settingsCatalog(a, v).find((p) => p.owner === id);
  const json = settingsProjection(v, p, a);
  json.extensions[id].settings.name = 'Changed';
  const next = applySettingsJson(v, p, a, JSON.stringify(json));
  assert.equal(next.extensions['at365.web-applet'].settings.items[0].enabled, false);
  assert.deepEqual(next.extensions['at365.web-applet'].settings.items[0].imported, {
    name: 'Original',
  });
  json.extensions[id].settings.id = 'changed';
  assert.throws(() => applySettingsJson(v, p, a, JSON.stringify(json)));
});
test('stable catalog search uses static metadata and NFKC AND matching', () => {
  const v = createDefaultSettings(),
    pages = settingsCatalog(applets, v);
  assert.equal(searchSettings(pages, 'ＦＩＸＴＵＲＥ interval')[0].key, 'setting:x.y');
  assert.equal(searchSettings(pages, 'polling seconds')[0].title, 'Interval');
  assert.equal(searchSettings(pages, 'secret-current-value').length, 0);
  assert.notEqual(settingsItemId('a.b', 'c'), settingsItemId('a', 'b.c'));
  assert.equal(
    new Set(pages.flatMap((p) => p.items.map((i) => i.id))).size,
    pages.flatMap((p) => p.items).length,
  );
});

test('host projections preserve unknown sibling fields and exclude builtin update sources', () => {
  const value = createDefaultSettings();
  value.gestures.futureOption = 'keep';
  const all = [
    {
      id: 'builtin.fixture',
      displayName: 'Builtin',
      sourceKind: 'builtin',
      runtime: 'node',
      pages: [],
    },
  ];
  const pages = settingsCatalog(all, value),
    page = pages.find((p) => p.id === 'gestures');
  const json = settingsProjection(value, page, all);
  assert.equal(json.gestures.futureOption, undefined);
  json.gestures.enabled = !value.gestures.enabled;
  assert.equal(
    applySettingsJson(value, page, all, JSON.stringify(json)).gestures.futureOption,
    'keep',
  );
  assert.equal(
    settingsProjection(
      value,
      pages.find((p) => p.id === 'about'),
      all,
    ).extensions,
    undefined,
  );
});

test('search includes legacy key aliases and static object fields, never dynamic choices or data values', () => {
  const v = createDefaultSettings();
  const rows = [
    {
      id: 'test.search',
      displayName: 'Search',
      runtime: 'node',
      settings: [
        {
          key: 'modern',
          aliases: ['legacy'],
          title: 'Canonical',
          description: 'Description',
          type: 'object-list',
          fields: [
            {
              key: 'location',
              title: 'Folder',
              type: 'select',
              options: [{ label: 'Static choice', value: 'static' }],
            },
          ],
        },
      ],
      settingOptions: { modern: [{ label: 'Secret dynamic', value: 'secret' }] },
    },
  ];
  const pages = settingsCatalog(rows, v);
  assert.equal(searchSettings(pages, 'LEGACY folder')[0].key, 'setting:modern');
  assert.equal(searchSettings(pages, 'static choice')[0].title, 'Canonical');
  assert.equal(searchSettings(pages, 'secret dynamic').length, 0);
  assert.equal(searchSettings(pages, 'Canonical')[0].title, 'Canonical');
});
