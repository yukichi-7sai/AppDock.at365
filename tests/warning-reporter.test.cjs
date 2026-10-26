const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path');
const { WarningReporter } = require('../out/main/main/core/warning-reporter');
const { ErrorReporter } = require('../out/main/main/core/error-reporter');
const { TypedNotifications } = require('../out/main/main/core/typed-notifications');
const { NotificationService } = require('../out/main/main/core/notification-service');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const {
  notificationCatalog,
  notificationSpeechEnabled,
} = require('../out/main/shared/notification-types');
const owner = { ownerKind: 'host', ownerId: 'warnings', typeId: 'attention-required' };
const warning = {
  eventId: 'condition-1',
  source: 'storage',
  title: '確認が必要です',
  code: 'LEGACY_LOCAL_DATA',
  message: '詳細を確認してください。',
  logDetails: ['整理対象: C:\\fixture\\data\\storage'],
};
function fixture(t) {
  fs.mkdirSync('.artifacts', { recursive: true });
  const dir = fs.mkdtempSync(path.resolve('.artifacts/warning-unit-'));
  let now = 10000;
  const settings = createDefaultSettings(),
    logs = [],
    publications = [];
  settings.host.notifications = false;
  const service = new NotificationService(() => now);
  const typed = new TypedNotifications(service, {
    settings: () => settings,
    applets: () => [],
    generation: () => undefined,
    changed() {},
    policyChanged() {},
    published: (v) => publications.push(v),
  });
  const reporter = new WarningReporter({
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
    publications,
    reporter,
    typed,
    service,
    active: () => service.list().filter((i) => i.status === 'active'),
    advance: (ms) => {
      now += ms;
      service.expire();
    },
    prefs: (value) => {
      settings.notificationPreferences = { overrides: [{ ...owner, ...value }] };
      typed.reconcile();
    },
  };
}
test('warnings have independent preferences and safe history; details stay in local warning logs', (t) => {
  const f = fixture(t),
    type = notificationCatalog([]).find((n) => n.ownerId === 'warnings');
  assert.equal(type.title, '警告通知');
  assert.deepEqual(
    notificationCatalog([])
      .slice(0, 2)
      .map((n) => n.ownerId),
    ['errors', 'warnings'],
  );
  assert.equal(type.defaultDurationSeconds, null);
  assert.deepEqual(type.defaultTargets, ['banner', 'desktop']);
  assert.deepEqual(type.requiredTargets, ['banner']);
  assert.equal(notificationSpeechEnabled(type, f.settings), false);
  const episode = f.reporter.episode();
  episode.update(warning);
  episode.update(warning);
  assert.equal(f.active().length, 1);
  assert.equal(f.active()[0].level, 'warning');
  assert.equal(f.active()[0].expiresAt, undefined);
  assert.equal(f.logs.length, 2);
  assert.equal(f.publications.length, 1);
  assert(!JSON.stringify(f.service.historyEntries()).includes('C:\\fixture'));
  assert(!f.active()[0].body.includes('C:\\fixture'));
  f.prefs({ targets: [], durationSeconds: null });
  assert.deepEqual(f.active()[0].targets, ['banner']);
  f.prefs({ enabled: false });
  episode.update({ ...warning, logDetails: ['整理対象: C:\\fixture\\data\\secrets'] });
  assert.equal(f.logs.length, 4);
  f.prefs({ enabled: true });
  episode.update(warning);
  assert.equal(f.active().length, 1);
  const errors = new ErrorReporter({ notifications: () => f.typed, log() {} });
  f.prefs({ enabled: false });
  errors.report({ ...warning, eventId: 'failure' });
  assert(f.active().some((n) => n.ownerId === 'errors'));
  assert(f.active().some((n) => n.ownerId === 'warnings'));
});
test('content changes keep ID and expiry; expiry and dismissal suppress until resolution and recurrence', async (t) => {
  const f = fixture(t),
    episode = f.reporter.episode();
  f.prefs({ durationSeconds: 10 });
  episode.update(warning);
  const first = f.active()[0];
  f.advance(1000);
  episode.update({ ...warning, message: '対象が増えました。' });
  assert.equal(f.active()[0].id, first.id);
  assert.equal(f.active()[0].expiresAt, first.expiresAt);
  assert.equal(f.publications.length, 1);
  f.advance(10000);
  episode.update(warning);
  assert.equal(f.active().length, 0);
  episode.resolve();
  episode.update(warning);
  assert.equal(f.active().length, 0);
  const recurrent = f.reporter.episode();
  recurrent.update({ ...warning, eventId: 'condition-2' });
  const current = f.active()[0];
  await f.service.invoke({
    notificationId: current.id,
    revision: current.revision,
    requestId: 'dismiss',
    type: 'dismiss',
  });
  recurrent.update({ ...warning, message: '原因が変わりました。' });
  assert.equal(f.active().length, 0);
  assert.equal(f.publications.length, 2);
});
test('obsolete OFF values do not suppress warnings; resolution affects only its own warning', (t) => {
  const f = fixture(t),
    a = f.reporter.episode(),
    b = f.reporter.episode();
  f.prefs({ enabled: false });
  a.update(warning);
  f.prefs({ enabled: true });
  a.update(warning);
  assert.equal(f.active().length, 1);
  b.update({ ...warning, eventId: 'independent' });
  a.resolve();
  assert.equal(f.active().length, 1);
  b.resolve();
  assert.equal(f.active().length, 0);
});
test('reporting faults are contained and never retried for the same episode', () => {
  const logs = [];
  let calls = 0;
  const episode = new WarningReporter({
    notifications: () => ({
      publish() {
        calls++;
        throw Error('SECRET');
      },
    }),
    log: (_source, message) => logs.push(message),
  }).episode();
  assert.doesNotThrow(() => episode.update(warning));
  episode.update(warning);
  episode.resolve();
  assert.equal(calls, 1);
  assert(!JSON.stringify(logs).includes('SECRET'));
  assert.doesNotThrow(() =>
    new WarningReporter({
      notifications: () => undefined,
      log() {
        throw Error('disk');
      },
    })
      .episode()
      .update(warning),
  );
});

test('a failed notification accessor logs once while later condition changes remain diagnostic', () => {
  let calls = 0;
  const logs = [];
  const episode = new WarningReporter({
    notifications() {
      calls++;
      throw Error('SECRET');
    },
    log: (_source, message) => logs.push(message),
  }).episode();
  episode.update(warning);
  episode.update(warning);
  episode.update({ ...warning, message: '新しい原因' });
  assert.equal(calls, 1);
  assert.equal(logs.filter((line) => line.includes('警告通知を表示できませんでした')).length, 1);
  assert(logs.some((line) => line.includes('新しい原因')));
  assert(!JSON.stringify(logs).includes('SECRET'));
});
