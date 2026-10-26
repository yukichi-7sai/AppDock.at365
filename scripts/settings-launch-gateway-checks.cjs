const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
const { WindowsLaunch } = require('../out/main/main/core/windows-launch');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const { hostText } = require('../out/main/shared/i18n');
module.exports = async ({ page, client, profile, local, checks, tool, value, until }) => {
  const tools = JSON.stringify((await client.listTools()).tools),
    target = (await value('appdock_settings_list_targets', { query: 'launch' })).items.find(
      (item) => item.category === 'launch',
    ),
    targetId = target.targetId,
    read = () => value('appdock_settings_get_values', { targetId }),
    schema = await value('appdock_settings_get_schema', { targetId }),
    sharedFile = path.join(profile, 'settings.json'),
    deviceFile = path.join(profile, `settings-${require('node:os').hostname()}.json`),
    privateFiles = ['ai-keys.json', 'tts-key.json', 'mcp-client.json'].map((name) =>
      path.join(local, name),
    ),
    privateBytes = privateFiles.map((file) => fs.readFileSync(file)),
    bytes = () => [sharedFile, deviceFile].map((file) => fs.readFileSync(file)),
    request = async (operations, dryRun = false) => {
      const current = await read();
      return {
        targetId,
        operations,
        dryRun,
        expectedSchemaRevision: current.schemaRevision,
        expectedRevision: current.revision,
        requestId: randomUUID(),
      };
    };
  assert.deepEqual(
    schema.items.map((field) => field.key),
    ['startAtLogon', 'runAsAdministrator'],
  );
  const initial = await read();
  if (!target.available) {
    assert(initial.fields.every((field) => !field.writable));
    assert.equal(
      (
        await tool(
          'appdock_settings_apply',
          await request([{ kind: 'set', changes: { startAtLogon: true } }], true),
        )
      ).structuredContent.code,
      'UNAVAILABLE',
    );
    checks.push(
      'Launch preferences are discoverable and read-only in a development host; dryRun does not launch Windows or save a file',
    );
    return;
  }
  const executable = path.join(profile, 'AppDock.at365.exe'),
    inspector = new WindowsLaunch(executable, profile, [`--test-profile=${profile}`]),
    before = bytes(),
    defaults = createDefaultSettings().host;
  assert.equal(initial.fields.find((field) => field.key === 'runAsAdministrator').value, false);
  assert.equal(initial.fields.find((field) => field.key === 'startAtLogon').value, false);
  assert.equal((await inspector.read()).registered, false);
  const on = [{ kind: 'set', changes: { startAtLogon: true } }];
  try {
    assert.equal(
      (await value('appdock_settings_apply', await request(on, true))).completion,
      'validated',
    );
    assert.deepEqual(bytes(), before);
    assert.equal((await inspector.read()).registered, false);
    const savedRequest = await request(on),
      saved = await value('appdock_settings_apply', savedRequest);
    assert.equal(saved.completion, 'settingsSaved');
    assert.equal(saved.effectVerified, false);
    const registered = await inspector.read();
    assert.equal(registered.registered, true);
    assert.equal(registered.taskElevated, false);
    assert(registered.xml.includes(executable));
    assert(registered.xml.includes('<LogonType>InteractiveToken</LogonType>'));
    assert.deepEqual(await value('appdock_settings_apply', savedRequest), saved);
    assert.deepEqual(fs.readFileSync(sharedFile), before[0]);
    checks.push(
      'Real MCP launch dryRun is inert; save/replay awaits the existing owner and registers only the isolated EXE/profile with Limited InteractiveToken, without execute permission',
    );

    await page.getByRole('button', { name: hostText('pages.general.title'), exact: true }).click();
    const toggle = page.getByRole('switch', {
      name: hostText('general.startAtLogon.label'),
      exact: true,
    });
    await until(
      async () => (await toggle.getAttribute('aria-checked')) === 'true',
      'launch native saved value',
    );
    const stale = await request([{ kind: 'set', changes: { startAtLogon: false } }]);
    await toggle.click();
    await until(async () => !(await inspector.read()).registered, 'native unregister');
    await until(
      async () => !(await read()).fields.find((field) => field.key === 'startAtLogon').value,
      'native value in MCP',
    );
    assert.equal(
      (await tool('appdock_settings_apply', stale)).structuredContent.code,
      'REVISION_CONFLICT',
    );
    checks.push(
      'Native launch toggle and common MCP values use the same immediate PC save; native unregister finishes and stale external requests cannot overwrite it',
    );

    await value('appdock_settings_apply', await request(on));
    const reset = await value(
      'appdock_settings_apply',
      await request([{ kind: 'reset', keys: ['startAtLogon'] }]),
    );
    assert.equal(reset.completion, 'settingsSaved');
    assert.equal((await inspector.read()).registered, false);
    assert.equal(
      (await read()).fields.find((field) => field.key === 'startAtLogon').inherited,
      true,
    );
    assert.equal(JSON.parse(fs.readFileSync(deviceFile)).host?.startAtLogon, undefined);
    assert.deepEqual(fs.readFileSync(sharedFile), before[0]);
    for (let index = 0; index < privateFiles.length; index++)
      assert.deepEqual(fs.readFileSync(privateFiles[index]), privateBytes[index]);
    assert.equal(JSON.stringify((await client.listTools()).tools), tools);
    checks.push(
      'MCP reset removes the isolated logon task and sparse override, preserves shared settings and all credential bytes, and keeps fixed transport schemas unchanged',
    );
  } finally {
    const actual = await inspector.read();
    assert.equal(
      actual.taskElevated,
      false,
      'The isolated task must stay Limited; never request UAC during cleanup',
    );
    if (actual.registered)
      await inspector.save(
        defaults,
        { ...defaults, startAtLogon: true },
        () => {},
        () => {},
      );
    assert.equal((await inspector.read()).registered, false);
  }
  fs.writeFileSync(
    path.join(profile, 'launch-mcp.json'),
    JSON.stringify({
      registeredDuringSave: true,
      taskRemoved: true,
      limited: true,
      executeAllowed: false,
      toolsUnchanged: true,
    }),
  );
};
