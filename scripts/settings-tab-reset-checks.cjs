const assert = require('node:assert/strict');
const path = require('node:path');
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema');
const { getKeybindings } = require('../out/main/shared/keybindings');
const { settingsStorageValue } = require('../out/main/shared/settings-storage');
const durable = (value) => parseSettings(settingsStorageValue(value));

module.exports = async ({ host, open, save, saved, checks, profile }) => {
  const baseline = await saved();
  baseline.keybindingOptions.executionMode = 'first';
  baseline.keybindingOptions.inputExecutionModes = { 'Ctrl+F8': 'all' };
  baseline.gestures.executionMode = 'first';
  baseline.gestures.inputExecutionModes = { 'move-up': 'all' };
  baseline.touchpadGestures.executionMode = 'first';
  baseline.touchpadGestures.inputExecutionModes = { 'four.right': 'all' };
  baseline.touchpadGestures.connections['three.tap'].modifiers = ['Ctrl'];
  baseline.commandTriggerOptions.browsers = ['custom-browser'];
  baseline.host.soundEnabled = false;
  const defaults = createDefaultSettings();
  const kinds = [
    ['shortcuts', 'keybindingOptions', 'キージェスチャー'],
    ['gestures', 'gestures', 'マウスジェスチャー'],
    ['touchpad-gestures', 'touchpadGestures', 'タッチパッドジェスチャー'],
  ];
  const restore = async (value = baseline) => {
    await host.evaluate(async (value) => {
      const snapshot = await window.dock.snapshot();
      await window.dock.saveSettings(value, snapshot.settings.revision);
    }, value);
    await save();
  };
  const resetTriggers = (value, key) => {
    if (key === 'keybindingOptions') value.keybindings = getKeybindings(defaults);
    else value[key].bindings = defaults[key].bindings;
    value[key].inputExecutionModes = {};
  };
  const dialog = () => host.getByTestId('settings-dialog');
  const showReset = async () => {
    await host.getByRole('button', { name: 'このタブの設定を既定値に戻す', exact: true }).click();
    await dialog().waitFor();
  };
  const apply = async () => {
    await dialog().getByTestId('settings-dialog-confirm').click();
    await dialog().waitFor({ state: 'hidden' });
    await save();
  };
  for (const [kind, key, title] of kinds) {
    for (const view of ['command-tab', 'triggers', 'form']) {
      await restore();
      await open(view === 'command-tab' ? 'command-triggers' : kind);
      await host
        .getByTestId(
          view === 'command-tab' ? `command-trigger-tab:${kind}` : `gesture-settings-tab:${view}`,
        )
        .click();
      await showReset();
      assert.match(await dialog().innerText(), new RegExp(title));
      assert.match(
        await dialog().innerText(),
        view === 'form' ? /フォーム/ : view === 'triggers' ? /トリガー一覧/ : /コマンドトリガー/,
      );
      const expected = structuredClone(baseline);
      if (view === 'form') {
        for (const field of Object.keys(defaults[key]))
          if (!['bindings', 'inputExecutionModes'].includes(field))
            expected[key][field] = defaults[key][field];
        expected.commandTriggerOptions = defaults.commandTriggerOptions;
        assert.match(await dialog().innerText(), /キー・マウス・タッチパッドすべてに反映/);
      } else resetTriggers(expected, key);
      if (kind === 'touchpad-gestures' && view === 'triggers')
        assert.doesNotMatch(await dialog().innerText(), /このPC用/);
      if (view === 'command-tab' && kind === 'shortcuts') {
        await dialog().getByTestId('settings-dialog-cancel').click();
        assert.deepEqual(await saved(), parseSettings(baseline));
        await showReset();
        checks.push('cancel leaves every tab unchanged');
      }
      if (view === 'form' && kind === 'gestures')
        await host.screenshot({ path: path.join(profile, 'form-reset-confirmation.png') });
      await apply();
      assert.deepEqual(
        await saved(),
        parseSettings(expected),
        `${kind}/${view} changes only its scope`,
      );
      checks.push(`${kind}/${view} confirmation and isolated durable reset`);
    }
  }
  await restore();
  await open('command-triggers');
  await host.getByTestId('command-trigger-tab:commands').click();
  await showReset();
  assert.match(await dialog().innerText(), /コマンド一覧/);
  const allTriggers = structuredClone(baseline);
  for (const [, key] of kinds) resetTriggers(allTriggers, key);
  await apply();
  assert.deepEqual(durable(await saved()), durable(allTriggers));
  checks.push('command overview resets all three trigger types and retains custom definitions');

  await restore();
  await open('gestures');
  await host.getByRole('button', { name: 'JSON', exact: true }).click();
  await host.getByRole('button', { name: 'このページを既定値に戻す', exact: true }).click();
  assert.match(await dialog().innerText(), /JSON/);
  const jsonReset = structuredClone(baseline);
  jsonReset.gestures = defaults.gestures;
  jsonReset.commandTriggerOptions = defaults.commandTriggerOptions;
  await apply();
  assert.deepEqual(await saved(), parseSettings(jsonReset));
  checks.push('JSON reset covers the displayed page including behavior and assignments');

  await restore();
  await open('shortcuts');
  await host.getByTestId('gesture-settings-tab:triggers').click();
  await showReset();
  const changed = structuredClone(baseline);
  changed.gestures.distance = 88;
  await restore(changed);
  await dialog().getByTestId('settings-dialog-confirm').click();
  await dialog()
    .getByText(/設定.*変更|確認.*変更|変更.*確認/)
    .first()
    .waitFor();
  assert.deepEqual(await saved(), parseSettings(changed));
  await dialog().getByTestId('settings-dialog-cancel').click();
  checks.push('external changes reject the stale confirmation without discarding values');

  await open('appearance');
  await host.getByRole('button', { name: 'このページを既定値に戻す', exact: true }).click();
  await host.getByRole('dialog', { name: 'このページを既定値に戻す', exact: true }).waitFor();
  await dialog().getByTestId('settings-dialog-cancel').click();
  assert.deepEqual(await saved(), parseSettings(changed));
  checks.push(
    'ordinary settings pages retain their existing reset confirmation and cancel behavior',
  );
};
