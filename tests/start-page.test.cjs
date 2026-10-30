const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startPageOptions, startPageState, isStartPage } = require('../out/main/shared/start-page');
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema');
const { settingsStorageValue } = require('../out/main/shared/settings-storage');
const {
  settingsProjection,
  applySettingsJson,
  resetSettingsPage,
  settingsCatalog,
} = require('../out/main/shared/settings-catalog');
const { NavigationCoordinator } = require('../out/main/main/core/ui-presentation');

function fixture() {
  const settings = createDefaultSettings();
  const applets = [
    {
      id: 'fixture.pages',
      name: 'Pages',
      displayName: 'Pages',
      enabled: true,
      state: 'running',
      pages: [
        { id: 'main', title: 'Main', defaultDisplay: 'page' },
        { id: 'window', title: 'Window', defaultDisplay: 'window' },
        { id: 'dynamic', title: 'Dynamic' },
      ],
    },
    {
      id: 'fixture.web.sites.mail',
      name: 'Mail',
      displayName: 'Mail',
      enabled: true,
      state: 'running',
      collection: { owner: 'fixture.web' },
      pages: [{ id: 'main', title: 'Mail', defaultDisplay: 'page' }],
    },
    {
      id: 'fixture.disabled',
      enabled: false,
      state: 'stopped',
      pages: [{ id: 'main', title: 'Disabled' }],
    },
    { id: 'fixture.empty', enabled: true, state: 'running' },
  ];
  return { settings, applets };
}
test('start page candidates include fixed, dynamic and collection pages with the effective host display', () => {
  const { settings, applets } = fixture();
  assert.deepEqual(
    startPageOptions(settings, applets).map((option) => option.value),
    [
      'about',
      'page:fixture.pages:main',
      'page:fixture.pages:dynamic',
      'page:fixture.web.sites.mail:main',
    ],
  );
  settings.extensions['fixture.pages'] = {
    enabled: true,
    settings: {},
    pages: { main: { display: 'window' }, window: { display: 'page' } },
  };
  const options = startPageOptions(settings, applets);
  assert(!options.some((option) => option.value === 'page:fixture.pages:main'));
  assert(options.some((option) => option.value === 'page:fixture.pages:window'));
  assert.equal(
    options.find((option) => option.value === 'page:fixture.pages:dynamic').label,
    'Pages / Dynamic',
  );
});
test('startup waits for delayed providers and dynamic registration, then resolves missing or unavailable pages', () => {
  const { settings, applets } = fixture();
  const applet = applets[0],
    route = 'page:fixture.pages:main';
  applet.state = 'waiting';
  assert.equal(startPageState(route, settings, applets), 'wait');
  applet.state = 'starting';
  applet.pages = [];
  assert.equal(startPageState(route, settings, applets), 'wait');
  applet.state = 'running';
  assert.equal(startPageState(route, settings, applets), 'fallback');
  applet.pages = [{ id: 'main' }];
  assert.equal(startPageState(route, settings, applets), 'open');
  settings.extensions[applet.id] = {
    enabled: true,
    settings: {},
    pages: { main: { display: 'window' } },
  };
  assert.equal(startPageState(route, settings, applets), 'fallback');
  for (const state of ['error', 'stopped', 'stopping']) {
    applet.state = state;
    assert.equal(startPageState(route, settings, applets), 'fallback');
  }
  applet.enabled = false;
  assert.equal(startPageState(route, settings, applets), 'fallback');
  assert.equal(startPageState('page:missing:main', settings, applets), 'fallback');
});
test('page references survive absence and are rejected only for invalid syntax', () => {
  assert.equal(createDefaultSettings().host.startPage, 'about');
  for (const value of ['about', 'page:missing.provider:main', 'page:fixture.web.sites.a:main']) {
    assert(isStartPage(value));
    assert.equal(
      parseSettings({ schemaVersion: 1, host: { startPage: value }, extensions: {} }).host
        .startPage,
      value,
    );
  }
  for (const value of [
    '',
    null,
    false,
    'home',
    'logs',
    'page:a:main:extra',
    'page:constructor:main',
    'page:a:__proto__',
  ]) {
    assert(!isStartPage(value));
    assert.throws(() =>
      parseSettings({ schemaVersion: 1, host: { startPage: value }, extensions: {} }),
    );
  }
});
test('general JSON, search and reset share the start page field and compact storage omits its default', () => {
  const { settings } = fixture();
  assert.equal(settingsStorageValue(settings).host?.startPage, undefined);
  const page = settingsCatalog([], settings).find((page) => page.id === 'general');
  const projection = settingsProjection(settings, page, []);
  projection.host.startPage = 'page:missing:main';
  const next = applySettingsJson(settings, page, [], JSON.stringify(projection));
  assert.equal(next.host.startPage, 'page:missing:main');
  assert.equal(settingsStorageValue(next).host.startPage, 'page:missing:main');
  assert(page.items.some((item) => item.key === 'startPage'));
  const reset = resetSettingsPage(next, page, []);
  assert.equal(reset.host.startPage, 'about');
  assert.equal(settingsStorageValue(reset).host?.startPage, undefined);
});
test('startup navigation leases yield immediately to explicit and pending navigation', async () => {
  let release;
  const nav = new NavigationCoordinator(
    () => {},
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
    undefined,
    'page:fixture.pages:main',
  );
  const valid = nav.lease('page:fixture.pages:main');
  assert(valid());
  const pending = nav.navigate('logs');
  assert(!valid());
  assert(!nav.lease('page:fixture.pages:main')());
  release();
  await pending;
  assert.equal(nav.state.route, 'logs');
  assert(nav.lease('logs')());
});
