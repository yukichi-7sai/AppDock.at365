const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema');
const { SettingsStore } = require('../out/main/main/core/settings');
const { ExtensionManager } = require('../out/main/main/core/extensions');
const { processNameIndex, inputRows } = require('../out/main/shared/settings-indexes');
const { settingsLookups } = require('../out/main/shared/settings-lookups');
const {
  commandCondition,
  matchesCommandCondition,
  processNames,
} = require('../out/main/shared/command-conditions');
const { planKeybindings } = require('../out/main/shared/keybindings');
const { parseCommandStack } = require('../out/main/shared/command-stacks');
const { readObjectList } = require('../out/main/shared/object-list');
const { validateSettingValue } = require('../out/main/shared/setting-definitions');
const { parseImageLibrary } = require('../out/main/shared/registered-images');
const { parseWebProfiles } = require('../out/main/shared/web-content');
const {
  parseMcpRoster,
  parseMcpConnection,
  defaultMcpConnection,
} = require('../out/main/shared/mcp-client');
const { parseTrayMenu } = require('../out/main/shared/tray-menu');
const { parseRibbon, defaultRibbon } = require('../out/main/shared/applet-pages');
const { parseProcessLaunch, defaultProcessLaunch } = require('../out/main/shared/process-launch');
const row = (i, key = 'Ctrl+F8') => ({
  id: `row.${i}`,
  command: 'test.run',
  key,
  enabled: true,
  when: { scope: 'global', appletIds: [], excludedProcesses: [] },
});
const custom = (i) => ({
  id: randomUUID(),
  title: `Command ${i}`,
  description: 'x'.repeat(900),
  typeId: 'test.type',
  owner: { kind: 'host' },
  configVersion: 1,
  config: {},
  enabled: false,
  automation: false,
});

test('discovery and installation accept more than 256 combined command types and still reject collisions', (t) => {
  const root = path.resolve(__dirname, '../.artifacts/settings-capacity-unit');
  fs.mkdirSync(root, { recursive: true });
  const directory = fs.mkdtempSync(path.join(root, 'types-'));
  const folder = path.join(directory, 'extensions', 'fixture');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'index.cjs'), '');
  const type = {
    id: 'fixture.capacity.run',
    title: 'Run',
    configVersion: 1,
    configSchema: { type: 'object' },
  };
  fs.writeFileSync(
    path.join(folder, 'extension.json'),
    JSON.stringify({
      apiVersion: 1,
      id: 'fixture.capacity',
      name: 'Capacity',
      version: '1.0.0',
      minimumHostVersion: '0.99.16',
      runtime: 'node',
      entry: 'index.cjs',
      capabilities: ['custom-commands'],
      customCommandTypes: [type],
    }),
  );
  const settings = new SettingsStore(path.join(directory, 'settings.json'));
  settings.load();
  const reserved = Array.from({ length: 300 }, (_, i) => `appdock.type${i}`);
  const options = {
    roots: [path.dirname(folder)],
    settings,
    hostVersion: '0.99.16',
    nodeExecutable: process.execPath,
    nodeWorker: '',
    dotnetHost: '',
    api: async () => null,
    log: () => {},
    reservedCustomTypeIds: () => reserved,
  };
  const manager = new ExtensionManager(options);
  const conflicting = new ExtensionManager({
    ...options,
    reservedCustomTypeIds: () => [...reserved, type.id],
  });
  t.after(async () => {
    await manager.shutdown();
    await conflicting.shutdown();
    settings.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  assert.doesNotThrow(() => manager.validateInstall(folder));
  manager.discover();
  assert(manager.items.has('fixture.capacity'));
  assert.equal(manager.discoveryIssueCount, 0);
  assert.throws(() => conflicting.validateInstall(folder), /重複/);
  conflicting.discover();
  assert.equal(conflicting.items.size, 0);
  assert.equal(conflicting.discoveryIssueCount, 1);
});

test('settings above 4 MiB persist and reload thousands of custom commands without truncation', (t) => {
  const root = path.resolve(__dirname, '../.artifacts/settings-capacity-unit');
  fs.mkdirSync(root, { recursive: true });
  const directory = fs.mkdtempSync(path.join(root, 'case-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'settings.json');
  const store = new SettingsStore(file);
  store.load();
  const items = Array.from({ length: 5000 }, (_, i) => custom(i));
  store.save({ ...store.value, customCommands: { version: 2, items } }, store.revision);
  assert(fs.statSync(file).size > 4 * 1024 * 1024);
  const reloaded = new SettingsStore(file);
  reloaded.load();
  assert.equal(reloaded.value.customCommands.items.length, 5000);
  assert.deepEqual(reloaded.value.customCommands.items.at(-1), items.at(-1));
  assert.equal(
    settingsLookups(reloaded.value).customByCommandId.get(`appdock.custom.${items[4999].id}`).title,
    'Command 4999',
  );
});

test('accepted condition indexes are reused and replaced with each new snapshot; mutable drafts stay uncached', () => {
  const names = Array.from({ length: 10000 }, (_, i) => `Process${i}.EXE`);
  const source = {
    ...createDefaultSettings(),
    commandTriggerOptions: { browsers: names },
    keybindings: [{ ...row(0), when: { scope: 'exe', appletIds: [], processes: names } }],
  };
  const parsed = parseSettings(source);
  const saved = parsed.keybindings[0].when.processes;
  const index = processNameIndex(saved);
  assert.strictEqual(processNameIndex(saved), index);
  assert.equal(index.size, 10000);
  assert.notStrictEqual(saved, names);
  assert.equal(Object.isFrozen(names), false);
  const when = commandCondition(parsed.keybindings[0].when);
  assert.strictEqual(when.processes, saved);
  assert(
    matchesCommandCondition(when, {
      host: {},
      target: { window: '1', processName: 'PROCESS9999.exe' },
    }),
  );
  const next = parseSettings({
    ...parsed,
    keybindings: [{ ...row(1), when: { scope: 'exe', appletIds: [], processes: ['new.exe'] } }],
  });
  assert(!processNameIndex(next.keybindings[0].when.processes).has('process9999'));
  assert(index.has('process9999'));
  const draft = ['old'];
  assert(processNameIndex(draft).has('old'));
  draft[0] = 'new';
  assert(!processNameIndex(draft).has('old'));
  assert.deepEqual(processNames([' Editor.exe ', 'EDITOR', ...names]), [
    'editor',
    ...names.map((_, i) => `process${i}`),
  ]);
});

test('large indexed input lists preserve saved order, duplicates and first/all selection', () => {
  const settings = parseSettings({
    ...createDefaultSettings(),
    keybindings: Array.from({ length: 2501 }, (_, i) => row(i, i % 2 ? 'Ctrl+F7' : 'Ctrl+F8')),
  });
  const selected = inputRows(settings.keybindings, ['Ctrl+F8', 'Ctrl+F7', 'Ctrl+F8']);
  assert.deepEqual(
    selected.map((r) => r.id),
    settings.keybindings.map((r) => r.id),
  );
  const catalog = [{ id: 'test.run' }];
  const all = planKeybindings(settings.keybindings, ['Ctrl+F7', 'Ctrl+F8'], {}, catalog, true);
  assert.equal(all.commands.length, 2501);
  assert.equal(all.rowIds[2500], 'row.2500');
  assert.deepEqual(
    planKeybindings(settings.keybindings, ['Ctrl+F7', 'Ctrl+F8'], {}, catalog, true, 'first')
      .rowIds,
    ['row.0'],
  );
  assert.equal(
    parseCommandStack({
      executionMode: 'all',
      entries: settings.keybindings.map(({ key, ...entry }) => entry),
    }).entries.length,
    2501,
  );
});

test('settings collections accept former boundaries while rejecting malformed identities and duplicates', () => {
  const ids = Array.from({ length: 2001 }, (_, i) => `item.${i}`);
  assert.equal(
    parseProcessLaunch({ ...defaultProcessLaunch(), executable: process.execPath, arguments: ids })
      .arguments.length,
    2001,
  );
  assert.equal(readObjectList(ids.map((id) => ({ id }))).length, 2001);
  assert.doesNotThrow(() =>
    validateSettingValue({ key: 'paths', type: 'string-list', title: 'Paths', default: [] }, ids),
  );
  assert.equal(parseTrayMenu(ids.map((id) => ({ id, type: 'separator' }))).length, 2001);
  assert.equal(
    parseWebProfiles(
      Array.from({ length: 65 }, () => ({ id: `account.${randomUUID()}`, name: 'Account' })),
    ).length,
    65,
  );
  assert.equal(
    parseMcpRoster({
      version: 1,
      items: Array.from({ length: 1000 }, () => ({
        id: randomUUID(),
        name: 'Server',
        description: '',
      })),
    }).items.length,
    1000,
  );
  assert.equal(
    parseMcpConnection({
      ...defaultMcpConnection(),
      transport: 'stdio',
      command: process.execPath,
      args: ids,
      publishedTools: ids,
    }).args.length,
    2001,
  );
  const images = Array.from({ length: 600 }, (_, i) => ({ file: `image${i}.png` }));
  assert.equal(
    parseImageLibrary({
      groups: Array.from({ length: 65 }, (_, i) => ({
        id: `group-${i}`,
        name: `Group ${i}`,
        images,
      })),
    }).groups[64].images.length,
    600,
  );
  const buttons = Array.from({ length: 101 }, (_, i) => ({
    id: `button:b${i}`,
    title: 'Button',
    commandId: 'test.run',
    icon: 'settings',
  }));
  const separators = Array.from({ length: 600 }, (_, i) => `separator:s${i}`);
  const ribbon = { ...defaultRibbon(), separators, order: separators, buttons };
  assert.equal(parseRibbon(ribbon).buttons.length, 101);
  assert.throws(() =>
    parseTrayMenu([
      { id: 'same', type: 'separator' },
      { id: 'same', type: 'separator' },
    ]),
  );
  assert.throws(() => processNames(['C:\\private\\app.exe']));
});
