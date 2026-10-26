const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { NotificationService } = require('../out/main/main/core/notification-service');
const { NotificationCenterController } = require('../out/main/main/core/notification-center');
const { publishUpdateResult } = require('../out/main/main/core/update-result-notification');
const p = require('../out/main/shared/notification-types');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
function setup(t, applets = []) {
  const dir = fs.mkdtempSync(path.resolve('.artifacts/notification-center-unit-')),
    file = path.join(dir, 'history.json');
  const service = new NotificationService();
  const controller = new NotificationCenterController(
    { id: 'center', route: 'notifications', kind: 'notifications' },
    {
      service,
      applets: () => applets,
      dark: () => true,
      changed: () => {},
    },
  );
  t.after(() => {
    controller.dispose();
    service.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const input = (extra) => ({
    title: 'private live',
    body: 'live details',
    level: 'info',
    targets: [],
    lifetime: { type: 'manual' },
    dismissible: true,
    history: 'persistent',
    historyText: { title: 'Safe history', body: 'Safe summary' },
    ...extra,
  });
  const publish = (extra) => service.upsert('host.fixture', input(extra));
  const act = (action) => controller.act({ id: 'center', type: 'notifications', action });
  const model = () => controller.snapshot().content;
  const historyTab = () =>
    act({ type: 'filters', filters: { ...model().filters, tab: 'history' } });
  return { dir, file, service, controller, input, publish, act, model, historyTab };
}
test('center-only policy is accepted; obsolete unsaved warning is absent', () => {
  const s = createDefaultSettings(),
    kind = {
      ...p.notificationCatalog([])[0],
      ownerKind: 'applet',
      ownerId: 'fixture',
      canDisable: true,
      requiredTargets: [],
    };
  s.notificationPreferences = {
    overrides: [{ ownerKind: 'applet', ownerId: 'fixture', typeId: kind.typeId, targets: [] }],
  };
  assert.equal(p.resolveNotificationPolicy(kind, s).enabled, true);
  assert.deepEqual(p.resolveNotificationPolicy(kind, s).targets, []);
  assert.equal(
    p.notificationCatalog([]).some((t) => t.typeId === 'unsaved-changes'),
    false,
  );
});

test('source filter groups host modules without merging identically named Applets or changing notification ownership', async (t) => {
  const f = setup(t, [
    { id: 'same-name', displayName: 'AppDock' },
    { id: 'other', displayName: 'AppDock' },
  ]);
  const publish = (kind, owner, type = 'message') => {
    const source = `${kind}.${owner}`;
    const id = f.service.upsert(source, f.input());
    f.service.identify(id, { ownerKind: kind, ownerId: owner }, type);
    return id;
  };
  const update = publish('host', 'updates', 'applied');
  const error = publish('host', 'errors', 'operation-failed');
  const applet = publish('applet', 'same-name');
  publish('applet', 'other');
  assert.deepEqual(
    new Set(f.model().sources.map((s) => s.id)),
    new Set(['host', 'applet.same-name', 'applet.other']),
  );
  assert.equal(f.model().sources.find((s) => s.id === 'host').title, 'AppDock');
  const filter = (source, tab = 'active') =>
    f.act({ type: 'filters', filters: { ...f.model().filters, source, tab } });
  await filter('host');
  assert.deepEqual(new Set(f.model().items.map((i) => i.id)), new Set([update, error]));
  assert.deepEqual(
    new Set(f.model().items.map((i) => i.source)),
    new Set(['host.updates', 'host.errors']),
  );
  const warning = publish('host', 'warnings', 'attention-required');
  assert.equal(f.model().total, 3);
  f.service.end('host.errors', error);
  f.service.end('host.warnings', warning);
  await filter('host', 'history');
  assert.deepEqual(new Set(f.model().items.map((i) => i.id)), new Set([error, warning]));
  assert.equal(f.model().sources.filter((s) => s.id === 'host').length, 1);
  await filter('applet.same-name');
  assert.deepEqual(
    f.model().items.map((i) => i.id),
    [applet],
  );
  await filter('host.updates'); // Existing internal source filters remain accepted.
  assert.deepEqual(
    f.model().items.map((i) => i.id),
    [update],
  );
  const untyped = f.publish();
  await filter('host');
  assert.deepEqual(new Set(f.model().items.map((i) => i.id)), new Set([update, untyped]));
});
test('active/history ID union uses live content and safe ended summaries; none is never retained', async (t) => {
  const f = setup(t);
  const a = f.publish(),
    b = f.publish({ history: 'session' }),
    c = f.publish({ history: 'none' });
  assert.equal(f.model().items.length, 3);
  assert.equal(f.service.targetItems('banner').length, 0);
  f.service.end('host.fixture', a);
  f.service.end('host.fixture', b);
  f.service.end('host.fixture', c);
  await f.historyTab();
  assert.equal(f.model().total, 2);
  assert.equal(f.model().items.find((i) => i.id === a).body, 'Safe summary');
  assert.ok(f.model().items.every((i) => !i.actions.length && !i.dismissible));
});

test('history pages are bounded and stale cursors cannot act on a changed query', async (t) => {
  const f = setup(t);
  for (let n = 0; n < 65; n++) {
    const id = f.publish({ level: n % 2 ? 'warning' : 'info' });
    f.service.end('host.fixture', id);
  }
  await f.historyTab();
  assert.equal(f.model().items.length, 50);
  const cursor = f.model().nextCursor;
  await f.act({ type: 'page', cursor });
  assert.equal(f.model().items.length, 15);
  const token = f.model().token,
    id = f.publish();
  f.service.end('host.fixture', id);
  await assert.rejects(f.act({ type: 'page', cursor }), /一覧/);
  await f.act({
    type: 'filters',
    filters: { ...f.model().filters, level: 'warning', text: 'Safe' },
  });
  assert.equal(f.model().total, 32);
  assert.equal(f.model().items.length, 32);
});

test('center and banner share one action lock; history has no callbacks', async (t) => {
  const f = setup(t);
  let release,
    ran = 0;
  const id = f.publish({
    targets: ['banner'],
    actions: [
      {
        key: 'act',
        label: 'Act',
        run: () => {
          ran++;
          return new Promise((r) => (release = r));
        },
      },
    ],
  });
  const item = f.model().items[0],
    request = {
      notificationId: id,
      revision: item.revision,
      requestId: 'center',
      type: 'invoke',
      actionId: item.actions[0].id,
    };
  const pending = f.act({ type: 'act', request });
  await assert.rejects(f.service.invoke({ ...request, requestId: 'banner' }));
  assert.equal(ran, 1);
  release();
  await pending;
  f.service.end('host.fixture', id);
  await f.historyTab();
  await assert.rejects(f.act({ type: 'act', request: { ...request, requestId: 'ended' } }));
});
test('update result produces a configurable banner once; receipt survives process restarts and suppressed result does not replay', (t) => {
  const f = setup(t);
  const receiptFile = path.join(f.dir, 'receipt.json');
  let calls = 0;
  const bytes = JSON.stringify({ ok: true, time: 'event1' }),
    opts = {
      typed: {
        publish: (owner, type, input) => {
          calls++;
          assert.equal(type, 'applied');
          assert.equal(input.level, 'info');
          assert.ok(input.actions[0].run);
          return { status: 'suppressed', reason: 'type-disabled' };
        },
      },
      receiptFile,
      openDetails: async () => {},
      warn: () => {},
    };
  assert.equal(publishUpdateResult(bytes, opts), true);
  assert.equal(calls, 1);
  assert.equal(publishUpdateResult(bytes, opts), true);
  assert.equal(calls, 1);
  publishUpdateResult(JSON.stringify({ ok: true, time: 'event2' }), opts);
  assert.equal(calls, 2);
  assert.equal(publishUpdateResult(JSON.stringify({ ok: false }), opts), false);
  assert.equal(calls, 2);
  fs.writeFileSync(receiptFile, JSON.stringify({ schemaVersion: 9 }));
  publishUpdateResult(bytes, opts);
  assert.equal(JSON.parse(fs.readFileSync(receiptFile)).schemaVersion, 9);
});

test('removed read/delete operations and unread filters are rejected without changing active or ended records', async (t) => {
  const f = setup(t);
  const id = f.publish();
  const before = f.model();
  for (const type of ['read', 'delete'])
    await assert.rejects(f.act({ type, ids: [id], token: 'old' }), /Unknown center action/);
  await assert.rejects(f.act({ type: 'filters', filters: { ...f.model().filters, unread: true } }));
  assert.deepEqual(f.model(), before);
  assert.equal('read' in before.items[0], false);
  assert.equal('unreadCount' in before, false);
  f.service.end('host.fixture', id);
  await f.historyTab();
  await assert.rejects(f.act({ type: 'delete', scope: 'all', token: 'old' }));
  assert.equal(f.model().historyCount, 1);
  assert.equal('writable' in f.model(), false);
  assert.equal(fs.existsSync(f.file), false);
});
