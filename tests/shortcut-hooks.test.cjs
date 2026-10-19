const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeShortcut, shortcutFromEvent } = require('../out/main/shared/commands');
const {
  parseKeybindings,
  parseKeybindingDefaults,
  globalShortcutInputs,
  resolveKeybindings,
  changeKeybindingKey,
  applyKeybindingOrder,
  protectedShortcut,
} = require('../out/main/shared/keybindings');
const { normalizeGesture } = require('../out/main/shared/gestures');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const { GlobalHotKeyManager } = require('../out/main/main/core/global-hotkeys');
const row = (id, block, extra = {}) => ({
  id,
  command: 'test.' + id,
  key: 'Win+W',
  enabled: true,
  when: { scope: 'global', appletIds: [] },
  ...(block === undefined ? {} : { blockOriginalInput: block }),
  ...extra,
});
test('Win aliases and events normalize without changing old key notation', () => {
  assert.equal(normalizeShortcut('windows+ctrl+w'), 'Ctrl+Win+W');
  assert.equal(normalizeShortcut('Meta+shift+F12'), 'Shift+Win+F12');
  assert.equal(normalizeShortcut('alt+ctrl+x'), 'Ctrl+Alt+X');
  assert.equal(
    shortcutFromEvent({
      key: 'w',
      code: 'KeyW',
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: true,
    }),
    'Win+W',
  );
  assert.equal(
    shortcutFromEvent({
      key: 'Meta',
      code: 'MetaLeft',
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: true,
    }),
    null,
  );
  assert.throws(() => normalizeShortcut('Win+Meta+W'));
});
test('legacy omission is preserved while explicit passthrough round trips', () => {
  const source = [row('old'), row('pass', false)];
  assert.deepEqual(parseKeybindings(source), source);
  assert.equal(Object.hasOwn(parseKeybindings(source)[0], 'blockOriginalInput'), false);
  for (const value of [null, 0, 'false'])
    assert.throws(() => parseKeybindings([row('bad', value)]));
  const defaults = source.map(({ id, ...value }) => value);
  assert.deepEqual(
    parseKeybindingDefaults(
      defaults,
      source.map((r) => r.command),
    ),
    defaults,
  );
});
test('protected global combinations are rejected and gesture Win exclusion remains explicit', () => {
  for (const key of ['Win+L', 'Shift+Win+L', 'Ctrl+Alt+Delete'])
    assert.equal(protectedShortcut(key), true);
  assert.equal(
    parseKeybindings([row('old', undefined, { key: 'Ctrl+Alt+Delete' })])[0].key,
    'Ctrl+Alt+Delete',
  );
  assert.throws(() => normalizeGesture('key:Win+W'));
  assert.equal(normalizeGesture('key:Ctrl+A'), 'key:Ctrl+A');
});
test('blocking is aggregated only over available enabled globals before command deduplication', () => {
  const rows = [
    row('pass', false),
    row('stop', true),
    row('disabled', true, { enabled: false }),
    row('missing', true),
    row('local', true, { when: { scope: 'app', appletIds: [] } }),
  ];
  assert.deepEqual(globalShortcutInputs(rows, ['test.pass']), [
    { shortcut: 'Win+W', blockOriginalInput: false },
  ]);
  assert.deepEqual(globalShortcutInputs(rows, ['test.pass', 'test.stop']), [
    { shortcut: 'Win+W', blockOriginalInput: true },
  ]);
  assert.deepEqual(globalShortcutInputs([row('old')], ['test.old']), [
    { shortcut: 'Win+W', blockOriginalInput: true },
  ]);
  assert.deepEqual(globalShortcutInputs(rows, ['test.disabled', 'test.local']), []);
  const duplicates = [row('one', false), row('two', true, { command: 'test.one' })];
  assert.equal(globalShortcutInputs(duplicates, ['test.one'])[0].blockOriginalInput, true);
  assert.deepEqual(
    resolveKeybindings(duplicates, 'Win+W', { appFocused: false }, [{ id: 'test.one' }], true),
    ['test.one'],
  );
});
test('key changes and order edits retain explicit passthrough settings', () => {
  const rows = [row('a', false), row('b', true)];
  assert.equal(
    changeKeybindingKey(rows, 'a', 'Win+E').find((r) => r.id === 'a').blockOriginalInput,
    false,
  );
  assert.deepEqual(applyKeybindingOrder(rows, rows, [...rows].reverse()), [...rows].reverse());
});
test('backend receives effective block policy and re-applies block-only changes', async () => {
  const calls = [];
  const manager = new GlobalHotKeyManager(
    {
      async sync(keys, inputs) {
        calls.push(structuredClone(inputs));
        return inputs.map((r) => ({
          shortcut: r.shortcut,
          registered: true,
          backend: 'hook',
          effectiveBlockOriginalInput: r.blockOriginalInput,
        }));
      },
      async close() {},
    },
    async () => {},
    () => {},
    assert.fail,
  );
  const settings = createDefaultSettings();
  settings.keybindings = [row('a', false), row('b')];
  await manager.sync(settings, ['test.a']);
  assert.equal(calls[0][0].blockOriginalInput, false);
  await manager.sync(settings, ['test.a', 'test.b']);
  assert.equal(calls[1][0].blockOriginalInput, true);
  settings.keybindings[1].blockOriginalInput = false;
  await manager.sync(settings, ['test.a', 'test.b']);
  assert.equal(calls[2][0].blockOriginalInput, false);
  assert.equal(manager.statuses[0].backend, 'hook');
  await manager.sync(settings, ['test.a', 'test.b'], true);
  assert.deepEqual(calls.at(-1), []);
  await manager.close();
});
