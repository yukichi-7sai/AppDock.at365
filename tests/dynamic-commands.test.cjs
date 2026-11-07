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
test('static and dynamic commands accept optional categories and reject invalid category values', () => {
  for (const parse of [parseExtensionCommands, parseDeclaredCommands]) {
    const command = { id: 'test.a', title: 'A' };
    assert.deepEqual(parse('test', [{ ...command, category: '  画像  ' }]), [
      { ...command, category: '画像' },
    ]);
    assert.deepEqual(parse('test', [{ ...command, category: '' }]), [{ ...command, category: '' }]);
    for (const category of [null, 4, {}, 'bad\ntext', 'bad\u0000text'])
      assert.throws(() => parse('test', [{ ...command, category }]));
  }
});
test('runtime catalog inherits manifest categories, applies overrides and preserves aliases', () => {
  const { ExtensionManager } = require('../out/main/main/core/extensions');
  const manager = Object.create(ExtensionManager.prototype);
  manager.canActivateForCommand = () => false;
  manager.shellRequirement = () => undefined;
  manager.settings = { value: { extensions: {} } };
  const extension = {
    manifest: {
      id: 'test.category',
      commands: [
        {
          id: 'test.category.open',
          title: 'Open',
          category: '画像',
          aliases: ['test.category.alias'],
        },
      ],
    },
    commands: [],
    state: 'stopped',
  };
  assert.equal(manager.commandCatalog(extension)[0].category, '画像');
  extension.state = 'running';
  extension.commands = [{ id: 'test.category.open', title: 'Open' }];
  assert.equal(manager.commandCatalog(extension)[0].category, '画像');
  extension.commands[0].category = '';
  assert(manager.commandCatalog(extension).every((command) => command.category === ''));
  extension.commands[0].category = '操作';
  assert(manager.commandCatalog(extension).every((command) => command.category === '操作'));
});
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
    for (const description of [null, 4, 'bad\u0000text'])
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
