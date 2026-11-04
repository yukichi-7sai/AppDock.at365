const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema');
const { settingsStorageValue } = require('../out/main/shared/settings-storage');
const { hostSettingDefinitions } = require('../out/main/shared/host-settings');
const {
  settingsCatalog,
  settingsJsonProjection,
  applySettingsJson,
  resetSettingsPage,
} = require('../out/main/shared/settings-catalog');

test('hover delay defaults to 200ms for old settings and preserves zero, long and disabled values', () => {
  assert.equal(parseSettings({ schemaVersion: 1 }).host.ribbonHoverCollapseDelayMs, 200);
  assert.equal(
    settingsStorageValue(createDefaultSettings()).host?.ribbonHoverCollapseDelayMs,
    undefined,
  );
  for (const delay of [0, 500, 2500, 2 ** 31, Number.MAX_SAFE_INTEGER]) {
    const value = parseSettings({ schemaVersion: 1, host: { ribbonHoverCollapseDelayMs: delay } });
    assert.equal(value.host.ribbonExpandOnHover, false);
    assert.equal(value.host.ribbonHoverCollapseDelayMs, delay);
    assert.equal(parseSettings(settingsStorageValue(value)).host.ribbonHoverCollapseDelayMs, delay);
  }
  for (const delay of [-1, 0.5, null, '200', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() =>
      parseSettings({ schemaVersion: 1, host: { ribbonHoverCollapseDelayMs: delay } }),
    );
});

test('ribbon delay participates in public metadata, search catalog, JSON and page reset', () => {
  const field = hostSettingDefinitions.find((field) => field.key === 'ribbonHoverCollapseDelayMs');
  assert.equal(field.pageId, 'ribbon');
  assert.equal(field.automation, true);
  assert.equal(field.default, 200);
  assert.equal(field.minimum, 0);
  const current = createDefaultSettings();
  current.host.theme = 'dark';
  const page = settingsCatalog([], current).find((page) => page.id === 'ribbon');
  assert(JSON.stringify(page).includes('ribbonHoverCollapseDelayMs'));
  const edited = parseSettings(
    applySettingsJson(
      current,
      page,
      [],
      JSON.stringify({
        host: { ribbonExpandOnHover: true, ribbonHoverCollapseDelayMs: 0 },
      }),
    ),
  );
  assert.equal(settingsJsonProjection(edited, page, []).host.ribbonHoverCollapseDelayMs, 0);
  const reset = parseSettings(resetSettingsPage(edited, page, []));
  assert.equal(reset.host.ribbonHoverCollapseDelayMs, 200);
  assert.equal(reset.host.ribbonExpandOnHover, false);
  assert.equal(reset.host.theme, 'dark');
  assert.deepEqual(settingsJsonProjection(reset, page, []), {});
});
