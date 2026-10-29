const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const { notificationCatalog } = require('../out/main/shared/notification-types');
const {
  replaceNotificationPreference: save,
} = require('../out/main/shared/notification-preference-edit');
const setup = () => {
  const settings = createDefaultSettings();
  settings.notificationPreferences = { overrides: [] };
  const catalog = notificationCatalog([]);
  const type = catalog[0];
  const row = { ownerKind: type.ownerKind, ownerId: type.ownerId, typeId: type.typeId };
  return { settings, catalog, type, row };
};

test('untouched notification dialog preserves inherited defaults without writing', () => {
  const { settings, catalog, type, row } = setup();
  assert.equal(save(settings, catalog, type, null, row), settings);
  settings.notificationPreferences.overrides = [{ ...row, speak: false }];
  assert.equal(
    save(settings, catalog, type, { ...row, speak: false }, { ...row, speak: false }),
    settings,
  );
});

test('one notification save preserves concurrent unrelated rows, global speech and settings', () => {
  const { settings, catalog, type, row } = setup();
  settings.notificationPreferences.speech = { voice: 'external-voice', speed: 1.5 };
  settings.notificationPreferences.overrides = [
    { ownerKind: 'applet', ownerId: 'missing', typeId: 'old', speak: true },
    {
      ownerKind: catalog[1].ownerKind,
      ownerId: catalog[1].ownerId,
      typeId: catalog[1].typeId,
      mcpEvents: true,
    },
  ];
  const before = structuredClone(settings);
  const next = save(settings, catalog, type, null, {
    ...row,
    targets: ['banner'],
    durationSeconds: 7,
    speak: true,
    mcpEvents: true,
  });
  assert.deepEqual(settings, before);
  assert.deepEqual(
    next.notificationPreferences.overrides.slice(0, 2),
    before.notificationPreferences.overrides,
  );
  assert.deepEqual(next.notificationPreferences.speech, before.notificationPreferences.speech);
  assert.deepEqual(next.host, before.host);
  assert.deepEqual(next.notificationPreferences.overrides[2], {
    ...row,
    targets: ['banner'],
    durationSeconds: 7,
    speak: true,
    mcpEvents: true,
  });
});

test('same notification edited, removed or created elsewhere rejects stale dialog', () => {
  const { settings, catalog, type, row } = setup();
  const original = { ...row, speak: false };
  settings.notificationPreferences.overrides = [{ ...original, speak: true }];
  const snapshot = structuredClone(settings);
  assert.throws(() => save(settings, catalog, type, original, { ...original, mcpEvents: true }));
  assert.throws(() => save(settings, catalog, type, null, row));
  assert.deepEqual(settings, snapshot);
  settings.notificationPreferences.overrides = [];
  assert.throws(() => save(settings, catalog, type, original, { ...original, speak: true }));
});

test('catalog removal and changed delivery rules reject stale dialog; availability does not', () => {
  const { settings, catalog, type, row } = setup();
  assert.throws(() => save(settings, [], type, null, { ...row, speak: true }));
  const changed = catalog.map((entry, index) =>
    index ? entry : { ...entry, requiredTargets: ['banner'] },
  );
  assert.throws(() => save(settings, changed, type, null, { ...row, speak: true }));
  const stopped = catalog.map((entry) => ({
    ...entry,
    ownerState: 'stopped',
    title: 'translated',
  }));
  assert.equal(
    save(settings, stopped, type, null, { ...row, speak: true }).notificationPreferences
      .overrides[0].speak,
    true,
  );
});

test('host validates required targets, permitted targets, duration and row identity before saving', () => {
  const { settings, catalog, type, row } = setup();
  for (const patch of [
    { targets: ['banner', 'unknown'] },
    { durationSeconds: 0 },
    { durationSeconds: 86401 },
    { durationSeconds: '8' },
    { speak: 'yes' },
    { typeId: 'different' },
  ])
    assert.throws(() => save(settings, catalog, type, null, { ...row, ...patch }));
  const required = { ...type, requiredTargets: ['banner'] };
  assert.throws(() => save(settings, [required], required, null, { ...row, targets: [] }));
  assert.deepEqual(
    save(settings, catalog, type, null, { ...row, targets: [] }).notificationPreferences
      .overrides[0].targets,
    [],
  );
  const fixed = { ...type, lifetimePolicy: 'condition', defaultDurationSeconds: undefined };
  assert.throws(() => save(settings, [fixed], fixed, null, { ...row, durationSeconds: 5 }));
  assert.deepEqual(settings.notificationPreferences.overrides, []);
});

test('notification identity is provider and type ID even when labels are identical', () => {
  const { settings, type } = setup();
  const a = {
    ...type,
    ownerKind: 'applet',
    ownerId: 'fixture.a',
    title: 'Same',
    ownerTitle: 'Same',
  };
  const b = { ...a, ownerId: 'fixture.b' };
  const row = { ownerKind: a.ownerKind, ownerId: a.ownerId, typeId: a.typeId, speak: true };
  const next = save(settings, [a, b], a, null, row);
  const result = save(next, [a, b], b, null, { ...row, ownerId: b.ownerId, speak: false });
  assert.equal(result.notificationPreferences.overrides[0].speak, true);
  assert.equal(result.notificationPreferences.overrides[1].speak, false);
});
