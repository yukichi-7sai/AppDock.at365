const { test } = require('node:test');
const assert = require('node:assert/strict');
const { StartupUiBarrier } = require('../out/main/main/core/startup');
test('initial presentation needs both mounted host content and ready host surfaces', async () => {
  let surfacesReady = false,
    settled = false;
  const ui = new StartupUiBarrier(() => surfacesReady);
  const pending = ui.wait().then((value) => {
    settled = true;
    return value;
  });
  ui.rendererReady();
  await Promise.resolve();
  assert.equal(settled, false);
  surfacesReady = true;
  ui.check();
  assert.equal(await pending, true);
});

test('a renderer reload invalidates an old content-ready acknowledgement', async () => {
  let surfacesReady = false,
    settled = false;
  const ui = new StartupUiBarrier(() => surfacesReady);
  ui.rendererReady();
  ui.resetRenderer();
  const pending = ui.wait().then((value) => {
    settled = true;
    return value;
  });
  surfacesReady = true;
  ui.check();
  await Promise.resolve();
  assert.equal(settled, false);
  ui.rendererReady();
  assert.equal(await pending, true);
});

test('preparation can complete before wait starts and cancellation releases a pending startup', async () => {
  const ready = new StartupUiBarrier(() => true);
  ready.rendererReady();
  assert.equal(await ready.wait(), true);
  const cancelled = new StartupUiBarrier(() => false);
  const pending = cancelled.wait();
  cancelled.cancel();
  assert.equal(await pending, false);
  assert.equal(await cancelled.wait(), false);
});

test('missing presentation acknowledgement has a bounded wait', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const ui = new StartupUiBarrier(() => true);
  const pending = ui.wait(30000);
  t.mock.timers.tick(30000);
  assert.equal(await pending, false);
});

test('completed presentation does not keep querying surface readiness on later UI updates', async () => {
  let queries = 0;
  const ui = new StartupUiBarrier(() => {
    queries++;
    return true;
  });
  const pending = ui.wait();
  ui.rendererReady();
  assert.equal(await pending, true);
  const completed = queries;
  ui.check();
  ui.rendererReady();
  assert.equal(queries, completed);
});
