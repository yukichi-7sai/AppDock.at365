const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');
const { SettingsStore } = require('../out/main/main/core/settings');
const { DeviceSettingsStore } = require('../out/main/main/core/device-settings-store');
const fileObserver = require('../out/main/main/core/file-observer');
const { SettingsCommands } = require('../out/main/main/core/settings-commands');
const { SettingsServiceTargets } = require('../out/main/main/core/settings-service-targets');
const { SettingsTargets } = require('../out/main/main/core/settings-targets');
const { ShortcutCommands } = require('../out/main/main/core/shortcut-commands');
const { parseSettings } = require('../out/main/shared/settings-schema');
const { getCommandTriggerOptions } = require('../out/main/shared/command-trigger-options');

const browserValue = { browsers: ['edge'], requireChromiumWindowClass: true };
function fixture(t, device = false) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: 1000000 });
  t.mock.method(performance, 'now', () => Date.now());
  const directory = path.resolve('.artifacts/settings-observer-race-unit', randomUUID());
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'settings.json');
  const store = device
    ? new DeviceSettingsStore(file, path.join(directory, 'local'), 'TEST')
    : new SettingsStore(file, path.join(directory, 'backups'));
  store.load();
  t.after(() => store.close());
  const shared = device ? store.shared : store;
  const save = (value, revision, rewrite = []) =>
    device ? store.save(value, revision, undefined, rewrite) : store.save(value, revision);
  const commands = new SettingsCommands({ settings: store, applets: () => [], save });
  const services = new SettingsServiceTargets({
    settings: store,
    revision: () => commands.revision(),
    checkRevision: (revision) => commands.checkRevision(revision),
    validate: parseSettings,
    save,
    ai: { configurationState: () => ({ protected: false }) },
    tts: { configurationState: () => ({ protected: false }) },
    notifications: () => [],
  });
  const targets = new SettingsTargets({
    targets: () =>
      services.targets().filter((target) => target.targetId === 'service.command-triggers'),
    revision: () => commands.revision(),
    principal: () => 'test',
  });
  const shortcuts = new ShortcutCommands({
    settings: store,
    settingsCommands: commands,
    save,
    commands: () => [],
    applets: () => [],
  });
  const read = () => targets.call('settings.values.get', { targetId: 'service.command-triggers' });
  const values = () => Object.fromEntries(read().fields.map((field) => [field.key, field.value]));
  const setBrowser = () => {
    const before = read();
    const result = targets.call('settings.apply', {
      targetId: 'service.command-triggers',
      requestId: randomUUID(),
      expectedRevision: before.revision,
      expectedSchemaRevision: before.schemaRevision,
      operations: [{ kind: 'set', changes: browserValue }],
    });
    assert.equal(result.completion, 'settingsSaved');
    return result;
  };
  let observer, notify;
  const observe = fileObserver.observeFile;
  t.mock.method(fileObserver, 'observeFile', (...args) => {
    observer = observe(...args);
    const check = observer.check;
    observer.beginCheck = check;
    observer.check = async (...input) => {
      let settled = false;
      const pending = check(...input).finally(() => {
        settled = true;
      });
      for (let turn = 0; !settled; turn++) {
        assert(turn < 10000, 'observer must finish its reconciliation attempt');
        t.mock.timers.tick(180);
        await new Promise(setImmediate);
      }
      return pending;
    };
    return observer;
  });
  t.mock.method(fs, 'watch', (_directory, callback) => {
    notify = () => callback('rename', path.basename(file));
    return Object.assign(new EventEmitter(), { close() {} });
  });
  shared.watch(() => {});
  const changes = [];
  store.on('changed', (snapshot) => changes.push(getCommandTriggerOptions(snapshot.value)));
  const tick = async (milliseconds) => {
    t.mock.timers.tick(milliseconds);
    await observer.check();
  };
  const interleave = async (action) => {
    const stat = fs.promises.stat;
    let calls = 0;
    t.mock.method(fs.promises, 'stat', async (...args) => {
      const result = await stat(...args);
      if (path.resolve(String(args[0])) === file && ++calls === 2) action();
      return result;
    });
    await tick(180);
    assert(calls >= 2, 'The final metadata result must overlap the owner operation');
  };
  const diskBrowser = () => JSON.parse(fs.readFileSync(file, 'utf8')).commandTriggerOptions;
  const writeBrowser = () =>
    fs.writeFileSync(
      file,
      shared.serialize({ ...shared.value, commandTriggerOptions: browserValue }),
    );
  const agrees = () => {
    assert.deepEqual(diskBrowser(), browserValue);
    assert.deepEqual(values(), browserValue);
    const legacy = shortcuts.get().options;
    assert.deepEqual(legacy.browsers, browserValue.browsers);
    assert.equal(legacy.requireChromiumWindowClass, true);
    assert.deepEqual(getCommandTriggerOptions(store.value), browserValue);
  };
  return {
    directory,
    file,
    store,
    shared,
    observer,
    read,
    values,
    setBrowser,
    changes,
    tick,
    interleave,
    writeBrowser,
    agrees,
    notify: () => notify(),
  };
}

for (const device of [false, true]) {
  test(
    `${device ? 'combined' : 'shared'} settings keep a completed MCP save when an older watcher result arrives`,
    { timeout: 15000 },
    async (t) => {
      const f = fixture(t, device);
      await f.observer.check();
      await f.tick(180);
      f.store.save(
        { ...f.store.value, profile: { ...f.store.value.profile, name: 'Unrelated value' } },
        f.store.revision,
      );
      f.notify();
      await f.observer.check();
      let saved, revision;
      await f.interleave(() => {
        saved = f.setBrowser();
        revision = f.store.revision;
        f.agrees();
      });
      f.agrees();
      assert.equal(f.read().revision, saved.revision);
      assert.equal(f.store.revision, revision);
      assert.deepEqual(f.changes.at(-1), browserValue);
      assert.equal(f.store.value.profile.name, 'Unrelated value');
    },
  );
}

test(
  'direct reload supersedes an older watcher result without waiting for a file event',
  { timeout: 15000 },
  async (t) => {
    const f = fixture(t, true);
    await f.observer.check();
    await f.interleave(() => {
      f.writeBrowser();
      f.store.reload();
    });
    f.agrees();
  },
);

test(
  'revision validation supersedes an older watcher result even when memory already matches disk',
  { timeout: 15000 },
  async (t) => {
    const f = fixture(t, true);
    const original = fs.readFileSync(f.file);
    f.setBrowser();
    const current = fs.readFileSync(f.file);
    fs.writeFileSync(f.file, original);
    const pending = f.observer.beginCheck();
    let revision;
    await f.interleave(() => {
      fs.writeFileSync(f.file, current);
      revision = f.store.revision;
      f.store.assertRevision(revision);
    });
    await pending;
    f.agrees();
    assert.equal(f.store.revision, revision);
  },
);

test(
  'a delayed healthy watcher result cannot clear a newer direct-read error',
  { timeout: 15000 },
  async (t) => {
    const f = fixture(t);
    await f.observer.check();
    await f.interleave(() => {
      fs.writeFileSync(f.file, '{invalid');
      assert.throws(() => f.store.reload());
      assert(f.store.health.has('read'));
    });
    assert(f.store.health.has('read'));
    assert.equal(fs.readFileSync(f.file, 'utf8'), '{invalid');
    f.writeBrowser();
    f.notify();
    await f.tick(100);
    await f.tick(180);
    f.agrees();
    assert.equal(f.store.health.has('read'), false);
  },
);

test(
  'explicit backup restoration is not rolled back in memory by an older watcher result',
  { timeout: 15000 },
  async (t) => {
    const f = fixture(t);
    const backup = path.join(f.directory, 'restore-source.json');
    fs.writeFileSync(
      backup,
      f.shared.serialize({ ...f.store.value, commandTriggerOptions: browserValue }),
    );
    await f.observer.check();
    await f.interleave(() => {
      fs.writeFileSync(f.file, '{invalid');
      f.store.restoreRecovery(f.store.prepareRecovery(backup));
    });
    f.agrees();
    assert.equal(f.store.recovered, false);
  },
);

test(
  'unchanged revision validation still lets a healthy watcher clear a previous read error',
  { timeout: 15000 },
  async (t) => {
    const f = fixture(t);
    const original = fs.readFileSync(f.file);
    await f.observer.check();
    fs.writeFileSync(f.file, '{invalid');
    f.notify();
    await f.tick(100);
    await f.tick(180);
    assert(f.store.health.has('read'));
    fs.writeFileSync(f.file, original);
    f.store.assertRevision(f.store.revision);
    await f.tick(100);
    await f.tick(180);
    assert.equal(f.store.health.has('read'), false);
    assert.equal(f.store.recovered, false);
  },
);
