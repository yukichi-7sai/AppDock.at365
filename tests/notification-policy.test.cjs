const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path');
const p = require('../out/main/shared/notification-types');
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema');
const { TypedNotifications } = require('../out/main/main/core/typed-notifications');
const { NotificationService } = require('../out/main/main/core/notification-service');
const definition = (extra) => ({
  typeId: 'message',
  title: 'Message',
  description: 'A test notification',
  levels: ['info', 'warning'],
  defaultLevel: 'info',
  defaultEnabled: true,
  canDisable: true,
  disabledControlReason: '',
  allowedTargets: ['banner', 'desktop', 'windows'],
  defaultTargets: ['banner'],
  requiredTargets: [],
  lifetimePolicy: 'userDuration',
  defaultDurationSeconds: 5,
  history: 'persistent',
  ...extra,
});
const owner = { ownerKind: 'applet', ownerId: 'fixture.notify' };
const row = (extra) => ({ ...owner, typeId: 'message', ...extra });

test('deferred typed notifications publish latest content once at unlock, with a fresh speech deadline', (t) => {
  const f = setup(t);
  f.service.setPaused(true);
  const content = {
    level: 'info',
    title: 'first',
    body: 'body',
    dedupeKey: 'held',
    historyText: { title: 'safe', body: 'safe' },
  };
  const first = f.typed.publish(owner, 'message', content, 'run1');
  f.tick(86400000);
  const second = f.typed.publish(owner, 'message', { ...content, title: 'latest' }, 'run1');
  assert.equal(first.notificationId, second.notificationId);
  assert.equal(f.publications.length, 0);
  f.service.setPaused(false);
  assert.equal(f.publications.length, 1);
  assert.equal(f.publications[0].title, 'latest');
  assert.equal(f.publications[0].createdAt, f.service.list()[0].expiresAt - 5000);
  f.service.setPaused(true);
  f.service.setPaused(false);
  assert.equal(f.publications.length, 1);
});

test('stopped publishers and ended deferred notifications are not replayed on unlock', (t) => {
  const f = setup(t);
  f.service.setPaused(true);
  const content = {
    level: 'info',
    title: 'held',
    body: 'body',
    historyText: { title: 'safe', body: 'safe' },
  };
  const first = f.typed.publish(owner, 'message', content, 'run1');
  f.typed.end(owner, first.notificationId, 'run1');
  f.typed.publish(owner, 'message', content, 'run1');
  f.stop();
  f.service.setPaused(false);
  assert.equal(f.publications.length, 0);
  assert.deepEqual(f.service.targetItems('banner'), []);
});
test('typed Applets expose only declared notifications while legacy-only Applets retain their kind', () => {
  const applets = [
    { id: 'typed', notificationTypes: [definition()] },
    { id: 'legacy' },
    { id: 'empty', notificationTypes: [] },
  ].map((a) => ({ ...a, displayName: a.id, state: 'running', capabilities: ['notifications'] }));
  const kinds = p.notificationCatalog(applets).filter((t) => t.ownerKind === 'applet');
  assert.deepEqual(
    kinds.map((t) => [t.ownerId, t.typeId]),
    [
      ['typed', 'message'],
      ['legacy', 'appdock.legacy'],
      ['empty', 'appdock.legacy'],
    ],
  );
});
function setup(t, definitions = [definition()]) {
  const dir = fs.mkdtempSync(path.resolve('.artifacts/notification-policy-unit-'));
  let clock = 100000,
    generation = 'run1';
  let settings = createDefaultSettings();
  const changes = [];
  const publications = [];
  const applet = {
    id: owner.ownerId,
    displayName: 'Fixture',
    state: 'running',
    notificationTypes: definitions,
  };
  const service = new NotificationService(() => clock);
  const typed = new TypedNotifications(service, {
    settings: () => settings,
    applets: () => [applet],
    generation: () => generation,
    changed: () => {},
    policyChanged: (id) => changes.push(id),
    now: () => clock,
    presented: (event) => publications.push(event),
  });
  t.after(() => {
    typed.dispose();
    service.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return {
    typed,
    service,
    changes,
    publications,
    applet,
    dir,
    settings: () => settings,
    prefs: (r) => {
      settings = { ...settings, notificationPreferences: { overrides: r } };
      typed.reconcile();
    },
    global: (v) => {
      settings.host.notifications = v;
      typed.reconcile();
    },
    stop: () => {
      generation = undefined;
      applet.state = 'stopped';
      typed.reconcile();
    },
    restart: () => {
      generation = 'run2';
      applet.state = 'running';
      typed.reconcile();
    },
    tick: (ms) => {
      clock += ms;
      service.expire();
    },
    advanceWithoutTimer: (ms) => {
      clock += ms;
    },
  };
}
const content = (extra) => ({
  title: 'Message',
  body: 'private detail',
  level: 'info',
  historyText: { title: 'Safe summary', body: 'Safe' },
  dedupeKey: 'episode',
  ...extra,
});
test('declarations reject identity duplication, invalid defaults and fields', () => {
  assert.equal(p.parseNotificationTypes([definition()]).length, 1);
  for (const value of [
    [definition(), definition()],
    [definition({ defaultTargets: ['desktop'], allowedTargets: ['banner'] })],
    [definition({ levels: ['info', 'info'] })],
    [definition({ defaultDurationSeconds: 0 })],
    [definition({ lifetimePolicy: 'condition', defaultDurationSeconds: 5 })],
    [definition({ script: 'untrusted' })],
  ])
    assert.throws(() => p.parseNotificationTypes(value));
  assert.equal(
    p.parseNotificationTypes(
      [
        {
          ...definition(),
          canDisable: false,
          requiredTargets: ['banner'],
          disabledControlReason: 'Required',
        },
      ],
      true,
    ).length,
    1,
  );
});
test('preferences distinguish inheritance and explicit null; reject invalid and duplicate values', () => {
  const settings = createDefaultSettings(),
    type = p
      .notificationCatalog([
        {
          id: owner.ownerId,
          displayName: 'Fixture',
          state: 'stopped',
          notificationTypes: [definition()],
        },
      ])
      .find((t) => t.ownerKind === 'applet' && t.ownerId === owner.ownerId);
  assert.equal(p.resolveNotificationPolicy(type, settings).lifetime.milliseconds, 5000);
  settings.notificationPreferences = p.parseNotificationPreferences({
    overrides: [row({ durationSeconds: null })],
  });
  assert.deepEqual(p.resolveNotificationPolicy(type, settings).lifetime, { type: 'manual' });
  for (const durationSeconds of [0, -1, 1.5, 86401, '5', NaN])
    assert.throws(() => p.parseNotificationPreferences({ overrides: [row({ durationSeconds })] }));
  assert.throws(() => p.parseNotificationPreferences({ overrides: [row({}), row({})] }));
  assert.throws(() => p.parseNotificationPreferences({ overrides: [row({ targets: ['other'] })] }));
  assert.throws(() => p.parseNotificationPreferences({ overrides: [row({ callback: 'no' })] }));
  assert.deepEqual(
    parseSettings({
      ...createDefaultSettings(),
      notificationPreferences: { overrides: [{ ...row({}), ownerId: 'absent.applet' }] },
    }).notificationPreferences.overrides[0].ownerId,
    'absent.applet',
  );
});
test('mandatory condition is enforced for UI saves and externally received overrides', () => {
  const settings = createDefaultSettings(),
    next = structuredClone(settings),
    type = {
      ...definition({
        canDisable: false,
        requiredTargets: ['banner'],
        lifetimePolicy: 'condition',
        defaultDurationSeconds: undefined,
      }),
      ownerKind: 'host',
      ownerId: 'required',
      ownerTitle: 'Host',
      ownerState: 'running',
    };
  next.notificationPreferences = {
    overrides: [
      {
        ownerKind: 'host',
        ownerId: 'required',
        typeId: type.typeId,
        enabled: false,
        targets: [],
        durationSeconds: 1,
      },
    ],
  };
  assert.throws(() => p.validateNotificationPreferenceChanges(next, settings, [type]));
  const resolved = p.resolveNotificationPolicy(type, next);
  assert.equal(resolved.enabled, true);
  assert.deepEqual(resolved.targets, ['banner']);
  assert.deepEqual(resolved.lifetime, { type: 'condition' });
  assert.equal(resolved.dismissible, false);
});
test('obsolete disabling declarations and preferences cannot bypass required banners', () => {
  for (const canDisable of [true, false]) {
    for (const requiredTargets of [[], ['banner']]) {
      const [declared] = p.parseNotificationTypes(
        [
          definition({
            canDisable,
            requiredTargets,
            disabledControlReason: 'Required notification',
          }),
        ],
        true,
      );
      const type = {
        ...declared,
        ownerKind: 'host',
        ownerId: 'fixture',
        ownerTitle: 'Host',
        ownerState: 'running',
      };
      const settings = createDefaultSettings();
      settings.notificationPreferences = {
        overrides: [
          {
            ownerKind: 'host',
            ownerId: 'fixture',
            typeId: declared.typeId,
            enabled: false,
            targets: [],
          },
        ],
      };
      const policy = p.resolveNotificationPolicy(type, settings);
      assert.equal(policy.enabled, true);
      assert.deepEqual(policy.selectedTargets, requiredTargets);
    }
  }
  assert.equal(p.parseNotificationTypes([definition({ requiredTargets: ['banner'] })]).length, 1);
});

test('error preferences can omit banners and obsolete OFF does not suppress notification history', () => {
  const type = p.notificationCatalog([]).find((t) => t.ownerId === 'errors');
  const original = createDefaultSettings();
  for (const targets of [[], ['desktop'], ['windows']]) {
    const next = structuredClone(original);
    next.notificationPreferences = {
      overrides: [{ ownerKind: 'host', ownerId: 'errors', typeId: type.typeId, targets }],
    };
    assert.doesNotThrow(() => p.validateNotificationPreferenceChanges(next, original, [type]));
    assert.deepEqual(p.resolveNotificationPolicy(type, next).targets, targets);
  }
  const disabled = structuredClone(original);
  disabled.notificationPreferences = {
    overrides: [
      {
        ownerKind: 'host',
        ownerId: 'errors',
        typeId: type.typeId,
        enabled: false,
        targets: ['banner'],
      },
    ],
  };
  assert.doesNotThrow(() => p.validateNotificationPreferenceChanges(disabled, original, [type]));
  assert.equal(p.resolveNotificationPolicy(type, disabled).enabled, true);
});

test('all declared targets are available without silently adding a banner', () => {
  const settings = createDefaultSettings(),
    type = { ...definition(), ...owner, ownerTitle: 'Fixture', ownerState: 'running' };
  settings.notificationPreferences = { overrides: [row({ targets: ['desktop', 'windows'] })] };
  assert.deepEqual(p.resolveNotificationPolicy(type, settings).selectedTargets, [
    'desktop',
    'windows',
  ]);
  assert.deepEqual(p.resolveNotificationPolicy(type, settings).targets, ['desktop', 'windows']);
  settings.notificationPreferences = { overrides: [row({ targets: ['windows'] })] };
  assert.equal(p.resolveNotificationPolicy(type, settings).enabled, true);
  assert.deepEqual(p.resolveNotificationPolicy(type, settings).targets, ['windows']);
});
test('typed dedupe isolates kinds but shares the owner quota', (t) => {
  const f = setup(t, [definition(), definition({ typeId: 'other' })]);
  const a = f.typed.publish(owner, 'message', content(), 'run1');
  const b = f.typed.publish(owner, 'other', content(), 'run1');
  assert.notEqual(a.notificationId, b.notificationId);
  for (let i = 0; i < 48; i++) {
    f.tick(100);
    f.typed.publish(owner, i % 2 ? 'message' : 'other', content({ dedupeKey: 'key' + i }), 'run1');
  }
  f.tick(100);
  assert.throws(
    () => f.typed.publish(owner, 'other', content({ dedupeKey: 'overflow' }), 'run1'),
    /capacity/,
  );
  assert.equal(
    f.typed.publish(owner, 'message', content({ body: 'updated' }), 'run1').notificationId,
    a.notificationId,
  );
});
test('old OFF fields are discarded and cannot suppress active or new notifications', (t) => {
  const f = setup(t);
  const first = f.typed.publish(owner, 'message', content(), 'run1');
  f.prefs([row({ enabled: false })]);
  f.global(false);
  assert.equal(f.service.list()[0].status, 'active');
  assert.equal(
    f.typed.publish(owner, 'message', content(), 'run1').notificationId,
    first.notificationId,
  );
  const old = createDefaultSettings();
  old.host.notifications = false;
  old.notificationPreferences = { overrides: [row({ enabled: false, targets: [] })] };
  const parsed = parseSettings(old);
  assert.equal('notifications' in parsed.host, false);
  assert.equal('enabled' in parsed.notificationPreferences.overrides[0], false);
  assert.equal(
    p.resolveNotificationPolicy({ ...definition({ defaultEnabled: false }), ...owner }, parsed)
      .enabled,
    true,
  );
  assert.deepEqual(p.resolveNotificationPolicy({ ...definition(), ...owner }, parsed).targets, []);
  const [declared] = p.parseNotificationTypes([
    definition({ defaultEnabled: false, canDisable: true }),
  ]);
  assert.equal('defaultEnabled' in declared, false);
  assert.equal('canDisable' in declared, false);
});
test('duration change affects new episodes, ordinary updates preserve deadline, explicit restart uses new policy', (t) => {
  const f = setup(t);
  const a = f.typed.publish(owner, 'message', content(), 'run1');
  const due = f.service.list()[0].expiresAt;
  f.prefs([row({ durationSeconds: null })]);
  f.tick(500);
  f.typed.publish(owner, 'message', content({ body: 'ordinary update' }), 'run1');
  assert.equal(f.service.list()[0].expiresAt, due);
  f.typed.publish(owner, 'message', content({ restartTimer: true }), 'run1');
  assert.equal(f.service.list()[0].expiresAt, undefined);
  f.typed.end(owner, a.notificationId, 'run1');
  const b = f.typed.publish(owner, 'message', content(), 'run1');
  assert.equal(f.service.list().find((i) => i.id === b.notificationId).dismissible, true);
});
test('delayed expiry cannot reuse an ended episode duration or fail route reconciliation', (t) => {
  const f = setup(t);
  const a = f.typed.publish(owner, 'message', content(), 'run1');
  f.advanceWithoutTimer(6000);
  f.prefs([row({ durationSeconds: null, targets: ['banner', 'desktop'] })]);
  const b = f.typed.publish(owner, 'message', content(), 'run1');
  assert.notEqual(b.notificationId, a.notificationId);
  assert.equal(f.service.list().find((i) => i.id === a.notificationId).status, 'expired');
  assert.equal(f.service.list().find((i) => i.id === b.notificationId).expiresAt, undefined);
});

test('route changes preserve active ID and deadline including Windows and center-only', (t) => {
  const f = setup(t);
  const a = f.typed.publish(owner, 'message', content(), 'run1');
  const due = f.service.list()[0].expiresAt;
  f.prefs([row({ targets: ['banner', 'desktop'] })]);
  assert.equal(f.service.list()[0].expiresAt, due);
  assert.equal(f.service.list()[0].id, a.notificationId);
  f.prefs([row({ targets: ['desktop'] })]);
  assert.equal(f.service.list()[0].status, 'active');
  assert.equal(f.service.list()[0].expiresAt, due);
  assert.deepEqual(f.service.list()[0].targets, ['desktop']);
  f.prefs([row({ targets: ['windows'] })]);
  assert.equal(f.service.list()[0].status, 'active');
  assert.deepEqual(f.service.list()[0].targets, ['windows']);
  f.prefs([row({ targets: [] })]);
  assert.equal(f.service.list()[0].id, a.notificationId);
  assert.equal(f.service.list()[0].expiresAt, due);
  assert.deepEqual(f.service.list()[0].targets, []);
});
test('stopped generation cannot resolve or replay actions; host updates remain available', async (t) => {
  const f = setup(t);
  let sideEffects = 0;
  f.prefs([row({ durationSeconds: null })]);
  const a = f.typed.publish(
    owner,
    'message',
    content({
      actions: [
        {
          key: 'act',
          label: 'Act',
          run: async () => {
            sideEffects++;
          },
        },
      ],
    }),
    'run1',
  );
  const item = f.service.list().find((i) => i.id === a.notificationId);
  f.stop();
  assert.equal(f.service.list().find((i) => i.id === item.id).status, 'withdrawn');
  assert.equal(f.typed.policy({ ownerKind: 'host', ownerId: 'updates' }, 'applied').enabled, true);
  await assert.rejects(
    f.service.invoke({
      notificationId: item.id,
      revision: item.revision,
      type: 'invoke',
      actionId: item.actions[0].id,
      requestId: 'old',
    }),
  );
  assert.equal(sideEffects, 0);
  f.restart();
  const b = f.typed.publish(owner, 'message', content(), 'run2');
  f.stop();
  f.restart();
  assert.throws(() => f.typed.end(owner, b.notificationId, 'run1'));
  assert.throws(() => f.typed.publish(owner, 'message', content(), 'run1'));
  assert.notEqual(
    f.typed.publish(owner, 'message', content(), 'run2').notificationId,
    b.notificationId,
  );
});
test('rate limit is separate from suppression and does not prevent withdrawal', (t) => {
  const f = setup(t);
  f.prefs([row({ durationSeconds: null })]);
  let a;
  for (let i = 0; i < 20; i++) a = f.typed.publish(owner, 'message', content(), 'run1');
  assert.throws(() => f.typed.publish(owner, 'message', content(), 'run1'), /頻度/);
  f.typed.end(owner, a.notificationId, 'run1');
});
test('safe in-session kind identity remains without callbacks or private body', (t) => {
  const f = setup(t);
  const result = f.typed.publish(owner, 'message', content(), 'run1');
  f.typed.end(owner, result.notificationId, 'run1');
  const rows = f.service.historyEntries();
  assert.equal(JSON.stringify(rows).includes('private detail'), false);
  assert.equal(rows[0].typeId, 'message');
  assert.equal(rows[0].ownerId, owner.ownerId);
  assert.equal(rows[0].status, 'resolved');
  assert.equal(rows[0].actions, undefined);
  assert.equal(fs.existsSync(path.join(f.dir, 'history.json')), false);
});

test('reserved desktop defaults from 0.30 manifests remain readable while the new Shell region requires its API version', (t) => {
  const dir = fs.mkdtempSync(path.resolve('.artifacts/notification-manifest-unit-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'worker.cjs'), 'exports.activate=async()=>{};');
  fs.writeFileSync(path.join(dir, 'notifications.html'), '<html></html>');
  const manifest = {
    apiVersion: 1,
    id: 'fixture.compat',
    name: 'Fixture',
    version: '1.0.0',
    runtime: 'node',
    entry: 'worker.cjs',
    minimumHostVersion: '0.30.0',
    capabilities: ['notifications', 'shell'],
    notificationTypes: [definition({ defaultTargets: ['desktop'] })],
  };
  const write = () => fs.writeFileSync(path.join(dir, 'extension.json'), JSON.stringify(manifest));
  write();
  const { readManifest } = require('../out/main/main/core/extensions');
  assert.deepEqual(readManifest(dir).notificationTypes[0].defaultTargets, ['desktop']);
  manifest.shell = { apiVersion: 1, views: { 'notification.desktop': 'notifications.html' } };
  write();
  assert.throws(() => readManifest(dir), /0.31.1/);
  manifest.minimumHostVersion = '0.31.1';
  write();
  assert.equal(readManifest(dir).shell.views['notification.desktop'], 'notifications.html');
});
