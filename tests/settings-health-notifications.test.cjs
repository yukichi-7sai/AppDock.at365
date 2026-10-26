const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path');
const { SettingsHealth } = require('../out/main/main/core/settings-health');
const {
  SettingsHealthNotifications,
} = require('../out/main/main/core/settings-health-notifications');
const { ErrorReporter } = require('../out/main/main/core/error-reporter');
const { TypedNotifications } = require('../out/main/main/core/typed-notifications');
const { NotificationService } = require('../out/main/main/core/notification-service');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const {
  notificationCatalog,
  notificationSpeechEnabled,
} = require('../out/main/shared/notification-types');
function fixture(t) {
  const dir = fs.mkdtempSync(path.resolve('.artifacts/settings-health-unit-'));
  let now = 10000,
    restart = false,
    restarts = 0;
  const settings = createDefaultSettings(),
    logs = [],
    publications = [];
  settings.notificationPreferences = { overrides: [] };
  const service = new NotificationService(() => now);
  const typed = new TypedNotifications(service, {
    settings: () => settings,
    applets: () => [],
    generation: () => undefined,
    changed: () => {},
    policyChanged: () => {},
    published: (e) => publications.push(e),
  });
  const reporter = new ErrorReporter({
    notifications: () => typed,
    log: (source, message) => logs.push({ source, message }),
  });
  const health = new SettingsHealth(
    () => {},
    () => now,
  );
  const source = new SettingsHealthNotifications({
    notifications: typed,
    errors: reporter,
    issues: () => health.all(),
    restartRequired: () => restart,
    now: () => now,
    actions: () => [
      {
        key: 'restart',
        label: '再起動',
        run: async () => {
          restarts++;
        },
      },
    ],
  });
  const refresh = () => source.refresh();
  t.after(() => {
    source.dispose();
    typed.dispose();
    service.dispose();
  });
  return {
    health,
    source,
    service,
    typed,
    reporter,
    settings,
    logs,
    publications,
    refresh,
    advance: (ms) => {
      now += ms;
      refresh();
    },
    restart: (v) => {
      restart = v;
      refresh();
    },
    restarts: () => restarts,
    active: () => service.list().filter((i) => i.status === 'active'),
    disable: (ownerId, enabled) => {
      settings.notificationPreferences.overrides = [
        {
          ownerKind: 'host',
          ownerId,
          typeId: ownerId === 'settings' ? 'restart-required' : 'operation-failed',
          enabled,
        },
      ];
      typed.reconcile();
      refresh();
    },
  };
}
test('read errors wait two seconds, transient writes stay silent and startup failures are immediate', (t) => {
  const f = fixture(t);
  f.health.set('read', 'read-invalid', 0, false);
  f.refresh();
  f.advance(1500);
  assert.equal(f.active().length, 0);
  f.health.clear('read');
  f.refresh();
  f.advance(1000);
  assert.equal(f.logs.length, 0);
  f.health.set('read', 'read-invalid', 0, false);
  f.refresh();
  f.advance(2000);
  assert.equal(f.active().length, 1);
  assert.match(f.active()[0].body, /再起動だけでは修復されません/);
  f.health.clear('read');
  f.refresh();
  assert.equal(f.active().length, 0);
  f.health.set('read', 'read-invalid');
  f.refresh();
  assert.equal(f.active().length, 1);
});
test('one settings episode updates causes without resetting expiry or speaking twice; expiration never resurrects it', (t) => {
  const f = fixture(t);
  f.settings.notificationPreferences.overrides.push({
    ownerKind: 'host',
    ownerId: 'errors',
    typeId: 'operation-failed',
    durationSeconds: 10,
  });
  f.health.set('save', 'save-failed');
  f.refresh();
  const first = f.active()[0];
  f.advance(1000);
  f.health.set('backup', 'backup-failed');
  f.refresh();
  assert.equal(f.active()[0].id, first.id);
  assert.equal(f.active()[0].expiresAt, first.expiresAt);
  assert.equal(f.publications.length, 1);
  assert.equal(f.logs.length, 2);
  f.advance(10000);
  assert.equal(f.active().length, 0);
  f.health.clear('backup');
  f.refresh();
  assert.equal(f.logs.length, 3);
  assert.equal(f.active().length, 0);
  f.health.clear('save');
  f.refresh();
  f.health.set('save', 'save-failed');
  f.refresh();
  assert.equal(f.active().length, 1);
});
test('obsolete OFF preferences do not suppress error episodes or recovery state', (t) => {
  const f = fixture(t);
  f.disable('errors', false);
  f.health.set('read', 'read-invalid');
  f.refresh();
  assert.equal(f.logs.length, 1);
  assert.equal(f.active().length, 1);
  f.disable('errors', true);
  assert.equal(f.active().length, 1);
  assert(f.health.has('read'));
  f.health.clear('read');
  f.refresh();
  f.health.set('read', 'read-invalid');
  f.refresh();
  assert.equal(f.active().length, 1);
  f.disable('errors', false);
  f.disable('errors', true);
  assert.equal(f.active().length, 1);
});
test('restart required resolves on revert and ignores obsolete OFF preferences', (t) => {
  const f = fixture(t);
  const type = notificationCatalog([]).find((i) => i.ownerId === 'settings');
  assert.equal(notificationSpeechEnabled(type, f.settings), false);
  f.restart(true);
  assert.equal(f.active()[0].dismissible, false);
  assert.equal(f.active()[0].expiresAt, undefined);
  assert.equal(f.active()[0].actions[0].label, '再起動');
  f.restart(false);
  assert.equal(f.active().length, 0);
  f.disable('settings', false);
  f.restart(true);
  f.disable('settings', true);
  assert.equal(f.active().length, 1);
  f.restart(false);
  f.restart(true);
  assert.equal(f.active().length, 1);
});
test('AI jobs and settings have separate error episodes and resolving settings preserves AI failure', (t) => {
  const f = fixture(t);
  f.health.set('save', 'save-failed');
  f.refresh();
  f.reporter.report({
    source: 'ai',
    eventId: 'job',
    title: 'AI文章生成に失敗しました',
    message: '安全な原因',
    code: 'AI_FAILED',
  });
  assert.equal(f.active().length, 2);
  f.health.clear('save');
  f.refresh();
  assert.equal(f.active().length, 1);
  assert.match(f.active()[0].body, /AI_FAILED/);
});

test('dismissal ends only the notice; later causes stay logged without resurrecting the episode', async (t) => {
  const f = fixture(t);
  f.health.set('read', 'read-invalid');
  f.refresh();
  const item = f.active()[0];
  await f.service.invoke({
    notificationId: item.id,
    revision: item.revision,
    requestId: 'dismiss-settings',
    type: 'dismiss',
  });
  f.health.set('save', 'save-failed');
  f.refresh();
  assert.equal(f.active().length, 0);
  assert.equal(f.logs.length, 2);
  assert(f.health.has('read'));
});
