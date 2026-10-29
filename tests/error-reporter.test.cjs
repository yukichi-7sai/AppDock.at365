const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path');
const { ErrorReporter } = require('../out/main/main/core/error-reporter');
const { NotificationService } = require('../out/main/main/core/notification-service');
const { TypedNotifications } = require('../out/main/main/core/typed-notifications');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const {
  notificationCatalog,
  notificationSpeechEnabled,
} = require('../out/main/shared/notification-types');
const owner = { ownerKind: 'host', ownerId: 'errors', typeId: 'operation-failed' };
const failure = {
  eventId: 'job-one',
  source: 'host',
  title: 'AI文章生成に失敗しました',
  code: 'AI_OUTPUT_LIMIT',
  message: '出力トークンの上限に達しました。',
};
function setup(t) {
  const dir = fs.mkdtempSync(path.resolve('.artifacts/error-reporter-unit-'));
  let settings = createDefaultSettings();
  settings.host.notifications = false;
  const service = new NotificationService();
  const published = [],
    logs = [];
  const typed = new TypedNotifications(service, {
    settings: () => settings,
    applets: () => [],
    generation: () => undefined,
    changed: () => {},
    policyChanged: () => {},
    published: (e) => published.push(e),
  });
  const reporter = new ErrorReporter({
    notifications: () => typed,
    log: (source, message) => logs.push({ source, message }),
  });
  t.after(() => {
    typed.dispose();
    service.dispose();
  });
  return {
    service,
    typed,
    reporter,
    published,
    logs,
    settings: () => settings,
    prefs: (patch) => {
      settings = { ...settings, notificationPreferences: { overrides: [{ ...owner, ...patch }] } };
      typed.reconcile();
    },
  };
}
test('shared error type uses AppDock preferences and ignores obsolete OFF values and logs once', (t) => {
  const f = setup(t),
    type = notificationCatalog([]).find((n) => n.ownerId === 'errors');
  assert.equal(type.title, 'エラー通知');
  assert.equal(type.defaultDurationSeconds, null);
  assert.deepEqual(type.defaultTargets, ['banner']);
  assert.deepEqual(type.requiredTargets, []);
  assert.equal('canDisable' in type, false);
  assert.equal(notificationSpeechEnabled(type, f.settings()), false);
  f.reporter.report(failure);
  f.reporter.report(failure);
  assert.equal(f.logs.length, 1);
  assert.equal(f.published.length, 1);
  const first = f.service.list().find((n) => n.typeId === owner.typeId);
  assert.equal(first.level, 'error');
  assert.equal(first.expiresAt, undefined);
  assert.deepEqual(first.targets, ['banner']);
  assert.match(first.body, /AI_OUTPUT_LIMIT/);
  f.prefs({ targets: ['banner'], durationSeconds: 20 });
  assert.deepEqual(f.service.list().find((n) => n.id === first.id).targets, ['banner']);
  f.reporter.report({ ...failure, eventId: 'job-two', source: 'fixture.applet' });
  assert.equal(f.published.length, 2);
  f.prefs({ enabled: false });
  f.reporter.report({ ...failure, eventId: 'job-three' });
  assert.equal(f.logs.length, 3);
  assert.equal(f.published.length, 3);
  f.prefs({ enabled: true, targets: [] });
  assert.equal(f.service.list().filter((n) => n.status === 'active').length, 3);
  f.reporter.report({ ...failure, eventId: 'job-four' });
  const active = f.service.list().filter((n) => n.status === 'active');
  assert.equal(active.length, 4);
  assert.deepEqual(active[0].targets, []);
  assert.equal(f.logs.length, 4);
});
test('reporting faults never recurse, retry, or replace the operation result', () => {
  const logs = [];
  let calls = 0;
  const reporter = new ErrorReporter({
    notifications: () => ({
      publish: () => {
        calls++;
        throw Error('private transport failure');
      },
    }),
    log: (_source, message) => logs.push(message),
  });
  assert.doesNotThrow(() => reporter.report(failure));
  reporter.report(failure);
  assert.equal(calls, 1);
  assert.equal(logs.length, 2);
  assert(!JSON.stringify(logs).includes('private transport failure'));
  assert.doesNotThrow(() =>
    new ErrorReporter({
      notifications: () => undefined,
      log: () => {
        throw Error('disk');
      },
    }).report(failure),
  );
});
