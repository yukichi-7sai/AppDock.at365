const { test } = require('node:test');
const assert = require('node:assert/strict');
const { inputPaletteBounds } = require('../out/main/shared/input-palette');

test('input palette fits empty, short and long lists on either side of the caret', () => {
  const area = { x: -1280, y: 20, width: 1280, height: 900 };
  for (const [count, height] of [[0, 128], [1, 128], [3, 228], [8, 478], [21, 478]]) {
    assert.deepEqual(inputPaletteBounds({ x: -32, y: 25 }, area, count), {
      x: -370, y: 29, width: 370, height,
    });
    assert.deepEqual(inputPaletteBounds({ x: -1280, y: 915 }, area, count), {
      x: -1280, y: 899 - height, width: 370, height,
    });
  }
});

test('input palette uses whole rows on the roomier side and stays inside a small work area', () => {
  const area = { x: 100, y: -700, width: 320, height: 690 };
  assert.deepEqual(inputPaletteBounds({ x: 300, y: -380 }, area, 18), {
    x: 100, y: -376, width: 320, height: 328,
  });
  assert.deepEqual(inputPaletteBounds({ x: 130, y: -330 }, area, 18), {
    x: 100, y: -674, width: 320, height: 328,
  });
  const tiny = { ...area, height: 100 };
  assert.deepEqual(inputPaletteBounds({ x: 80, y: -650 }, tiny, 12), tiny);
});
