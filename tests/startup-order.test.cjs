const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startupShellIds, StartupUiBarrier } = require('../out/main/main/core/startup');
const { defaultShellId, shellRegions } = require('../out/main/shared/shell');
const provider = (id, extra = {}) => ({
  id,
  enabled: true,
  sourceKind: 'external',
  shell: {
    apiVersion: 1,
    views: Object.fromEntries(shellRegions.map((r) => [r.id, 'index.html'])),
  },
  ...extra,
});

test('initial priority deduplicates only enabled configured Shell providers and always includes Default Shell', () => {
  const providers = [
    provider('unused'),
    provider('selected'),
    provider('disabled', { enabled: false }),
    provider('regular', { shell: undefined }),
    provider('partial', { shell: { apiVersion: 1, views: { ribbon: 'ribbon.html' } } }),
  ];
  const assignments = {
    titlebar: 'selected',
    ribbon: 'selected',
    statusbar: 'partial',
    'notification.banner': 'disabled',
    'notification.desktop': 'regular',
    'overlay.command-palette': 'missing',
    'page.settings': 'unused',
  };
  const before = structuredClone({ providers, assignments });
  assert.deepEqual(
    [...startupShellIds(providers, assignments, false)],
    [defaultShellId, 'selected'],
  );
  assert.deepEqual({ providers, assignments }, before);
});

test('different current regions can prioritize different workers without adding unselected Shells', () => {
  const providers = [
    provider('bars'),
    provider('ribbon'),
    provider('notification'),
    provider('unused'),
  ];
  assert.deepEqual(
    [
      ...startupShellIds(
        providers,
        {
          titlebar: 'bars',
          statusbar: 'bars',
          ribbon: 'ribbon',
          'notification.desktop': 'notification',
        },
        false,
      ),
    ],
    [defaultShellId, 'bars', 'ribbon', 'notification'],
  );
});

test('safe mode and no selection keep only Default Shell ahead of the window', () => {
  const providers = [provider('selected')];
  assert.deepEqual([...startupShellIds(providers, { ribbon: 'selected' }, true)], [defaultShellId]);
  assert.deepEqual([...startupShellIds(providers, {}, false)], [defaultShellId]);
});

test('initial presentation needs both mounted host content and ready Shell views', async () => {
  let shellsReady = false,
    settled = false;
  const ui = new StartupUiBarrier(() => shellsReady);
  const pending = ui.wait().then((value) => {
    settled = true;
    return value;
  });
  ui.rendererReady();
  await Promise.resolve();
  assert.equal(settled, false);
  shellsReady = true;
  ui.check();
  assert.equal(await pending, true);
});

test('a renderer reload invalidates an old content-ready acknowledgement', async () => {
  let shellsReady = false,
    settled = false;
  const ui = new StartupUiBarrier(() => shellsReady);
  ui.rendererReady();
  ui.resetRenderer();
  const pending = ui.wait().then((value) => {
    settled = true;
    return value;
  });
  shellsReady = true;
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

test('completed presentation does not keep querying Shell readiness on later UI updates', async () => {
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
