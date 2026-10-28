const { test } = require('node:test');
const assert = require('node:assert/strict');
const { UiPresentation, NavigationCoordinator } = require('../out/main/main/core/ui-presentation');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const { RibbonCatalogCache } = require('../out/main/main/core/ribbon-catalog-cache');
const { RibbonGroupSession } = require('../out/main/main/core/ribbon-group-session');
function fixture(overrides = {}) {
  const settings = createDefaultSettings();
  let changes = 0,
    executions = [],
    toggles = 0;
  const nav = new NavigationCoordinator(() => changes++);
  const applets = [
    {
      id: 'test.page',
      enabled: true,
      state: 'running',
      commands: [{ id: 'test.page.open', available: true }],
      pages: [
        {
          iconImage: 'data:image/png;base64,AA==',
          id: 'main',
          title: 'Page',
          openCommand: 'test.page.open',
          source: 'local',
        },
      ],
    },
  ];
  const ui = new UiPresentation({
    settings: () => settings,
    applets: () => applets,
    dark: () => true,
    navigation: nav,
    execute: async (c) => executions.push(c),
    theme: async () => toggles++,
    ...overrides,
  });
  return {
    ui,
    nav,
    settings,
    applets,
    get changes() {
      return changes;
    },
    executions,
    get toggles() {
      return toggles;
    },
  };
}

function cachedFixture(expansion = 'persistent') {
  let settings = createDefaultSettings(),
    shell = '',
    source = [],
    images = 0;
  let commandBuilds = 0,
    projections = 0,
    open = false,
    badge = null,
    mode = 'compact';
  settings.ribbon.groups = [
    {
      id: 'group:cached',
      title: 'Cached',
      children: ['image-library'],
      expansion,
    },
  ];
  settings.ribbon.order = ['group:cached'];
  const catalog = new RibbonCatalogCache(
    () => source,
    () => {
      commandBuilds++;
      return [{ id: 'ribbon.configure', available: true }, ...source.flatMap((a) => a.commands)];
    },
  );
  const inputs = () => catalog.get(settings, shell);
  const nav = new NavigationCoordinator(() => {});
  const ui = new UiPresentation({
    settings: () => settings,
    version: () => `${inputs().revision}:${images}`,
    applets: () => {
      projections++;
      return inputs().applets;
    },
    commands: () => inputs().commands,
    dark: () => false,
    navigation: nav,
    execute: async () => {},
    theme: async () => {},
    expanded: () => open,
    temporaryExpanded: () => expansion === 'temporary' && open,
    toggleGroup: () => {
      open = !open;
    },
    displayMode: () => mode,
    toggleDisplayMode: () => {
      mode = mode === 'compact' ? 'expanded' : 'compact';
    },
    badge: (id) => (id === 'image-library' ? badge : null),
  });
  return {
    ui,
    nav,
    catalog,
    get counts() {
      return { commandBuilds, projections };
    },
    set open(value) {
      open = value;
    },
    set badge(value) {
      badge = value;
    },
    set shell(value) {
      shell = value;
    },
    set source(value) {
      source = value;
      catalog.invalidate();
    },
    changeSettings(update) {
      settings = structuredClone(settings);
      update(settings);
    },
    changeImages() {
      images++;
    },
  };
}

test('cached persistent expansion rebuilds once after each click without regenerating commands', async () => {
  const f = cachedFixture();
  const first = f.ui.get();
  assert.deepEqual(f.counts, { commandBuilds: 1, projections: 1 });
  for (const [i, expanded] of [true, false, true].entries()) {
    await f.ui.invoke(
      { epoch: first.epoch, requestId: `click-${i}`, actionId: 'ribbon.group:cached' },
      'local',
    );
    const next = f.ui.get();
    assert.equal(next.items.find((item) => item.id === 'group:cached').expanded, expanded);
    assert.equal(f.ui.group('group:cached').view, next);
    assert.equal(f.ui.get(), next);
    assert.deepEqual(f.counts, { commandBuilds: 1, projections: i + 2 });
  }
});

test('temporary group snapshots share the ribbon projection; transient changes keep the catalog', () => {
  const f = cachedFixture('temporary');
  f.ui.get();
  const session = new RibbonGroupSession(
    f.ui,
    'group:cached',
    { x: 0, y: 0, width: 40, height: 40 },
    assert.fail,
  );
  f.open = true;
  const expanded = f.ui.get();
  for (let i = 0; i < 4; i++) {
    assert.equal(session.snapshot().revision, expanded.revision);
    assert.equal(f.ui.get(), expanded);
  }
  assert.deepEqual(f.counts, { commandBuilds: 1, projections: 2 });
  session.cancel('dismissed');
  f.open = false;
  assert.equal(f.ui.get().items.find((item) => item.id === 'group:cached').expanded, false);
  f.badge = { kind: 'count', count: 3, label: 'Pending' };
  assert.equal(f.ui.group('group:cached').items[0].badge.text, '3');
  f.nav.navigate('logs');
  assert.equal(f.ui.get().route, 'logs');
  f.changeImages();
  const changed = f.ui.get();
  assert.equal(f.ui.get(), changed);
  assert.deepEqual(f.counts, { commandBuilds: 1, projections: 6 });
});

test('catalog invalidation refreshes settings, Applet availability and Shell requirements before invocation', async () => {
  const f = cachedFixture();
  const first = f.ui.get();
  f.shell = 'provider-visible';
  f.ui.get();
  assert.equal(f.counts.commandBuilds, 2);
  f.source = [];
  f.ui.get();
  assert.equal(f.counts.commandBuilds, 3);
  const pending = f.ui.invoke(
    { epoch: first.epoch, requestId: 'hidden', actionId: 'ribbon.group:cached' },
    'local',
  );
  f.changeSettings((settings) => settings.ribbon.hidden.push('group:cached'));
  await assert.rejects(
    pending,
    /Unknown or hidden action|Action target changed|no longer available/,
  );
  assert.equal(f.counts.commandBuilds, 4);
  assert.equal(f.ui.group('group:cached'), undefined);
});

test('cached projections keep permissions, schema and local-only controls separate', () => {
  const f = cachedFixture();
  const local = f.ui.get();
  const denied = () => false;
  assert.equal(f.ui.get(denied).items.find((item) => item.id === 'group:cached').enabled, false);
  assert.equal(f.ui.get(denied).items.find((item) => item.id === 'group:cached').enabled, false);
  assert.equal(f.ui.get().items.find((item) => item.id === 'group:cached').enabled, true);
  assert.ok(f.ui.get(undefined, 1).items.every((item) => item.kind !== 'group'));
  assert.equal(f.ui.get(undefined, 2, false).displayModeToggle, undefined);
  assert.equal(f.ui.get().revision, local.revision);
  assert.equal(f.counts.commandBuilds, 1);
});

test('cached Applet pages track registration, availability and removal', () => {
  const f = cachedFixture();
  const source = {
    id: 'cached.page',
    enabled: true,
    state: 'running',
    commands: [{ id: 'cached.page.open', available: true }],
    pages: [{ id: 'main', title: 'Live page', openCommand: 'cached.page.open', source: 'local' }],
  };
  const page = () => f.ui.get().items.find((item) => item.id === 'page:cached.page:main');
  assert.equal(page(), undefined);
  f.source = [source];
  assert.equal(page().enabled, true);
  f.source = [{ ...source, commands: [{ id: 'cached.page.open', available: false }] }];
  assert.equal(page().enabled, false);
  f.source = [];
  assert.equal(page(), undefined);
});
test('full presentation preserves order, placement, selected route and opaque assets without local paths', () => {
  const f = fixture();
  f.settings.ribbon.order = ['page:test.page:main', 'image-library'];
  f.settings.ribbon.bottom.push('image-library');
  f.nav.navigate('page:test.page:main');
  const a = f.ui.get();
  const b = f.ui.get();
  assert.deepEqual(a, b);
  assert.equal(a.items[0].selected, true);
  assert.equal(a.items.find((i) => i.id === 'image-library').placement, 'bottom');
  assert.ok(!JSON.stringify(a).includes('openCommand'));
  const asset = a.items.find((i) => i.id === 'page:test.page:main').icon.assetId;
  assert.match(asset, /^[a-f0-9]{64}$/);
  assert.equal(f.ui.getAsset(asset).dataUrl, 'data:image/png;base64,AA==');
  assert.throws(() => f.ui.getAsset('../settings.json'));
  f.nav.navigate('logs');
  assert.ok(f.ui.get().revision > a.revision);
  assert.equal(f.settings.schemaVersion, 1);
});

test('ribbon icon overrides replace provider images, preserve actions and allow restoring inherited icons', () => {
  const f = fixture({ image: (ref) => (ref?.file ? 'data:image/png;base64,QkI=' : undefined) });
  const id = 'page:test.page:main';
  const get = (key = id) => f.ui.get().items.find((item) => item.id === key);
  const original = get();
  assert(original.icon.assetId);
  f.settings.ribbon.itemOverrides[id] = { icon: 'star' };
  assert.equal(get().icon.name, 'star');
  assert.equal(get().icon.assetId, undefined);
  assert.equal(get().actionId, original.actionId);
  assert.equal(get().title, original.title);
  f.settings.ribbon.itemOverrides[id].image = { file: 'custom.png' };
  assert.equal(f.ui.getAsset(get().icon.assetId).dataUrl, 'data:image/png;base64,QkI=');
  f.settings.ribbon.itemOverrides[id] = { icon: null, image: null };
  assert.equal(get().icon.assetId, original.icon.assetId);
  for (const key of ['ribbon-display-mode', 'theme']) {
    f.settings.ribbon.itemOverrides[key] = { icon: 'heart' };
    assert.equal(get(key).icon.name, 'heart');
    f.settings.ribbon.itemOverrides[key].icon = null;
    assert.notEqual(get(key).icon.name, 'heart');
  }
});

test('mode-specific icons inherit legacy values, switch atomically and restore factory icons independently', async () => {
  let mode = 'compact';
  const f = fixture({
    displayMode: () => mode,
    toggleDisplayMode: () => {
      mode = mode === 'compact' ? 'expanded' : 'compact';
    },
    image: (ref) => (ref?.file ? 'data:image/png;base64,QkI=' : undefined),
  });
  const id = 'ribbon-display-mode';
  const get = () => f.ui.get().items.find((item) => item.id === id);
  f.settings.ribbon.itemOverrides[id] = { icon: 'star', image: { file: 'legacy.png' } };
  for (mode of ['compact', 'expanded']) {
    assert.equal(get().icon.name, 'star');
    assert(get().icon.assetId);
  }
  mode = 'compact';
  const override = f.settings.ribbon.itemOverrides[id];
  override.displayModeIcons = {
    compact: { icon: 'music', image: null },
    expanded: { icon: 'calendar', image: { file: 'expanded.png' } },
  };
  const first = get();
  assert.equal(first.icon.name, 'music');
  assert.equal(first.icon.assetId, undefined);
  await f.ui.invoke(
    { epoch: f.ui.get().epoch, requestId: 'mode-icons', actionId: first.actionId },
    'local',
  );
  const next = get();
  assert.equal(next.icon.name, 'calendar');
  assert(next.icon.assetId);
  assert.equal(next.actionId, first.actionId);
  assert.equal(next.title, first.title);
  override.displayModeIcons.expanded = { icon: null, image: null };
  assert.equal(get().icon.name, 'chevron-left');
  assert.equal(get().icon.assetId, undefined);
  mode = 'compact';
  assert.equal(get().icon.name, 'music');
  override.icon = null;
  override.image = null;
  override.displayModeIcons = null;
  assert.equal(get().icon.name, 'chevron');
});

test('ribbon aliases and icon-only are presentation settings, preserving actions and accessible fallback names', async () => {
  const f = fixture();
  f.settings.ribbon.itemOverrides = { 'page:test.page:main': { title: 'Inbox', iconOnly: true } };
  const view = f.ui.get();
  const item = view.items.find((i) => i.id === 'page:test.page:main');
  assert.equal(item.title, 'Inbox');
  assert.equal(item.iconOnly, true);
  await f.ui.invoke({ epoch: view.epoch, requestId: 'alias', actionId: item.actionId }, 'fixture');
  assert.deepEqual(f.executions, ['test.page.open']);
  assert.equal(f.applets[0].pages[0].title, 'Page');
  assert.equal(f.ui.get(() => true, 1).items.find((i) => i.id === item.id).iconOnly, undefined);
  f.settings.ribbon.order = ['group:blank'];
  f.settings.ribbon.groups = [
    {
      id: 'group:blank',
      title: '',
      icon: 'folder',
      expansion: 'persistent',
      children: ['image-library'],
    },
  ];
  const blank = f.ui.get().items.find((i) => i.id === 'group:blank');
  assert.equal(blank.title, 'グループ');
  assert.equal(blank.iconOnly, true);
});
test('two readers share host revision; denied projections cannot change commands or navigation', () => {
  const f = fixture(),
    a = f.ui.get(),
    b = f.ui.get((action) => !action.command);
  assert.equal(a.revision, b.revision);
  assert.equal(a.epoch, b.epoch);
  assert.equal(b.items.find((i) => i.id === 'page:test.page:main').enabled, false);
  assert.equal(f.changes, 0);
  assert.deepEqual(f.executions, []);
});
test('actions deduplicate per session, reject stale epochs and hidden actions, dispose clears cache', async () => {
  const f = fixture(),
    a = f.ui.get();
  const request = { epoch: a.epoch, requestId: 'same', actionId: 'ribbon.theme' };
  await Promise.all([f.ui.invoke(request, 'one'), f.ui.invoke(request, 'one')]);
  assert.equal(f.toggles, 1);
  await f.ui.invoke(request, 'two');
  assert.equal(f.toggles, 2);
  assert.throws(() => f.ui.invoke({ ...request, actionId: 'ribbon.home' }, 'one'));
  assert.throws(() => f.ui.invoke({ ...request, epoch: 'old' }, 'one'));
  f.settings.ribbon.hidden.push('theme');
  await f.ui.invoke(request, 'one'); // A completed request remains idempotent after state changes.
  assert.throws(() => f.ui.invoke({ ...request, requestId: 'hidden-new' }, 'one'));
  f.settings.ribbon.hidden = [];
  f.ui.disconnect('one');
  await f.ui.invoke(request, 'one');
  assert.equal(f.toggles, 3);
  await f.ui.invoke(
    { ...request, requestId: 'open', actionId: 'ribbon.page:test.page:main' },
    'one',
  );
  assert.deepEqual(f.executions, ['test.page.open']);
});
test('navigation changes never execute a page command and repeated focus sections remain observable', () => {
  const f = fixture();
  f.nav.navigate('page:test.page:main');
  f.nav.navigate('page:test.page:main');
  assert.equal(f.changes, 1);
  f.nav.navigate('settings', 'ribbon');
  f.nav.navigate('settings', 'ribbon');
  assert.equal(f.changes, 3);
  assert.deepEqual(f.executions, []);
  assert.throws(() => f.nav.navigate('private:route'));
});

test('navigation waits for pending input and only applies the latest request', async () => {
  const releases = [],
    errors = [];
  let changes = 0;
  const nav = new NavigationCoordinator(
    () => changes++,
    () => new Promise((resolve, reject) => releases.push({ resolve, reject })),
    (e) => errors.push(e),
  );
  const first = nav.navigate('settings', 'general'),
    second = nav.navigate('logs');
  assert.equal(nav.state.route, 'settings');
  releases[1].resolve();
  await second;
  releases[0].resolve();
  await first;
  assert.equal(nav.state.route, 'logs');
  assert.equal(changes, 1);
  const failure = nav.navigate(null);
  releases[2].reject(Error('pending input'));
  await failure;
  assert.equal(nav.state.route, 'logs');
  assert.equal(errors.length, 1);
});

test('startup restoration yields to explicit navigation before and during its input drain', async () => {
  const releases = [];
  const nav = new NavigationCoordinator(
    () => {},
    () => new Promise((resolve) => releases.push(resolve)),
  );
  const restored = nav.restore('extensions');
  const explicit = nav.navigate('settings', 'general');
  assert.equal(nav.restore('home'), undefined);
  releases[0]();
  await restored;
  assert.equal(nav.state.route, 'settings');
  releases[1]();
  await explicit;
  assert.equal(nav.state.route, 'settings');
  assert.equal(nav.restore('logs'), undefined);
  assert.equal(nav.state.route, 'settings');

  const first = new NavigationCoordinator(() => {});
  first.navigate('settings');
  first.restore('home');
  assert.equal(first.state.route, 'settings');
});

test('startup and recovery select version information; retired and invalid routes cannot open', () => {
  const nav = new NavigationCoordinator(() => {});
  assert.deepEqual(nav.state, { route: 'settings', section: 'about', request: 0 });
  nav.navigate('logs');
  nav.navigate(null);
  assert.equal(nav.state.route, 'settings');
  assert.equal(nav.state.section, 'about');
  assert.throws(() => nav.navigate('home'));
  for (const route of ['home', 'private:route', 'page:invalid']) {
    const restored = new NavigationCoordinator(() => {});
    restored.restore(route);
    assert.equal(restored.state.route, 'settings');
    assert.equal(restored.state.section, 'about');
  }
});
