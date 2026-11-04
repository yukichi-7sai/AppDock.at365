const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema');
const { settingsStorageValue } = require('../out/main/shared/settings-storage');
const { hostSettingDefinitions } = require('../out/main/shared/host-settings');
const { ribbonDisplayWidth } = require('../out/main/shared/ribbon');
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

test('expanded width preserves old defaults, validates pixels and shares the display calculation', () => {
  assert.equal(parseSettings({ schemaVersion: 1 }).host.ribbonExpandedWidth, 200);
  assert.equal(settingsStorageValue(createDefaultSettings()).host?.ribbonExpandedWidth, undefined);
  for (const width of [56, 120, 280, 100000, Number.MAX_SAFE_INTEGER]) {
    const settings = parseSettings({ schemaVersion: 1, host: { ribbonExpandedWidth: width } });
    assert.equal(parseSettings(settingsStorageValue(settings)).host.ribbonExpandedWidth, width);
    assert.equal(ribbonDisplayWidth('expanded', width), width);
    assert.equal(ribbonDisplayWidth('compact', width), 56);
  }
  assert.equal(ribbonDisplayWidth('expanded'), 200);
  for (const width of [55, 0, -1, 200.5, null, '280', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => parseSettings({ schemaVersion: 1, host: { ribbonExpandedWidth: width } }));
});

test('ribbon width and delay participate in public metadata, search catalog, JSON and page reset', () => {
  const field = hostSettingDefinitions.find((field) => field.key === 'ribbonHoverCollapseDelayMs');
  assert.equal(field.pageId, 'ribbon');
  assert.equal(field.automation, true);
  assert.equal(field.default, 200);
  assert.equal(field.minimum, 0);
  const width = hostSettingDefinitions.find((field) => field.key === 'ribbonExpandedWidth');
  assert.equal(width.pageId, 'ribbon');
  assert.equal(width.automation, true);
  assert.equal(width.default, 200);
  assert.equal(width.minimum, 56);
  const current = createDefaultSettings();
  current.host.theme = 'dark';
  const page = settingsCatalog([], current).find((page) => page.id === 'ribbon');
  assert(JSON.stringify(page).includes('ribbonHoverCollapseDelayMs'));
  assert(JSON.stringify(page).includes('ribbonExpandedWidth'));
  const edited = parseSettings(
    applySettingsJson(
      current,
      page,
      [],
      JSON.stringify({
        host: {
          ribbonExpandOnHover: true,
          ribbonHoverCollapseDelayMs: 0,
          ribbonExpandedWidth: 280,
        },
      }),
    ),
  );
  assert.equal(settingsJsonProjection(edited, page, []).host.ribbonHoverCollapseDelayMs, 0);
  assert.equal(settingsJsonProjection(edited, page, []).host.ribbonExpandedWidth, 280);
  const reset = parseSettings(resetSettingsPage(edited, page, []));
  assert.equal(reset.host.ribbonHoverCollapseDelayMs, 200);
  assert.equal(reset.host.ribbonExpandedWidth, 200);
  assert.equal(reset.host.ribbonExpandOnHover, false);
  assert.equal(reset.host.theme, 'dark');
  assert.deepEqual(settingsJsonProjection(reset, page, []), {});
});

test('hover description references the existing ribbon toggle command', () => {
  const { commandTextIds } = require('../out/main/shared/command-text');
  const { hostCommands } = require('../out/main/shared/commands');
  const field = hostSettingDefinitions.find((field) => field.key === 'ribbonExpandOnHover');
  assert.deepEqual([...commandTextIds([field.description])], ['appdock.ribbon.toggle']);
  assert(hostCommands.some((command) => command.id === 'appdock.ribbon.toggle'));
});
