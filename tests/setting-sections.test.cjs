const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseSettingSections,
  resolveSettingSections,
} = require('../out/main/shared/setting-sections');
const fields = [
  { key: 'enabled', title: 'Enabled', type: 'boolean', default: false },
  { key: 'seconds', title: 'Seconds', type: 'number', default: 10 },
];
const actions = [{ command: 'fixture.refresh', title: 'Refresh' }];
test('attached actions follow their setting and never duplicate in standalone sections', () => {
  const attached = { command: 'fixture.pick', title: 'Pick', settingKey: 'seconds' };
  const all = [...actions, attached];
  const sections = parseSettingSections(
    [{ id: 'timing', title: 'Timing', settings: ['seconds'] }],
    fields,
    all,
  );
  assert.deepEqual(
    resolveSettingSections(fields, all, sections).flatMap((s) => s.actions),
    actions,
  );
  assert.deepEqual(
    resolveSettingSections(fields, [attached]).flatMap((s) => s.actions),
    [],
  );
  assert.throws(() =>
    parseSettingSections(
      [{ id: 'timing', title: 'Timing', settings: ['seconds'], actions: [attached.command] }],
      fields,
      all,
    ),
  );
});
test('section order and references are presentation only; undeclared fields and actions stay visible', () => {
  const before = JSON.stringify({ fields, actions });
  const sections = parseSettingSections(
    [{ id: 'timing', title: 'Timing', settings: ['seconds'], collapsible: true }],
    fields,
    actions,
  );
  const result = resolveSettingSections(fields, actions, sections);
  assert.deepEqual(
    result.map((s) => s.settings.map((f) => f.key)),
    [['seconds'], ['enabled'], []],
  );
  assert.equal(result[2].actions[0], actions[0]);
  assert.equal(result[0].collapsible, true);
  assert.equal(JSON.stringify({ fields, actions }), before);
  assert.equal(parseSettingSections(undefined, fields, actions), undefined);
  assert.deepEqual(resolveSettingSections([], []), []);
  assert.deepEqual(
    resolveSettingSections(fields, actions).map((s) => s.title),
    ['設定', '操作'],
  );
});
test('section declarations reject dangling references, duplicate placement, invalid types and unbounded metadata', () => {
  const s = { id: 'general', title: 'General', settings: ['enabled'] };
  for (const value of [
    null,
    {},
    [{}],
    [{ ...s, id: '__proto__' }],
    [{ ...s, title: ' ' }],
    [{ ...s, title: 'a'.repeat(161) }],
    [{ ...s, description: 1 }],
    [{ ...s, collapsible: 'true' }],
    [{ ...s, settings: ['missing'] }],
    [{ ...s, settings: ['enabled', 'enabled'] }],
    [{ ...s, actions: ['foreign.run'] }],
    [s, { ...s, id: 'other' }],
    [s, { ...s, settings: ['seconds'] }],
    [{ ...s, settings: [] }],
    Array(33).fill(s),
  ]) {
    assert.throws(() => parseSettingSections(value, fields, actions));
  }
  assert.throws(() =>
    parseSettingSections(
      [
        { ...s, actions: ['fixture.refresh'] },
        { id: 'actions', title: 'Actions', actions: ['fixture.refresh'] },
      ],
      fields,
      actions,
    ),
  );
  const sections = parseSettingSections(
    [{ id: 'actions', title: 'Actions', actions: ['fixture.refresh'] }],
    fields,
    actions,
  );
  assert.equal(resolveSettingSections(fields, actions, sections)[0].actions.length, 1);
});
