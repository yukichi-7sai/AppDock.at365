const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema');
const { settingsStorageValue } = require('../out/main/shared/settings-storage');
const {
  settingsCatalog,
  settingsProjection,
  applySettingsJson,
} = require('../out/main/shared/settings-catalog');
const { deviceHostKeys } = require('../out/main/main/core/device-settings');
const { desktopNotificationBounds } = require('../out/main/main/core/notification-desktop-layout');

test('display zoom defaults, validates, projects, resets and omits the default in device settings', () => {
  const defaults = createDefaultSettings();
  assert.equal(defaults.host.zoomFactor, 1);
  delete defaults.host.zoomFactor;
  assert.equal(parseSettings(defaults).host.zoomFactor, 1);
  assert(deviceHostKeys.includes('zoomFactor'));
  for (const value of [0, 0.49, 2.01, NaN, Infinity, '1.25', null, false])
    assert.throws(
      () => parseSettings({ ...defaults, host: { ...defaults.host, zoomFactor: value } }),
      /zoomFactor/,
    );
  const settings = parseSettings(defaults);
  assert.equal(settingsStorageValue(settings).host?.zoomFactor, undefined);
  const page = settingsCatalog([], settings).find((page) => page.id === 'appearance');
  assert(page.items.some((item) => item.key === 'zoomFactor'));
  for (const zoomFactor of [0.5, 1.25, 1.33, 2]) {
    const next = applySettingsJson(settings, page, [], JSON.stringify({ host: { zoomFactor } }));
    assert.equal(parseSettings(next).host.zoomFactor, zoomFactor);
    assert.equal(settingsProjection(next, page, []).host.zoomFactor, zoomFactor);
    assert.equal(settingsStorageValue(next).host.zoomFactor, zoomFactor);
    assert.equal(applySettingsJson(next, page, [], '{}').host.zoomFactor, 1);
    assert.equal(next.host.soundEnabled, settings.host.soundEnabled);
  }
  const field = require('../out/main/shared/settings-commands').hostSettingDefinitions.find(
    (field) => field.key === 'zoomFactor',
  );
  assert.equal(field.default, 1);
  assert.equal(field.minimum, 0.5);
  assert.equal(field.maximum, 2);
  assert.equal(field.automation, true);
});

test('presentation zoom follows settings immediately, isolates origins, survives navigation and releases destroyed views', () => {
  const host = require('../out/main/main/core/display-zoom-host');
  let factor = 1.25;
  host.configureDisplayZoom(() => factor);
  const create = () => {
    const contents = new EventEmitter();
    contents.factor = 1;
    contents.calls = 0;
    contents.isDestroyed = () => !!contents.destroyed;
    contents.setZoomMode = (mode) => (contents.mode = mode);
    contents.getZoomFactor = () => contents.factor;
    contents.setZoomFactor = (value) => {
      contents.factor = value;
      contents.calls++;
    };
    host.registerDisplayZoom(contents);
    return contents;
  };
  const a = create(),
    b = create();
  assert.equal(a.factor, 1.25);
  assert.equal(a.mode, 'isolated');
  host.registerDisplayZoom(a);
  assert.equal(a.listenerCount('dom-ready'), 1);
  factor = 0.75;
  host.refreshDisplayZoom();
  assert.equal(a.factor, 0.75);
  assert.equal(b.factor, 0.75);
  const calls = a.calls;
  host.refreshDisplayZoom();
  assert.equal(a.calls, calls);
  a.factor = 1;
  a.emit('dom-ready');
  assert.equal(a.factor, 0.75);
  a.destroyed = true;
  a.emit('destroyed');
  factor = 2;
  host.refreshDisplayZoom();
  assert.equal(a.factor, 0.75);
  assert.equal(b.factor, 2);
  b.emit('destroyed');
});

test('desktop notifications scale their native bounds and clamp to small and negative-origin work areas', () => {
  const work = { x: -1920, y: -1080, width: 1920, height: 1000 };
  for (const zoom of [0.5, 1, 1.25, 2]) {
    const bounds = desktopNotificationBounds(work, undefined, 120, zoom);
    assert.equal(bounds.width, 440 * zoom);
    assert.equal(bounds.height, 120 * zoom);
    assert(bounds.x >= work.x && bounds.x + bounds.width <= work.x + work.width);
    assert(bounds.y >= work.y && bounds.y + bounds.height <= work.y + work.height);
    const small = desktopNotificationBounds(
      { x: 0, y: 0, width: 320, height: 180 },
      undefined,
      900,
      zoom,
    );
    assert(small.width <= 320 && small.height <= 108);
    assert(small.x >= 0 && small.y >= 0);
  }
});
