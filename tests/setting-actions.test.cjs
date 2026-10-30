const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseSettingActions } = require('../out/main/shared/setting-actions.js');
const commands = [{ id: 'test.applet.apply', title: 'Apply' }];
const action = {
  command: commands[0].id,
  title: 'Apply',
  description: 'Manual instructions',
  successMessage: 'Done',
};
test('settings actions only reference declared commands and keep action data out of settings', () => {
  assert.equal(parseSettingActions(undefined, commands), undefined);
  assert.deepEqual(parseSettingActions([action], commands), [action]);
  for (const value of [
    null,
    {},
    [null],
    [action, action],
    [{ ...action, command: 'appdock.quit' }],
    [{ ...action, command: 'test.applet.undeclared' }],
    [{ ...action, title: ' ' }],
    [{ ...action, description: 12 }],
    [{ ...action, successMessage: '' }],
    Array(17).fill(action),
  ])
    assert.throws(() => parseSettingActions(value, commands));
});
test('attached actions only reference a top-level setting without changing its schema', () => {
  const settings = [{ key: 'font', title: 'Font', type: 'string', default: '' }];
  const before = JSON.stringify(settings);
  const attached = { ...action, settingKey: 'font' };
  assert.deepEqual(parseSettingActions([attached], commands, settings), [attached]);
  assert.equal(JSON.stringify(settings), before);
  for (const settingKey of ['', null, 3, 'missing', 'font.family', '__proto__'])
    assert.throws(() => parseSettingActions([{ ...action, settingKey }], commands, settings));
  assert.throws(() => parseSettingActions([attached], commands));
});
test('action presentation is optional and validates placement, appearance and accessible icons', () => {
  const settings = [{ key: 'font', title: 'Font', type: 'string', default: '' }];
  for (const presentation of [
    { settingKey: 'font', placement: 'below', appearance: 'filled' },
    { settingKey: 'font', placement: 'inline', appearance: 'standard', icon: 'folder' },
    { icon: 'refresh', iconOnly: true },
    { iconOnly: false },
  ]) {
    const declared = { ...action, ...presentation };
    assert.deepEqual(parseSettingActions([declared], commands, settings), [declared]);
  }
  for (const presentation of [
    { placement: 'below' },
    { settingKey: 'font', placement: 'above' },
    { settingKey: 'font', placement: null },
    { appearance: 'gray' },
    { appearance: null },
    { icon: 'unknown' },
    { icon: '<svg />' },
    { icon: null },
    { iconOnly: true },
    { icon: 'refresh', iconOnly: 'true' },
  ])
    assert.throws(() => parseSettingActions([{ ...action, ...presentation }], commands, settings));
});
