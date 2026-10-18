const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseExtensionCommands,
  parseDeclaredCommands,
} = require('../out/main/shared/extension-commands.js');
test('declared command activation and aliases validate before discovery', () => {
  const commands = [
    { id: 'test.start', title: 'Start', activateOnExecute: true, aliases: ['test.resume'] },
  ];
  assert.deepEqual(parseDeclaredCommands('test', commands), commands);
  for (const aliases of [['other.start'], ['test.start'], ['test.a', 'test.a'], 'test.a'])
    assert.throws(() => parseDeclaredCommands('test', [{ ...commands[0], aliases }]));
  assert.throws(() =>
    parseDeclaredCommands('test', [{ ...commands[0], activateOnExecute: 'true' }]),
  );
});
test('external access requires a boolean manifest declaration and cannot be granted at runtime', () => {
  const command = { id: 'test.run', title: 'Run', automation: true };
  assert.deepEqual(parseDeclaredCommands('test', [command]), [command]);
  assert.deepEqual(parseDeclaredCommands('test', [{ ...command, automation: false }]), [
    { ...command, automation: false },
  ]);
  for (const automation of ['true', 1, null, {}, []])
    assert.throws(() => parseDeclaredCommands('test', [{ ...command, automation }]));
  for (const id of ['other.run', 'test.run\n', 'test.*'])
    assert.throws(() => parseDeclaredCommands('test', [{ ...command, id }]));
  assert.deepEqual(parseExtensionCommands('test', [command]), [{ id: 'test.run', title: 'Run' }]);
});
const {
  parseSettingDefinitions,
  validateSettingValue,
  validSendKeys,
} = require('../out/main/shared/setting-definitions.js');
test('command replacement validates namespace, duplicates and limits before changing anything', () => {
  assert.deepEqual(parseExtensionCommands('test', [{ id: 'test.a', title: 'A', extra: 1 }]), [
    { id: 'test.a', title: 'A' },
  ]);
  for (const entries of [
    null,
    [{ id: 'other.a', title: 'A' }],
    [{ id: 'test.a', title: '' }],
    [
      { id: 'test.a', title: 'A' },
      { id: 'test.a', title: 'B' },
    ],
    Array.from({ length: 257 }, (_, i) => ({ id: `test.${i}`, title: 'A' })),
  ])
    assert.throws(() => parseExtensionCommands('test', entries));
  assert.equal(
    parseExtensionCommands(
      'test',
      Array.from({ length: 256 }, (_, i) => ({ id: `test.${i}`, title: 'A' })),
    ).length,
    256,
  );
});

test('static and runtime command descriptions use the existing common description validation', () => {
  for (const parse of [parseExtensionCommands, parseDeclaredCommands]) {
    assert.deepEqual(parse('test', [{ id: 'test.a', title: 'A', description: '条件\r\n説明' }]), [
      { id: 'test.a', title: 'A', description: '条件\n説明' },
    ]);
    for (const description of [null, 4, 'x'.repeat(1001), 'bad\u0000text'])
      assert.throws(() => parse('test', [{ id: 'test.a', title: 'A', description }]));
  }
});
test('shortcut-list validates live editable entries and preserves stable IDs', () => {
  const [definition] = parseSettingDefinitions([
    { key: 'keys', title: 'Keys', type: 'shortcut-list', default: [] },
  ]);
  assert.doesNotThrow(() =>
    validateSettingValue(definition, [{ id: 'new-tab', title: 'New tab', keys: 'Ctrl+T' }]),
  );
  for (const value of [
    null,
    '[]',
    [{}],
    [{ id: 'Bad.ID', title: 'X', keys: 'A' }],
    [{ id: 'a', title: 'X', keys: 'Ctrl+Ctrl+A' }],
    [{ id: 'a', title: 'X', keys: '%{F4}' }],
    [
      { id: 'a', title: 'X', keys: 'A' },
      { id: 'a', title: 'Y', keys: 'B' },
    ],
  ])
    assert.throws(() => validateSettingValue(definition, value));
  for (const key of ['Ctrl+Shift+T', 'Alt+F4', 'Win+Left', 'F24', 'Control+Enter'])
    assert.equal(validSendKeys(key), true);
  for (const key of ['Ctrl+', 'F25', 'Ctrl+Control+A', '', 'A+B'])
    assert.equal(validSendKeys(key), false);
});
