const { test } = require('node:test');
const assert = require('node:assert/strict');
const { inputPaletteBounds, inputPaletteSelection } = require('../out/main/shared/input-palette');
const { parseSettings } = require('../out/main/shared/settings-schema');
const { settingsStorageValue } = require('../out/main/shared/settings-storage');

test('input palette fits empty, short and long lists on either side of the caret', () => {
  const area = { x: -1280, y: 20, width: 1280, height: 900 };
  for (const [count, height] of [
    [0, 146],
    [1, 146],
    [3, 246],
    [8, 496],
    [21, 496],
  ]) {
    assert.deepEqual(inputPaletteBounds({ x: -32, y: 25 }, area, count), {
      x: -370,
      y: 29,
      width: 370,
      height,
    });
    assert.deepEqual(inputPaletteBounds({ x: -1280, y: 915 }, area, count), {
      x: -1280,
      y: 899 - height,
      width: 370,
      height,
    });
  }
});

test('input palette uses whole rows on the roomier side and stays inside a small work area', () => {
  const area = { x: 100, y: -700, width: 320, height: 690 };
  assert.deepEqual(inputPaletteBounds({ x: 300, y: -380 }, area, 18), {
    x: 100,
    y: -376,
    width: 320,
    height: 346,
  });
  assert.deepEqual(inputPaletteBounds({ x: 130, y: -330 }, area, 18), {
    x: 100,
    y: -692,
    width: 320,
    height: 346,
  });
  const tiny = { ...area, height: 100 };
  assert.deepEqual(inputPaletteBounds({ x: 80, y: -650 }, tiny, 12), tiny);
});

test('configured rows size the list without limiting its candidates and stay inside the work area', () => {
  const area = { x: 0, y: 0, width: 1200, height: 1000 };
  assert.equal(inputPaletteBounds({ x: 0, y: 0 }, area, 100, 12).height, 696);
  assert.equal(inputPaletteBounds({ x: 0, y: 0 }, area, 3, 12).height, 246);
  assert.equal(inputPaletteBounds({ x: 0, y: 0 }, area, 100, 10000).height, 996);
});

test('page and endpoint navigation moves selection and stops at either edge, including empty lists', () => {
  assert.equal(inputPaletteSelection('page-down', 2, 30, 8), 10);
  assert.equal(inputPaletteSelection('page-up', 10, 30, 8), 2);
  assert.equal(inputPaletteSelection('page-down', 25, 30, 8), 29);
  assert.equal(inputPaletteSelection('page-up', 2, 30, 8), 0);
  assert.equal(inputPaletteSelection('home', 20, 30, 8), 0);
  assert.equal(inputPaletteSelection('end', 0, 30, 8), 29);
  assert.equal(inputPaletteSelection('down', 29, 30, 8), 29);
  assert.equal(inputPaletteSelection('page-down', 0, 0, 8), 0);
});

test('palette counts default independently, preserve saved choices and reject invalid settings', () => {
  const settings = parseSettings({ schemaVersion: 1 });
  assert.equal(settings.host.textPaletteRows, 8);
  assert.equal(settings.host.clipboardPaletteRows, 8);
  assert.equal(settingsStorageValue(settings).host?.textPaletteRows, undefined);
  settings.host.textPaletteRows = 12;
  settings.host.clipboardPaletteRows = 3;
  settings.host.textPaletteHistory = false;
  const saved = parseSettings(settingsStorageValue(settings));
  assert.equal(saved.host.textPaletteRows, 12);
  assert.equal(saved.host.clipboardPaletteRows, 3);
  assert.equal(saved.host.textPaletteHistory, false);
  for (const key of ['textPaletteRows', 'clipboardPaletteRows']) {
    for (const value of [0, -1, 1.5, null, '8', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
      assert.throws(() => parseSettings({ ...settings, host: { ...settings.host, [key]: value } }));
    assert.equal(
      parseSettings({ ...settings, host: { ...settings.host, [key]: 10000 } }).host[key],
      10000,
    );
  }
});
