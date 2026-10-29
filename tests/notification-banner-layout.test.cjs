const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  bannerNotificationBounds: bounds,
} = require('../out/main/main/core/notification-banner-layout');
const { notificationBannerPositions } = require('../out/main/shared/notifications');
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema');
const { settingsStorageValue } = require('../out/main/shared/settings-storage');
const {
  settingsCatalog,
  settingsJsonProjection,
  applySettingsJson,
  resetSettingsPage,
} = require('../out/main/shared/settings-catalog');

test('banner anchors retain their edge as content grows and fit narrow, zoomed windows', () => {
  for (const zoom of [0.8, 1, 1.25, 2]) {
    for (const content of [
      { width: 1000, height: 800 },
      { width: 300, height: 220 },
    ]) {
      const viewport = {
        width: Math.min(680, content.width / zoom - 32),
        maxHeight: (content.height / zoom) * 0.4,
      };
      for (const position of notificationBannerPositions) {
        const a = bounds(content, viewport, 60, zoom, position);
        const b = bounds(content, viewport, 500, zoom, position);
        for (const rect of [a, b]) {
          assert(rect.x >= 0 && rect.y >= 0);
          assert(rect.x + rect.width <= content.width);
          assert(rect.y + rect.height <= content.height);
        }
        if (position.startsWith('bottom-')) assert.equal(a.y + a.height, b.y + b.height);
        else assert.equal(a.y, b.y);
        if (position.endsWith('-left')) assert.equal(a.x, Math.round(16 * zoom));
        if (position.endsWith('-right'))
          assert.equal(content.width - a.x - a.width, Math.round(16 * zoom));
        if (position.endsWith('-center'))
          assert(Math.abs(a.x + a.width / 2 - content.width / 2) <= 0.5);
      }
    }
  }
});

test('banner position validates, survives storage, and belongs to notification JSON and reset only', () => {
  const initial = createDefaultSettings();
  assert.equal(parseSettings({ schemaVersion: 1 }).host.notificationBannerPosition, 'top-center');
  assert.equal(settingsStorageValue(initial).host?.notificationBannerPosition, undefined);
  const page = settingsCatalog([], initial).find((page) => page.id === 'notifications');
  assert(page.items.some((item) => item.key === 'notificationBannerPosition'));
  for (const value of notificationBannerPositions) {
    const next = applySettingsJson(
      initial,
      page,
      [],
      JSON.stringify({ host: { notificationBannerPosition: value } }),
    );
    assert.equal(parseSettings(settingsStorageValue(next)).host.notificationBannerPosition, value);
    assert.equal(next.host.theme, initial.host.theme);
    assert.equal(
      settingsJsonProjection(next, page, []).host?.notificationBannerPosition,
      value === 'top-center' ? undefined : value,
    );
    next.host.theme = 'dark';
    const reset = resetSettingsPage(next, page, []);
    assert.equal(reset.host.notificationBannerPosition, 'top-center');
    assert.equal(reset.host.theme, 'dark');
  }
  for (const value of ['center', '', null, 3]) {
    assert.throws(() =>
      parseSettings({ ...initial, host: { ...initial.host, notificationBannerPosition: value } }),
    );
  }
});
