const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const {
  desktopNotificationBounds: bounds,
} = require('../out/main/main/core/notification-desktop-layout');
const { NotificationService } = require('../out/main/main/core/notification-service');
const {
  NotificationSurfaceController,
} = require('../out/main/main/core/notification-surface-controller');
test('tray corners and missing bounds place the desktop lane inside the chosen work area', () => {
  const work = { x: 0, y: 0, width: 1920, height: 1040 };
  for (const tray of [
    { x: 1800, y: 1040, width: 20, height: 20 },
    { x: 10, y: -20, width: 20, height: 20 },
    { x: -20, y: 300, width: 20, height: 20 },
    undefined,
  ]) {
    const r = bounds(work, tray, 300);
    assert.ok(r.x >= 0 && r.y >= 0);
    assert.ok(r.x + r.width <= work.width && r.y + r.height <= work.height);
    assert.equal(r.width, 440);
  }
  assert.equal(bounds(work, { x: 10, y: -20, width: 20, height: 20 }, 300).x, 12);
  assert.equal(bounds(work, { x: 10, y: -20, width: 20, height: 20 }, 300).y, 12);
});
test('negative monitor origins and small work areas clamp dimensions without physical-pixel conversion', () => {
  for (const work of [
    { x: -1920, y: -1080, width: 1920, height: 1000 },
    { x: 0, y: 0, width: 320, height: 180 },
  ]) {
    const r = bounds(work, undefined, 6000);
    assert.ok(r.x >= work.x && r.y >= work.y);
    assert.ok(r.x + r.width <= work.x + work.width);
    assert.ok(r.y + r.height <= work.y + work.height);
    assert.ok(r.height <= work.height * 0.6);
  }
});
test('banner and desktop share IDs, deadlines and action locks while delivery states remain independent', async (t) => {
  const dir = fs.mkdtempSync(path.resolve('.artifacts/notification-delivery-unit-'));
  let now = 1000;
  const service = new NotificationService(() => now);
  t.after(() => {
    service.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  let calls = 0,
    release;
  const run = new Promise((r) => (release = r));
  const id = service.upsert('host.fixture', {
    level: 'info',
    title: 'both',
    body: '',
    lifetime: { type: 'timed', milliseconds: 1000 },
    dismissible: true,
    targets: ['banner', 'desktop'],
    history: 'session',
    actions: [
      {
        key: 'act',
        label: 'act',
        run: async () => {
          calls++;
          await run;
        },
      },
    ],
  });
  const banner = new NotificationSurfaceController(service, () => false),
    desktop = new NotificationSurfaceController(service, () => false, 'desktop');
  assert.equal(banner.items()[0].id, desktop.items()[0].id);
  const due = service.list()[0].expiresAt;
  banner.delivery([id], 'hidden');
  desktop.delivery([id], 'showing');
  assert.deepEqual(service.list()[0].delivery, { banner: 'hidden', desktop: 'showing' });
  assert.equal(service.list()[0].expiresAt, due);
  const item = desktop.items()[0];
  const task = desktop.act({
    notificationId: id,
    revision: item.revision,
    requestId: 'one',
    type: 'invoke',
    actionId: item.actions[0].id,
  });
  const current = banner.items()[0];
  await assert.rejects(
    banner.act({
      notificationId: id,
      revision: current.revision,
      requestId: 'two',
      type: 'invoke',
      actionId: current.actions[0].id,
    }),
    /処理中/,
  );
  release();
  await task;
  assert.equal(calls, 1);
  now = 2000;
  service.expire();
  assert.equal(banner.items().length, 0);
  assert.equal(desktop.items().length, 0);
  assert.equal(service.list()[0].status, 'expired');
});
