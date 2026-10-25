const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
const active = 'fixture.common-active',
  disabled = 'fixture.common-disabled',
  waiting = 'fixture.common-waiting';
module.exports = async ({ page, client, profile, local, checks, tool, value, until }) => {
  const tools = JSON.stringify((await client.listTools()).tools),
    sharedFile = path.join(profile, 'settings.json'),
    deviceFile = path.join(profile, `settings-${require('node:os').hostname()}.json`),
    marker = (id) => path.join(profile, 'extensions', id, 'activations.json'),
    target = async (id) =>
      (await value('appdock_settings_list_targets', { ownerId: id })).items.find(
        (item) => item.category === 'applet-common',
      ).targetId,
    read = (targetId) => value('appdock_settings_get_values', { targetId });
  const request = async (targetId, changes, dryRun = false) => {
    const state = await read(targetId);
    return {
      targetId,
      expectedSchemaRevision: state.schemaRevision,
      expectedRevision: state.revision,
      requestId: randomUUID(),
      dryRun,
      operations: [{ kind: 'set', changes }],
    };
  };
  const apply = async (id, changes, dryRun = false) =>
    value('appdock_settings_apply', await request(id, changes, dryRun));
  const reset = async (targetId) => {
    const state = await read(targetId);
    return value('appdock_settings_apply', {
      targetId,
      expectedSchemaRevision: state.schemaRevision,
      expectedRevision: state.revision,
      requestId: randomUUID(),
      operations: [{ kind: 'reset', keys: ['startupDelaySeconds', 'page:main.part'] }],
    });
  };
  const field = (state, key) => state.fields.find((item) => item.key === key);
  await until(
    async () => (await value('appdock_get_applet', { id: active })).applet.state === 'running',
    'common fixture running',
  );
  const id = await target(active),
    stoppedId = await target(disabled),
    waitingId = await target(waiting),
    before = fs.readFileSync(sharedFile),
    device = fs.readFileSync(deviceFile),
    ai = fs.readFileSync(path.join(local, 'ai-keys.json')),
    tts = fs.readFileSync(path.join(local, 'tts-key.json'));
  const pageSurfaces = () =>
    page
      .context()
      .pages()
      .filter((surface) => surface.url().includes(active) && surface.url().endsWith('/page.html'));
  assert.equal(pageSurfaces().length, 0);
  const preview = await apply(id, { startupDelaySeconds: 17, 'page:main.part': 'window' }, true);
  assert.equal(preview.completion, 'validated');
  assert.equal(preview.effectVerified, false);
  assert.deepEqual(fs.readFileSync(sharedFile), before);
  assert.deepEqual(fs.readFileSync(deviceFile), device);
  assert.equal(pageSurfaces().length, 0);
  const saveRequest = await request(id, { startupDelaySeconds: 17, 'page:main.part': 'window' }),
    saved = await value('appdock_settings_apply', saveRequest);
  assert.deepEqual(await value('appdock_settings_apply', saveRequest), saved);
  assert.equal(pageSurfaces().length, 0);
  assert.equal(JSON.parse(fs.readFileSync(marker(active))), 1);
  await page.evaluate(() => window.dock.navigate('settings'));
  await page.getByTestId('settings-nav:applet:' + active).click();
  const common = page.getByTestId('applet-common-settings');
  if ((await common.getAttribute('open')) === null) await common.locator('summary').click();
  const delay = page.getByTestId('applet-common-' + active + ':startupDelaySeconds'),
    display = page.getByTestId('applet-page-display-' + active + ':main.part');
  await until(
    async () => (await delay.inputValue()) === '17' && (await display.inputValue()) === 'window',
    'common UI receives MCP save',
  );
  const stale = await request(id, { startupDelaySeconds: 99 });
  await delay.fill('27');
  await delay.press('Tab');
  await until(
    async () => field(await read(id), 'startupDelaySeconds').value === 27,
    'common UI delay persists',
  );
  await display.selectOption('page');
  await until(
    async () => field(await read(id), 'page:main.part').value === 'page',
    'common UI display persists',
  );
  assert.equal(
    (await tool('appdock_settings_apply', stale)).structuredContent.code,
    'REVISION_CONFLICT',
  );
  assert.equal(pageSurfaces().length, 0);
  assert.deepEqual(fs.readFileSync(deviceFile), device);
  checks.push(
    'Applet common fields real MCP dryRun/save/replay and existing UI agree; literal page IDs, shared routing and stale requests are checked without opening a page or restarting a running worker',
  );

  const oldScope = await request(id, { startupDelaySeconds: 88 }),
    scope = page.getByTestId('settings-storage-local');
  await until(() => scope.isEnabled(), 'storage toggle ready');
  await scope.check();
  await until(
    async () => (await read(id)).schemaRevision !== oldScope.expectedSchemaRevision,
    'local scope reflected in schema',
  );
  assert.equal(
    (await tool('appdock_settings_apply', oldScope)).structuredContent.code,
    'SCHEMA_CONFLICT',
  );
  const shared = fs.readFileSync(sharedFile);
  await apply(id, { startupDelaySeconds: 87, 'page:main.part': 'window' });
  await until(async () => (await delay.inputValue()) === '87', 'local common UI receives MCP save');
  assert.deepEqual(fs.readFileSync(sharedFile), shared);
  assert.equal(
    JSON.parse(fs.readFileSync(deviceFile)).extensions[active].configuration.startupDelaySeconds,
    87,
  );
  await reset(id);
  await until(
    async () =>
      (await read(id)).fields
        .filter((item) => item.key !== 'enabled')
        .every((item) => item.inherited),
    'local common reset removes overrides',
  );
  assert.deepEqual(fs.readFileSync(sharedFile), shared);
  assert.equal(JSON.parse(fs.readFileSync(marker(active))), 1);
  checks.push(
    'Applet common PC-only mode changes invalidate stale schemas; local edits/reset preserve dormant shared values, private fields and the existing worker',
  );

  await page.evaluate((command) => window.dock.executeCommand(command), active + '.open');
  const surface = await until(() => pageSurfaces()[0], 'common local page opened explicitly');
  await surface.locator('#state').fill('retained-state');
  const rail = await require('./shell-overlay-helper.cjs').ribbonPage(page),
    item = rail.locator(`[data-ribbon-id="page:${active}:main.part"]`);
  await until(async () => (await item.getAttribute('aria-current')) === 'page', 'page embedded');
  await apply(id, { 'page:main.part': 'window' });
  await until(
    async () => (await item.getAttribute('aria-current')) !== 'page',
    'existing page moved out',
  );
  assert.equal(surface.isClosed(), false);
  assert.equal(await surface.locator('#state').inputValue(), 'retained-state');
  await apply(id, { 'page:main.part': 'page' });
  await until(
    async () => (await item.getAttribute('aria-current')) === 'page',
    'existing page returned',
  );
  assert.equal(pageSurfaces()[0], surface);
  assert.equal(await surface.locator('#state').inputValue(), 'retained-state');
  checks.push(
    'Applet page display changes use the existing surface: page-window-page retains its WebContents and input, while setting reads/dryRun do not open a page',
  );

  await apply(stoppedId, { startupDelaySeconds: 31, 'page:main.part': 'page' });
  assert.equal((await value('appdock_get_applet', { id: disabled })).applet.enabled, false);
  assert.equal(fs.existsSync(marker(disabled)), false);
  const scheduled = () =>
    page.evaluate(
      async (id) => (await window.dock.snapshot()).extensions.find((item) => item.id === id),
      waiting,
    );
  const scheduledBefore = await scheduled();
  assert.equal(scheduledBefore.state, 'waiting');
  assert(Number.isFinite(scheduledBefore.scheduledStartAt));
  await apply(waitingId, { startupDelaySeconds: 0 }, true);
  assert.equal((await value('appdock_get_applet', { id: waiting })).applet.state, 'waiting');
  assert.equal(fs.existsSync(marker(waiting)), false);
  await apply(waitingId, { startupDelaySeconds: 240 });
  await until(
    async () => (await scheduled()).scheduledStartAt > scheduledBefore.scheduledStartAt,
    'waiting start rescheduled',
  );
  assert.equal(fs.existsSync(marker(waiting)), false);
  fs.writeFileSync(
    path.join(profile, 'common-startup-schedule.json'),
    JSON.stringify(
      { before: scheduledBefore.scheduledStartAt, after: (await scheduled()).scheduledStartAt },
      null,
      2,
    ),
  );
  await reset(waitingId);
  await reset(stoppedId);
  assert.deepEqual(fs.readFileSync(path.join(local, 'ai-keys.json')), ai);
  assert.deepEqual(fs.readFileSync(path.join(local, 'tts-key.json')), tts);
  assert.equal(JSON.stringify((await client.listTools()).tools), tools);
  assert.equal((await value('appdock_get_info')).executable, false);
  checks.push(
    'Stopped common preferences remain editable without activation; waiting delays reschedule only on save, credentials and execute permission remain intact, and MCP tools stay fixed',
  );
  await page.evaluate(() => window.dock.navigate('settings'));
  await page.getByTestId('settings-nav:mcp-client').waitFor();
};
module.exports.install = (profile) => {
  const file = path.join(profile, 'settings.json'),
    settings = JSON.parse(fs.readFileSync(file));
  for (const id of [active, disabled, waiting]) {
    const folder = path.join(profile, 'extensions', id);
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(
      path.join(folder, 'extension.json'),
      JSON.stringify({
        apiVersion: 1,
        id,
        name: 'Common fixture',
        version: '1.0.0',
        runtime: 'node',
        entry: 'worker.cjs',
        capabilities: ['pages'],
        startupDelaySeconds: id === waiting ? 180 : id === disabled ? 3 : 0,
        commands: [{ id: id + '.open', title: 'Open common page', activateOnExecute: true }],
        pages: [
          {
            id: 'main.part',
            title: 'Common page',
            source: 'local',
            ui: 'page.html',
            openCommand: id + '.open',
            defaultDisplay: id === disabled ? 'window' : 'page',
          },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(folder, 'page.html'),
      '<!doctype html><title>Common page fixture</title><input id="state" value="initial">',
    );
    fs.writeFileSync(
      path.join(folder, 'worker.cjs'),
      `const fs=require('node:fs'),path=require('node:path');exports.activate=async context=>{const file=path.join(__dirname,'activations.json');fs.writeFileSync(file,JSON.stringify((fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):0)+1));context.commands.register('${id}.open','Open common page',()=>context.pages.open('main.part'));};`,
    );
    settings.extensions[id] = {
      enabled: id !== disabled,
      settings: { private: 'PRIVATE_COMMON_SETTING' },
    };
  }
  fs.writeFileSync(file, JSON.stringify(settings));
};
