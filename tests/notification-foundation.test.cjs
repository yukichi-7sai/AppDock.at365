const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path');
const { NotificationService } = require('../out/main/main/core/notification-service');
function fixture(t) {
  const base = path.resolve(__dirname, '../.artifacts');
  fs.mkdirSync(base, { recursive: true });
  const dir = fs.mkdtempSync(path.join(base, 'notification-unit-'));
  let clock = 1000000;
  const problems = [];
  const service = new NotificationService(() => clock);
  t.after(() => {
    service.dispose();
    assert.ok(dir.startsWith(base + path.sep));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return {
    service,
    dir,
    problems,
    tick: (ms) => {
      clock += ms;
      service.expire();
    },
  };
}
const input = (extra) => ({
  level: 'info',
  title: 'Example',
  body: 'Message',
  lifetime: { type: 'manual' },
  targets: ['banner'],
  dismissible: true,
  history: 'persistent',
  historyText: { title: 'Safe summary', body: 'Safe body' },
  ...extra,
});
const request = (s, id, extra = {}) => {
  const i = s.list().find((i) => i.id === id);
  return {
    notificationId: id,
    revision: i.revision,
    requestId: crypto.randomUUID(),
    type: 'invoke',
    actionId: i.actions[0]?.id,
    ...extra,
  };
};

test('locked startup defers every target and starts timed lifetime at unlock', (t) => {
  const { service: s, tick } = fixture(t);
  s.setPaused(true);
  const id = s.upsert(
    'host.alpha',
    input({
      lifetime: { type: 'timed', milliseconds: 100 },
      targets: ['banner', 'desktop', 'windows'],
    }),
  );
  tick(86400000);
  for (const target of ['banner', 'desktop', 'windows'])
    assert.deepEqual(s.targetItems(target), []);
  assert.equal(s.list()[0].status, 'active');
  assert.equal(s.list()[0].expiresAt, undefined);
  s.setPaused(false);
  for (const target of ['banner', 'desktop', 'windows'])
    assert.equal(s.targetItems(target)[0].id, id);
  tick(99);
  assert.equal(s.list()[0].status, 'active');
  tick(1);
  assert.equal(s.list()[0].status, 'expired');
});

test('lock freezes remaining duration, updates preserve it and explicit restart replaces it', (t) => {
  const { service: s, tick } = fixture(t);
  const row = input({ dedupeKey: 'clock', lifetime: { type: 'timed', milliseconds: 100 } });
  const id = s.upsert('host.alpha', row);
  tick(40);
  s.setPaused(true);
  tick(10000);
  s.upsert('host.alpha', { ...row, body: 'updated' });
  s.setPaused(false);
  tick(59);
  assert.equal(s.list()[0].status, 'active');
  s.setPaused(true);
  s.upsert('host.alpha', { ...row, restartTimer: true });
  tick(10000);
  s.setPaused(false);
  tick(99);
  assert.equal(s.list()[0].status, 'active');
  tick(1);
  assert.equal(s.list()[0].status, 'expired');
  assert.equal(s.list()[0].id, id);
});

test('resolved and withdrawn deferred notices never reappear after unlock', (t) => {
  const { service: s } = fixture(t);
  s.setPaused(true);
  const a = s.upsert('host.alpha', input());
  const b = s.upsert('host.beta', input());
  s.end('host.alpha', a);
  s.withdrawSource('host.beta');
  s.setPaused(false);
  assert.deepEqual(s.targetItems('banner'), []);
  assert.deepEqual(
    s.list().map((i) => i.status),
    ['resolved', 'withdrawn'],
  );
});
test('levels, lifecycle, source identity and independent target projection', (t) => {
  const { service: s } = fixture(t);
  const a = s.upsert(
    'host.alpha',
    input({ level: 'warning', dedupeKey: 'same', targets: ['windows'] }),
  );
  const b = s.upsert('host.beta', input({ level: 'error', dedupeKey: 'same' }));
  assert.equal(s.targetItems('banner').length, 1);
  assert.equal(s.list().length, 2);
  assert.notEqual(a, b);
  assert.equal(s.upsert('host.alpha', input({ dedupeKey: 'same', targets: ['banner'] })), a);
  assert.deepEqual(
    s.targetItems('banner').map((i) => i.id),
    [a, b],
  );
  assert.throws(() => s.end('host.beta', a), /owner/);
  s.end('host.alpha', a);
  assert.notEqual(s.upsert('host.alpha', input({ dedupeKey: 'same' })), a);
  assert.equal(s.historyEntries().length, 3);
});
test('timed deadline survives updates and sleep-like jumps; condition cannot be dismissed', async (t) => {
  const { service: s, tick } = fixture(t);
  const id = s.upsert(
    'host.alpha',
    input({ dedupeKey: 'timed', lifetime: { type: 'timed', milliseconds: 100 } }),
  );
  tick(60);
  s.upsert(
    'host.alpha',
    input({ dedupeKey: 'timed', lifetime: { type: 'timed', milliseconds: 100 } }),
  );
  tick(1000);
  assert.equal(s.list().find((i) => i.id === id).status, 'expired');
  const condition = s.upsert(
    'host.alpha',
    input({ lifetime: { type: 'condition' }, dismissible: false }),
  );
  await assert.rejects(s.invoke(request(s, condition, { type: 'dismiss' })), /閉じられません/);
  s.end('host.alpha', condition);
  await assert.rejects(
    s.invoke({ notificationId: condition, revision: 1, requestId: 'stale', type: 'dismiss' }),
    /更新/,
  );
});
test('operation idempotency across interfaces, busy exclusion and rejection of reused IDs', async (t) => {
  const { service: s } = fixture(t);
  let finish,
    count = 0;
  const id = s.upsert(
    'host.alpha',
    input({
      actions: [
        {
          key: 'run',
          label: 'Run',
          run: () => {
            count++;
            return new Promise((r) => (finish = r));
          },
        },
      ],
    }),
  );
  const r = request(s, id);
  const first = s.invoke(r);
  assert.equal(first, s.invoke(r));
  await assert.rejects(s.invoke(request(s, id)), /処理中/);
  await assert.rejects(s.invoke({ ...r, actionId: 'other' }), /reused/);
  finish();
  await first;
  assert.equal(count, 1);
  assert.equal(s.list()[0].busy, false);
  await assert.rejects(s.invoke({ ...r, requestId: 'old-revision' }), /更新/);
});
test('expiry and withdrawal during an action never resurrect a notification', async (t) => {
  const { service: s, tick } = fixture(t);
  let finish;
  const id = s.upsert(
    'host.alpha',
    input({
      lifetime: { type: 'timed', milliseconds: 50 },
      actions: [{ key: 'run', label: 'Run', run: () => new Promise((r) => (finish = r)) }],
    }),
  );
  const work = s.invoke(request(s, id));
  tick(1000);
  finish();
  await work;
  assert.equal(s.list()[0].status, 'expired');
  assert.deepEqual(s.list()[0].actions, []);
  const next = s.upsert('applet:alpha:generation1', input());
  s.withdrawSource('applet:alpha:generation1');
  assert.equal(s.list().find((i) => i.id === next).status, 'withdrawn');
});
test('failure unlocks an action and permits an explicit retry', async (t) => {
  const { service: s } = fixture(t);
  let count = 0;
  const id = s.upsert(
    'host.alpha',
    input({
      actions: [
        {
          key: 'retry',
          label: 'Retry',
          run: async () => {
            if (++count === 1) throw Error('failure');
          },
        },
      ],
    }),
  );
  await assert.rejects(s.invoke(request(s, id)), /failure/);
  assert.equal(s.list()[0].busy, false);
  await s.invoke(request(s, id));
  assert.equal(count, 2);
  assert.equal(s.list()[0].status, 'active');
});
test('session history retains safe summaries without operations or disk writes and restart starts empty', (t) => {
  const { service: s, dir } = fixture(t);
  const id = s.upsert(
    'host.alpha',
    input({
      title: 'secret value',
      body: 'credential material',
      actions: [{ key: 'unsafe', label: 'Run', run: async () => {} }],
    }),
  );
  const bytes = JSON.stringify(s.historyEntries());
  assert.ok(!bytes.includes('secret value') && !bytes.includes('credential material'));
  assert.ok(!bytes.includes('actions') && !bytes.includes('unsafe'));
  s.end('host.alpha', id);
  assert.equal(s.centerEntries()[0].body, 'Safe body');
  assert.equal(s.list()[0].body, 'Safe body');
  s.dispose();
  assert.deepEqual(s.list(), []);
  const restarted = new NotificationService();
  assert.deepEqual(restarted.centerEntries(), []);
  restarted.dispose();
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('session/none policies, unsupported interfaces and history omission are explicit', (t) => {
  const { service: s } = fixture(t);
  s.upsert('host.alpha', input({ targets: [], history: 'session' }));
  const id = s.upsert('host.alpha', input({ history: 'none' }));
  assert.equal(s.targetItems('banner').length, 1);
  s.end('host.alpha', id);
  assert.equal(s.list().length, 1);
  assert.equal(s.historyEntries().length, 1);
  assert.throws(() => s.upsert('host.alpha', input({ targets: ['unknown'] })), /Invalid/);
  assert.throws(() => s.upsert('host.alpha', input({ historyText: undefined })), /Invalid/);
});
test('notification lifetime works without any history filesystem dependency', (t) => {
  const { service: s, dir } = fixture(t);
  const file = path.join(dir, 'history.json');
  const bytes = '{broken';
  fs.writeFileSync(file, bytes);
  const id = s.upsert('host.alpha', input());
  s.end('host.alpha', id);
  s.dispose();
  assert.equal(fs.readFileSync(file, 'utf8'), bytes);
  assert.deepEqual(fs.readdirSync(dir), ['history.json']);
});

test('session retention bounds persistent and session history together by completion time and preserves active records', (t) => {
  const { service: s, tick } = fixture(t);
  const long = s.upsert('host.alpha', input());
  const active = s.upsert('host.alpha', input({ history: 'none' }));
  let first;
  for (let i = 0; i < 1001; i++) {
    const id = s.upsert('host.alpha', input({ history: i % 2 ? 'session' : 'persistent' }));
    first ??= id;
    tick(1);
    s.end('host.alpha', id);
  }
  assert.equal(s.centerEntries().length, 1002);
  assert.ok(!s.centerEntries().some((i) => i.id === first));
  tick(1);
  s.end('host.alpha', long);
  assert.equal(s.centerEntries().length, 1001);
  assert.ok(s.centerEntries().some((i) => i.id === long));
  assert.equal(s.activeCount, 1);
  assert.equal(s.list().find((i) => i.id === active).status, 'active');
});

test('capacity reserves host slots and permits updates at the owner limit', (t) => {
  const { service: s } = fixture(t);
  for (let i = 0; i < 50; i++)
    s.upsert('applet.alpha', input({ dedupeKey: String(i), history: 'none' }));
  assert.throws(() => s.upsert('applet.alpha', input({ history: 'none' })), /capacity/);
  s.upsert('applet.alpha', input({ dedupeKey: '0', body: 'updated', history: 'none' }));
  assert.equal(s.list().length, 50);
  assert.ok(
    s.upsert('host.settings', input({ lifetime: { type: 'condition' }, dismissible: false })),
  );
});

test('active count tracks unique lifetimes regardless of center visits, targets, pause and dedupe', async (t) => {
  const { service: s, tick } = fixture(t);
  const a = s.upsert(
    'host.alpha',
    input({ dedupeKey: 'same', targets: ['banner', 'desktop', 'windows'] }),
  );
  const b = s.upsert('host.alpha', input({ targets: [], history: 'session' }));
  const c = s.upsert('host.alpha', input({ lifetime: { type: 'timed', milliseconds: 100 } }));
  assert.equal(s.activeCount, 3);
  assert.equal(s.upsert('host.alpha', input({ dedupeKey: 'same', targets: [] }), a), a);
  s.centerEntries();
  assert.equal(s.activeCount, 3);
  s.setPaused(true);
  tick(200);
  assert.equal(s.activeCount, 3);
  s.setPaused(false);
  tick(100);
  assert.equal(s.activeCount, 2);
  assert.equal(s.list().find((i) => i.id === c).status, 'expired');
  await s.invoke(request(s, a, { type: 'dismiss' }));
  assert.equal(s.activeCount, 1);
  s.end('host.alpha', b);
  assert.equal(s.activeCount, 0);
  assert.equal(s.centerEntries().length, 3);
  const d = s.upsert('host.alpha', input({ dedupeKey: 'same' }));
  assert.notEqual(d, a);
  s.withdrawSource('host.alpha');
  assert.equal(s.activeCount, 0);
});

test('notification count uses shared ribbon badges, caps display at 99+ and aggregates into groups', (t) => {
  const { service: s } = fixture(t);
  const {
    UiPresentation,
    NavigationCoordinator,
  } = require('../out/main/main/core/ui-presentation');
  const { createDefaultSettings } = require('../out/main/shared/settings-schema');
  const { ribbonItems } = require('../out/main/shared/applet-pages');
  const { editRibbon } = require('../out/main/shared/ribbon-layout');
  const settings = createDefaultSettings();
  const ui = new UiPresentation({
    settings: () => settings,
    applets: () => [],
    dark: () => false,
    navigation: new NavigationCoordinator(() => {}),
    execute: async () => {},
    theme: async () => {},
    badge: (id) =>
      id === 'notifications' && s.activeCount
        ? { kind: 'count', count: s.activeCount, label: 'アクティブな通知' }
        : null,
  });
  const item = () => ui.get().items.find((i) => i.id === 'notifications');
  assert.equal(item().badge, undefined);
  for (let i = 0; i < 101; i++) s.upsert('host.fixture' + Math.floor(i / 40), input());
  assert.equal(item().badge.text, '99+');
  assert.equal(item().badge.description, 'アクティブな通知: 101');
  settings.ribbon = editRibbon(settings.ribbon, ribbonItems([], [], []), {
    kind: 'addGroup',
    id: 'group:notifications',
    title: 'Notifications',
    icon: 'folder',
    expansion: 'persistent',
    placement: 'top',
  });
  settings.ribbon = editRibbon(
    settings.ribbon,
    ribbonItems([], settings.ribbon.separators, settings.ribbon.groups),
    { kind: 'moveItem', id: 'notifications', parentId: 'group:notifications', beforeId: null },
  );
  assert.equal(ui.get().items.find((i) => i.id === 'group:notifications').badge.kind, 'dot');
  for (let i = 0; i < 3; i++) s.withdrawSource('host.fixture' + i);
  assert.equal(ui.get().items.find((i) => i.id === 'group:notifications').badge, undefined);
});
