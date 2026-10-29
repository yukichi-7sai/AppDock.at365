const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path');
const { InformationReporter } = require('../out/main/main/core/information-reporter');
const { TypedNotifications } = require('../out/main/main/core/typed-notifications');
const { NotificationService } = require('../out/main/main/core/notification-service');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const {
  notificationCatalog,
  resolveNotificationPolicy,
  validateNotificationPreferenceChanges,
  notificationSpeechEnabled,
} = require('../out/main/shared/notification-types');
const owner = { ownerKind: 'host', ownerId: 'information', typeId: 'operation-completed' };
function fixture(t) {
  const directory = fs.mkdtempSync(path.resolve('.artifacts/information-unit-'));
  const settings = createDefaultSettings(),
    logs = [];
  settings.host.notifications = false;
  let now = 10000;
  const service = new NotificationService(() => now);
  const typed = new TypedNotifications(service, {
    settings: () => settings,
    applets: () => [],
    generation: () => undefined,
    changed() {},
    policyChanged() {},
  });
  const reporter = new InformationReporter({
    notifications: () => typed,
    log: (source, message) => logs.push({ source, message }),
  });
  t.after(() => {
    typed.dispose();
    service.dispose();
  });
  return {
    settings,
    logs,
    service,
    typed,
    reporter,
    active: () => service.list().filter((n) => n.status === 'active'),
    advance(ms) {
      now += ms;
      service.expire();
    },
  };
}
test('host notification destinations are optional while default banners, lifetime and speech remain unchanged', () => {
  const types = notificationCatalog([]),
    settings = createDefaultSettings();
  assert.deepEqual(
    types.slice(0, 3).map((t) => t.title),
    ['エラー通知', '警告通知', 'インフォメーション通知'],
  );
  for (const type of types.slice(0, 3)) {
    assert.deepEqual(type.requiredTargets, []);
    assert.deepEqual(type.defaultTargets, ['banner']);
    for (const targets of [[], ['desktop'], ['windows'], ['banner', 'desktop', 'windows']]) {
      settings.notificationPreferences = {
        overrides: [{ ownerKind: 'host', ownerId: type.ownerId, typeId: type.typeId, targets }],
      };
      const before = JSON.stringify(settings);
      assert.deepEqual(resolveNotificationPolicy(type, settings).targets, targets);
      assert.equal(JSON.stringify(settings), before);
      assert.equal(notificationSpeechEnabled(type, settings), false);
      assert.doesNotThrow(() =>
        validateNotificationPreferenceChanges(settings, createDefaultSettings(), types),
      );
    }
  }
  const info = types[2];
  assert.deepEqual(info.defaultTargets, ['banner']);
  assert.equal(info.defaultDurationSeconds, 6);
});
test('completed event is delivered once, expires, ignores obsolete OFF values and can be explicitly repeated', (t) => {
  const f = fixture(t);
  f.reporter.report('test', '保存', '保存しました。', 'one');
  f.reporter.report('test', '保存', '保存しました。', 'one');
  assert.equal(f.active().length, 1);
  assert.equal(f.logs.length, 1);
  assert.equal(f.active()[0].expiresAt, 16000);
  f.advance(6000);
  assert.equal(f.active().length, 0);
  f.reporter.report('test', '保存', '保存しました。', 'one');
  assert.equal(f.active().length, 0);
  f.settings.notificationPreferences = { overrides: [{ ...owner, enabled: false }] };
  f.typed.reconcile();
  f.reporter.report('test', '保存', '保存しました。', 'two');
  assert.equal(f.logs.length, 2);
  f.settings.notificationPreferences.overrides[0].enabled = true;
  f.typed.reconcile();
  f.reporter.report('test', '保存', '保存しました。', 'two');
  assert.equal(f.active().length, 1);
  f.reporter.report('test', '保存', '保存しました。', 'three');
  assert.equal(f.active().length, 2);
});
test('notification and logging failures cannot change operation results or leak raw failures', () => {
  const logs = [];
  let calls = 0;
  const reporter = new InformationReporter({
    log: (_, m) => logs.push(m),
    notifications: () => ({
      publish() {
        calls++;
        throw Error('SECRET');
      },
    }),
  });
  assert.doesNotThrow(() => reporter.report('test', '保存', '保存しました。', 'one'));
  reporter.report('test', '保存', '保存しました。', 'one');
  assert.equal(calls, 1);
  assert(!JSON.stringify(logs).includes('SECRET'));
  assert.doesNotThrow(() =>
    new InformationReporter({
      notifications: () => undefined,
      log() {
        throw Error('SECRET');
      },
    }).report('test', '保存', '保存しました。'),
  );
});
