const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
module.exports = async ({ page, client, profile, local, checks, tool, value, until }) => {
  const tools = JSON.stringify((await client.listTools()).tools),
    target = (
      await value('appdock_settings_list_targets', { query: 'command-triggers' })
    ).items.find((item) => item.category === 'command-triggers'),
    targetId = target.targetId,
    read = () => value('appdock_settings_get_values', { targetId }),
    sharedFile = require('./test-settings.cjs').file(profile, 'settings.json'),
    deviceFile = require('./test-settings.cjs').file(profile, `settings-${require('node:os').hostname()}.json`),
    field = (state, key) => state.fields.find((item) => item.key === key);
  const request = async (operations, dryRun = false) => {
    const state = await read();
    return {
      targetId,
      operations,
      dryRun,
      expectedSchemaRevision: state.schemaRevision,
      expectedRevision: state.revision,
      requestId: randomUUID(),
    };
  };
  const set = async (changes, dryRun = false) =>
    value('appdock_settings_apply', await request([{ kind: 'set', changes }], dryRun));
  const initial = await read(),
    schema = await value('appdock_settings_get_schema', { targetId }),
    browser = schema.items.find((item) => item.key === 'browsers'),
    chromium = schema.items.find((item) => item.key === 'requireChromiumWindowClass'),
    shared = fs.readFileSync(sharedFile),
    device = fs.readFileSync(deviceFile),
    ai = fs.readFileSync(path.join(local, 'ai-keys.json')),
    tts = fs.readFileSync(path.join(local, 'tts-key.json'));
  assert.equal(browser.inputSchema.type, 'array');
  assert.equal(browser.inputSchema.maxItems, undefined);
  const changes = { browsers: [' EDGE.EXE ', 'edge'], requireChromiumWindowClass: true };
  const preview = await set(changes, true);
  assert.equal(preview.completion, 'validated');
  assert.deepEqual(preview.changes.find((item) => item.key === 'browsers').value, ['edge']);
  assert.deepEqual(fs.readFileSync(sharedFile), shared);
  assert.deepEqual(fs.readFileSync(deviceFile), device);
  const savedRequest = await request([{ kind: 'set', changes }]),
    saved = await value('appdock_settings_apply', savedRequest);
  assert.deepEqual(await value('appdock_settings_apply', savedRequest), saved);
  assert.equal(saved.effectVerified, false);
  for (const name of [
    'appdock_get_shortcuts',
    'appdock_get_gestures',
    'appdock_get_touchpad_gestures',
  ]) {
    const state = await value(name),
      options = state.options ?? state.settings;
    if (JSON.stringify(options.browsers) !== JSON.stringify(['edge']))
      fs.writeFileSync(
        path.join(profile, 'browser-reader-divergence.json'),
        JSON.stringify(
          {
            method: name,
            legacy: options,
            common: (await read()).fields,
            stored: JSON.parse(fs.readFileSync(sharedFile, 'utf8')).commandTriggerOptions,
          },
          null,
          2,
        ),
      );
    assert.deepEqual(options.browsers, ['edge'], name);
    assert.equal(options.requireChromiumWindowClass, true);
  }
  assert.deepEqual(fs.readFileSync(deviceFile), device);
  checks.push(
    'Shared browser MCP fields use the existing process-name parser: dryRun is inert, save/replay normalizes names and all three legacy readers agree while execute stays OFF',
  );

  for (const id of ['shortcuts', 'gestures', 'touchpad-gestures']) {
    await page.getByTestId('settings-nav:' + id).click();
    const section = page.getByTestId('gesture-common-options');
    await until(
      async () =>
        (await section.getByRole('textbox', { name: browser.title, exact: true }).inputValue()) ===
        'edge',
      'shared browser UI receives MCP save on ' + id,
    );
    assert.equal(
      await section
        .getByRole('switch', { name: chromium.title, exact: true })
        .getAttribute('aria-checked'),
      'true',
    );
  }
  const stale = await request([{ kind: 'set', changes: { browsers: [] } }]);
  const section = page.getByTestId('gesture-common-options'),
    input = section.getByRole('textbox', { name: browser.title, exact: true });
  await input.fill('Chrome.exe, firefox, CHROME.EXE');
  await input.press('Tab');
  await until(
    async () =>
      JSON.stringify(field(await read(), 'browsers').value) ===
      JSON.stringify(['chrome', 'firefox']),
    'native browser input reaches MCP',
  );
  await section.getByRole('switch', { name: chromium.title, exact: true }).click();
  await until(
    async () => field(await read(), 'requireChromiumWindowClass').value === false,
    'native Chromium toggle reaches MCP',
  );
  assert.equal(
    (await tool('appdock_settings_apply', stale)).structuredContent.code,
    'REVISION_CONFLICT',
  );
  const withoutCommon = (bytes) => {
    const value = JSON.parse(bytes);
    delete value.commandTriggerOptions;
    return value;
  };
  assert.deepEqual(withoutCommon(fs.readFileSync(sharedFile)), withoutCommon(shared));
  assert.deepEqual(fs.readFileSync(deviceFile), device);
  checks.push(
    'All three native feature pages render the same declarations and values; native input/toggle saves reach MCP, stale requests fail and bindings and other settings remain unchanged',
  );

  const names = Array.from({ length: 101 }, (_, index) => `browser${index}.EXE`);
  await set({ browsers: names });
  assert.equal(field(await read(), 'browsers').value.length, 101);
  const beforeInvalid = fs.readFileSync(sharedFile);
  for (const invalid of [{ browsers: ['C:/browser.exe'], requireChromiumWindowClass: true }])
    assert.equal(
      (await tool('appdock_settings_apply', await request([{ kind: 'set', changes: invalid }])))
        .structuredContent.code,
      'INVALID_ARGUMENT',
    );
  assert.deepEqual(fs.readFileSync(sharedFile), beforeInvalid);
  await set({ browsers: [] });
  assert.deepEqual(field(await read(), 'browsers').value, []);
  assert.equal(field(await read(), 'browsers').inherited, false);
  const defaults = field(initial, 'browsers').default;
  await set({ browsers: defaults.map((name) => name.toUpperCase() + '.EXE') });
  assert.equal(field(await read(), 'browsers').inherited, true);
  assert.equal(JSON.parse(fs.readFileSync(sharedFile)).commandTriggerOptions, undefined);
  checks.push(
    'Shared browser arrays accept names beyond the former 100-name limit and preserve explicit empty values; invalid late fields are atomic and normalized defaults remove the saved override',
  );

  await set(changes);
  await value(
    'appdock_settings_apply',
    await request([{ kind: 'reset', keys: ['browsers', 'requireChromiumWindowClass'] }]),
  );
  assert((await read()).fields.every((item) => item.inherited));
  assert.deepEqual(fs.readFileSync(deviceFile), device);
  assert.deepEqual(fs.readFileSync(path.join(local, 'ai-keys.json')), ai);
  assert.deepEqual(fs.readFileSync(path.join(local, 'tts-key.json')), tts);
  assert.equal((await value('appdock_get_info')).executable, false);
  assert.equal(JSON.stringify((await client.listTools()).tools), tools);
  fs.writeFileSync(
    path.join(profile, 'browser-options-mcp.json'),
    JSON.stringify(
      {
        fixedItemLimit: false,
        testedItems: names.length,
        pages: 3,
        resetInherited: true,
        executeAllowed: false,
        toolsUnchanged: true,
      },
      null,
      2,
    ),
  );
  checks.push(
    'Common browser reset shares sparse storage and inheritance, preserves credential bytes and PC settings, and leaves the six MCP transport definitions and execution permission unchanged',
  );
};
