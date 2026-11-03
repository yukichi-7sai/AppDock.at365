const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  inputPaletteBounds,
  inputPaletteSelection,
  inputPaletteResizedBounds,
} = require('../out/main/shared/input-palette');
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

test('configured width fits the work area and temporary resizing takes precedence', () => {
  const area = { x: -1200, y: -100, width: 1200, height: 900 };
  const anchor = { x: -10, y: 0 };
  for (const requested of [260, 420, 480, 10000]) {
    const bounds = inputPaletteBounds(anchor, area, 18, 4, false, undefined, requested);
    assert.equal(bounds.width, Math.min(requested, area.width));
    assert.equal(bounds.x + bounds.width, 0);
    assert.equal(bounds.height, 269);
  }
  const resized = inputPaletteBounds(anchor, area, 18, 4, true, { width: 610, height: 400 }, 480);
  assert.equal(resized.width, 610);
  assert.equal(resized.height, 400);
  const tiny = { x: -100, y: 0, width: 200, height: 100 };
  assert.deepEqual(inputPaletteBounds(anchor, tiny, 18, 4, true, undefined, 480), tiny);
});

test('palette widths default independently and validate saved values', () => {
  const settings = parseSettings({ schemaVersion: 1 });
  for (const key of ['textPaletteWidth', 'clipboardPaletteWidth']) {
    assert.equal(settings.host[key], 370);
    assert.equal(settingsStorageValue(settings).host?.[key], undefined);
    for (const value of [
      0,
      259,
      -1,
      370.5,
      null,
      '370',
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
    ])
      assert.throws(() => parseSettings({ ...settings, host: { ...settings.host, [key]: value } }));
    assert.equal(
      parseSettings({ ...settings, host: { ...settings.host, [key]: 10000 } }).host[key],
      10000,
    );
  }
  settings.host.textPaletteWidth = 480;
  settings.host.clipboardPaletteWidth = 420;
  const saved = parseSettings(settingsStorageValue(settings));
  assert.equal(saved.host.textPaletteWidth, 480);
  assert.equal(saved.host.clipboardPaletteWidth, 420);
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
  assert.equal(settings.host.paletteShowGuide, true);
  assert.equal(settingsStorageValue(settings).host?.textPaletteRows, undefined);
  settings.host.textPaletteRows = 12;
  settings.host.clipboardPaletteRows = 3;
  settings.host.textPaletteHistory = false;
  settings.host.paletteShowGuide = false;
  const saved = parseSettings(settingsStorageValue(settings));
  assert.equal(saved.host.textPaletteRows, 12);
  assert.equal(saved.host.clipboardPaletteRows, 3);
  assert.equal(saved.host.textPaletteHistory, false);
  assert.equal(saved.host.paletteShowGuide, false);
  assert.throws(() =>
    parseSettings({ ...settings, host: { ...settings.host, paletteShowGuide: 'false' } }),
  );
  for (const key of ['textPaletteRows', 'clipboardPaletteRows']) {
    for (const value of [0, -1, 1.5, null, '8', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
      assert.throws(() => parseSettings({ ...settings, host: { ...settings.host, [key]: value } }));
    assert.equal(
      parseSettings({ ...settings, host: { ...settings.host, [key]: 10000 } }).host[key],
      10000,
    );
  }
});

test('hidden guide retains the requested candidate rows and temporary size fits on either side', () => {
  const area = { x: 0, y: 0, width: 1200, height: 900 };
  const anchor = { x: 400, y: 400 };
  const guide = inputPaletteBounds(anchor, area, 18, 4, true);
  const compact = inputPaletteBounds(anchor, area, 18, 4, false);
  assert.equal(guide.height - compact.height, 27);
  for (const y of [20, 880]) {
    const bounds = inputPaletteBounds({ x: 1190, y }, area, 18, 4, false, {
      width: 550,
      height: 650,
    });
    assert.equal(bounds.width, 550);
    assert.equal(bounds.height, 650);
    assert(bounds.x >= 0 && bounds.x + bounds.width <= 1200);
    assert(bounds.y >= 0 && bounds.y + bounds.height <= 900);
  }
});

test('resizing preserves the anchored corner, minimum controls and work-area limits including negative origins', () => {
  const area = { x: -1200, y: -100, width: 1200, height: 900 };
  const start = { x: -1000, y: 100, width: 370, height: 296 };
  assert.deepEqual(inputPaletteResizedBounds(start, area, { width: 500, height: 450 }, true), {
    ...start,
    width: 500,
    height: 450,
  });
  assert.deepEqual(inputPaletteResizedBounds(start, area, { width: -100, height: -100 }, false), {
    ...start,
    width: 260,
    height: 119,
  });
  assert.deepEqual(inputPaletteResizedBounds(start, area, { width: 99999, height: 99999 }, true), {
    ...start,
    width: 1000,
    height: 700,
  });
  const tiny = { x: 0, y: 0, width: 200, height: 100 };
  assert.deepEqual(inputPaletteResizedBounds(start, tiny, { width: 999, height: 999 }, true), tiny);
});
