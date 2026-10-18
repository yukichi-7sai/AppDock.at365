const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { normalizeInputKeys, inputKeysFromEvent } = require('../out/main/shared/input-command');
const { executionAuthorized } = require('../out/main/main/core/execution-permissions');
const { AutomationService } = require('../out/main/main/core/automation');
const fs = require('node:fs'),
  path = require('node:path');

test('new MCP execution grants persist independently, require execution and default OFF when absent', async (t) => {
  const base = path.resolve('.artifacts/input-permission-unit');
  fs.mkdirSync(base, { recursive: true });
  const dir = fs.mkdtempSync(path.join(base, 'case-'));
  const options = {
    localDirectory: dir,
    baseDirectory: dir,
    version: 'test',
    encrypt: (v) => v,
    decrypt: (v) => v,
    changed: () => {},
    createApi: () => {
      throw Error('unused');
    },
  };
  let service = new AutomationService(options);
  t.after(() => service.close());
  assert.equal(service.state().allowSendInput, false);
  assert.equal(service.state().allowRunProcesses, false);
  await service.action({ kind: 'setInputSending', allowed: true });
  await service.action({ kind: 'setProcessLaunching', allowed: true });
  assert.equal(service.state().allowExecute, false);
  assert.equal(service.state().allowWrite, false);
  const file = path.join(dir, 'automation.json'),
    saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  service.close();
  fs.writeFileSync(file, JSON.stringify({ ...saved, enabled: true }));
  service = new AutomationService(options);
  assert.equal(service.state().allowSendInput, true);
  assert.equal(service.state().allowRunProcesses, true);
  assert.equal(service.allowed('allowSendInput'), false);
  assert.equal(service.allowed('allowRunProcesses'), false);
  await service.action({ kind: 'setExecution', allowed: true });
  assert.equal(service.allowed('allowSendInput'), true);
  assert.equal(service.allowed('allowRunProcesses'), true);
  await service.action({ kind: 'setInputSending', allowed: false });
  assert.equal(service.state().allowRunProcesses, true);
  service.close();
  delete saved.allowSendInput;
  delete saved.allowRunProcesses;
  fs.writeFileSync(file, JSON.stringify(saved));
  service = new AutomationService(options);
  assert.equal(service.state().allowSendInput, false);
  assert.equal(service.state().allowRunProcesses, false);
});
test('sending grammar accepts SDK keys and Win separately from trigger bindings', () => {
  for (const [input, expected] of [
    ['enter', 'Enter'],
    ['f24', 'F24'],
    [' control + shift + t ', 'Ctrl+Shift+T'],
    ['META+E', 'Win+E'],
    ['Alt+Ctrl+Delete', 'Ctrl+Alt+Delete'],
    ['ESC', 'Escape'],
    ['Win', 'Win'],
    ['Win+Pause', 'Win+Pause'],
    ['Win+PrtScn', 'Win+PrintScreen'],
    ['Win+.', 'Win+Period'],
    ['Win+;', 'Win+Semicolon'],
    ['Win+/', 'Win+Slash'],
    ['Win+Plus', 'Win+Plus'],
    ['Win+-', 'Win+Minus'],
  ])
    assert.equal(normalizeInputKeys(input), expected);
  for (const input of [
    '',
    'Ctrl+Ctrl+A',
    'F25',
    'Win+',
    'Ctrl+Unknown',
    'A+B',
    'Ctrl+Win',
    'Win++',
    'A'.repeat(101),
  ])
    assert.throws(() => normalizeInputKeys(input));
});

test('key recording follows sending grammar, including Windows, navigation and composition', () => {
  const event = (key, overrides = {}) => ({
    key,
    code: '',
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...overrides,
  });
  for (const [stroke, expected] of [
    [event('t', { ctrlKey: true, shiftKey: true }), 'Ctrl+Shift+T'],
    [event('e', { metaKey: true }), 'Win+E'],
    [event('ArrowLeft', { altKey: true }), 'Alt+Left'],
    [event('!', { code: 'Digit1', shiftKey: true }), 'Shift+1'],
    [event(' '), 'Space'],
    [event('F24'), 'F24'],
    [event('Tab'), 'Tab'],
    [event('Escape'), 'Escape'],
    [event('Pause'), 'Pause'],
    [event('+'), 'Plus'],
    [event(';', { metaKey: true }), 'Win+Semicolon'],
  ])
    assert.equal(inputKeysFromEvent(stroke), expected);
  for (const key of ['Control', 'Alt', 'Shift', 'Meta', 'Process', 'Dead', 'Unidentified'])
    assert.equal(inputKeysFromEvent(event(key)), null, key);
  assert.equal(inputKeysFromEvent(event('a', { isComposing: true })), null);
});
test('sensitive execution intersects direct caller and root grants', () => {
  const grants = {
    mcp: { read: true, execute: true, sendInput: true, runProcesses: false },
    applet: { read: true, execute: true, sendInput: true, runProcesses: true },
  };
  const resolve = (actor) => grants[actor.kind];
  const context = { apiCaller: { kind: 'applet', appletId: 'test' }, origin: { kind: 'mcp' } };
  assert(executionAuthorized('sendInput', context, resolve));
  assert(!executionAuthorized('runProcesses', context, resolve));
  grants.mcp.sendInput = false;
  assert(!executionAuthorized('sendInput', context, resolve));
  grants.mcp.sendInput = true;
  grants.applet.execute = false;
  assert(!executionAuthorized('sendInput', context, resolve));
  assert(executionAuthorized('sendInput', { origin: { kind: 'local' } }, resolve));
});
