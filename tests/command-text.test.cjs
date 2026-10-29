const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseCommandText,
  commandTextPlain,
  commandTextIds,
  commandReferences,
} = require('../out/main/shared/command-text');
const { validSettingsPaletteRequest } = require('../out/main/shared/overlays');
const { settingsCatalog, searchSettings } = require('../out/main/shared/settings-catalog');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');

test('command tags keep order, duplicates and plain text while escapes remain literal', () => {
  assert.deepEqual(parseCommandText('前 [command:a] と [command:a] 後'), [
    { kind: 'text', text: '前 ' },
    { kind: 'command', id: 'a' },
    { kind: 'text', text: ' と ' },
    { kind: 'command', id: 'a' },
    { kind: 'text', text: ' 後' },
  ]);
  assert.deepEqual(parseCommandText('\\[command:a] \\\\[command:b]'), [
    { kind: 'text', text: '[command:a] \\[command:b]' },
  ]);
  for (const text of [
    '[command:]',
    '[command: a]',
    '[command:constructor]',
    '[command:__proto__]',
    '[Command:a]',
    '[command:a',
    '[command:x[command:b]]',
    '<img src=x onerror=alert(1)>',
  ]) {
    assert.deepEqual(parseCommandText(text), [{ kind: 'text', text }], text);
  }
});
test('names resolve from exact IDs without recursively parsing names or leaking command data', () => {
  const commands = [
    {
      id: 'a',
      title: '[command:b]',
      available: false,
      disabledReason: 'stopped',
      config: 'private',
    },
    { id: 'b', title: 'Hidden', available: true, hidden: true },
  ];
  const refs = commandReferences(
    commandTextIds(['[command:a] [command:b] [command:missing]']),
    commands,
  );
  assert.deepEqual(refs, [
    { id: 'a', title: '[command:b]', available: false, disabledReason: 'stopped' },
  ]);
  assert.equal(
    commandTextPlain('[command:a] [command:missing]', new Map(refs.map((c) => [c.id, c]))),
    '[command:b] missing',
  );
});
test('settings palette accepts targeted opening without widening direct execution arguments', () => {
  assert(
    validSettingsPaletteRequest({ requestId: 'test', mode: 'execute', initialCommandId: 'a' }),
  );
  assert(validSettingsPaletteRequest({ requestId: 'test', mode: 'select', commandIds: ['a'] }));
  for (const extra of [
    { commandIds: ['a'] },
    { pins: [] },
    { shortcuts: {} },
    { args: {} },
    { initialCommandId: '__proto__' },
  ])
    assert(
      !validSettingsPaletteRequest({
        requestId: 'test',
        mode: 'execute',
        initialCommandId: 'a',
        ...extra,
      }),
    );
  assert(!validSettingsPaletteRequest({ requestId: 'test', mode: 'execute' }));
});
test('search uses current command names and IDs while the original metadata and saved values stay intact', () => {
  const value = createDefaultSettings();
  const raw = '[command:target.action] の待機時間';
  const applets = [
    {
      id: 'fixture.tags',
      displayName: 'Tags',
      commands: [],
      settings: [{ key: 'delay', title: '待機', type: 'number', default: 1, description: raw }],
      settingOptions: {},
      enabled: false,
      state: 'stopped',
    },
  ];
  const before = JSON.stringify({ value, applets });
  const references = [{ id: 'target.action', title: '新しい操作名', available: false }];
  const pages = settingsCatalog(applets, value, references);
  const results = searchSettings(pages, '新しい操作名');
  assert(
    results.some((row) => row.pageId === 'applet:fixture.tags' && row.key === 'setting:delay'),
  );
  assert(!results.find((row) => row.key === 'setting:delay').description.includes('[command:'));
  assert(searchSettings(pages, 'target.action').some((row) => row.key === 'setting:delay'));
  assert.equal(
    pages.find((p) => p.owner === 'fixture.tags').items.find((i) => i.key === 'setting:delay')
      .definition.description,
    raw,
  );
  assert.equal(JSON.stringify({ value, applets }), before);
});
