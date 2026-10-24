const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const {
  defaultTouchpadGestures,
  parseTouchpadGestures,
  touchpadGestureTypes,
  connectionKey,
  reservedTouchpadKeys,
  validateTouchpadKeyEdit,
  TouchpadKeyConflictError,
  planTouchpadCommands,
  touchpadShortcutProjection,
} = require('../out/main/shared/touchpad-gestures');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const { TouchpadBridgeManager } = require('../out/main/main/core/touchpad-bridge');
const { DeviceSettingsStore } = require('../out/main/main/core/device-settings-store');
const { AppDockApi } = require('../out/main/main/core/appdock-api');
const row = (id, gesture = 'three.tap', command = 'test.run', scope = 'global') => ({
  id,
  gesture,
  command,
  enabled: true,
  when: { scope, appletIds: [], processes: [] },
});
const root = path.resolve('.artifacts/touchpad-unit-' + Date.now());
fs.mkdirSync(root, { recursive: true });
test('strict ten gesture/chord model and reserved read-only projection', () => {
  const v = defaultTouchpadGestures();
  assert.equal(v.enabled, false);
  assert.deepEqual(
    touchpadGestureTypes.map(([, label]) => label),
    [
      '3本指: タップ',
      '3本指: 上',
      '3本指: 下',
      '3本指: 左',
      '3本指: 右',
      '4本指: タップ',
      '4本指: 上',
      '4本指: 下',
      '4本指: 左',
      '4本指: 右',
    ],
  );
  assert.deepEqual(
    Object.values(v.connections).map(connectionKey),
    Array.from({ length: 10 }, (_, i) => 'F' + (13 + i)),
  );
  for (const bad of ['two.up', 'four.diagonal', 'move-up'])
    assert.throws(() => parseTouchpadGestures({ ...v, bindings: [row('a', bad)] }));
  assert.throws(() =>
    parseTouchpadGestures({
      ...v,
      connections: { ...v.connections, 'four.tap': { key: 'F13', modifiers: [] } },
    }),
  );
  v.bindings = [row('a')];
  const s = { ...createDefaultSettings(), touchpadGestures: v };
  assert.equal(reservedTouchpadKeys(s).get('F13'), 'three.tap');
  assert.equal(touchpadShortcutProjection(s)[0].blockOriginalInput, true);
  const c = {
    ...s,
    keybindings: [
      {
        id: 'key',
        key: 'F13',
        command: 'test.run',
        enabled: false,
        when: { scope: 'app', appletIds: [] },
      },
    ],
  };
  assert.throws(
    () => validateTouchpadKeyEdit(c, s),
    (error) => {
      assert.ok(error instanceof TouchpadKeyConflictError);
      assert.deepEqual(error.keys, ['F13']);
      assert.equal(error.code, 'TOUCHPAD_KEY_CONFLICT');
      assert.match(error.message, /「F13」/);
      assert.match(error.message, /接続用キー設定/);
      return true;
    },
  );
  assert.doesNotThrow(() => validateTouchpadKeyEdit(c, c));
});
test('shared planner applies availability, conditions, registration order, dedup and first/all', () => {
  const v = defaultTouchpadGestures();
  v.bindings = [
    row('a', 'three.tap', 'missing'),
    row('b'),
    row('c'),
    row('d', 'three.tap', 'test.other', 'app'),
  ];
  const commands = [{ id: 'test.run' }, { id: 'test.other' }];
  assert.deepEqual(
    planTouchpadCommands(v, 'three.tap', { host: { focused: true } }, commands).commands,
    ['test.run', 'test.other'],
  );
  v.executionMode = 'first';
  assert.deepEqual(
    planTouchpadCommands(v, 'three.tap', { host: { focused: true } }, commands).commands,
    ['test.run'],
  );
  v.bindings = [row('desktop', 'three.tap', 'test.run', 'desktop')];
  assert.deepEqual(
    planTouchpadCommands(
      v,
      'three.tap',
      { host: {}, target: { window: '5', desktop: false } },
      commands,
    ).commands,
    [],
  );
});
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(root, 'case-')),
    settings = createDefaultSettings(),
    calls = [],
    events = [],
    errors = [],
    windows = touchpadGestureTypes.map(([gesture]) => ({
      gesture,
      key: null,
      action: 0,
      mode: 0,
      supported: true,
    }));
  let inputs = [],
    lease = true,
    fail = false;
  const input = {
    syncTouchpad: async (rows, reserved) => {
      inputs = rows;
      calls.push({ method: 'sync', rows, reserved });
      return rows.map((r) => ({ shortcut: r.shortcut, registered: true }));
    },
    touchpadRequest: async (method, args) => {
      calls.push({ method, args });
      if (method === 'touchpad.lease') return lease;
      if (method === 'touchpad.read')
        return { generation: 1, revision: 'current', gestures: structuredClone(windows) };
      if (method === 'touchpad.plan')
        return {
          revision: 'current',
          changes: [],
          before: structuredClone(windows),
          connections: args.connections,
        };
      if (method === 'touchpad.apply') {
        assert.ok(fs.existsSync(path.join(directory, 'state.json')));
        if (fail) throw Error('apply failed');
        for (const [id, key] of Object.entries(args.plan.connections))
          windows.find((r) => r.gesture === id).key = key;
        return {};
      }
      if (method === 'capture.validTarget') return true;
      throw Error(method);
    },
  };
  const manager = new TouchpadBridgeManager({
    stateFile: path.join(directory, 'state.json'),
    settings: () => settings,
    input,
    changed() {},
    warnings: {
      episode: () => ({
        update: () => events.push('warning'),
        resolve: () => events.push('resolved'),
      }),
    },
    open() {},
    report: (e) => errors.push(e),
    dispatch: async (id, press, valid) => {
      if (await valid()) events.push(id);
    },
  });
  t.after(() => manager.close());
  return {
    manager,
    settings,
    windows,
    calls,
    events,
    errors,
    directory,
    get inputs() {
      return inputs;
    },
    set lease(v) {
      lease = v;
    },
    set fail(v) {
      fail = v;
    },
    async edit(fn) {
      const before = structuredClone(settings);
      fn(settings.touchpadGestures);
      return manager.afterLocalEdit(before);
    },
  };
}
test('explicit ON connects assigned inputs, conflict is per gesture, OFF and delete leave Windows', async (t) => {
  const f = fixture(t),
    count = () => f.calls.filter((c) => c.method === 'touchpad.apply').length;
  await f.edit((v) => (v.bindings = [row('a'), row('b', 'four.tap')]));
  assert.equal(count(), 0);
  await f.edit((v) => (v.enabled = true));
  assert.equal(f.inputs.length, 2);
  assert.equal(count(), 1);
  await f.manager.pressed({ shortcuts: ['F13'], window: '7', target: { window: '7' } });
  assert.ok(f.events.includes('three.tap'));
  f.windows[0].key = 'Ctrl+F24';
  f.manager.windowsChanged();
  await f.manager.reconcile();
  assert.deepEqual(
    f.inputs.map((r) => r.shortcut),
    ['F18'],
  );
  assert.equal(f.manager.snapshot().statuses[0].state, 'conflict');
  await f.edit((v) => (v.connections['three.tap'] = { key: 'F23', modifiers: ['Ctrl'] }));
  assert.equal(count(), 1);
  await f.manager.connect(['three.tap']);
  assert.ok(f.inputs.some((r) => r.shortcut === 'Ctrl+F23'));
  await f.edit((v) => (v.enabled = false));
  assert.equal(f.inputs.length, 0);
  assert.equal(f.windows[0].key, 'Ctrl+F23');
  await f.edit((v) => (v.enabled = true));
  assert.equal(count(), 2);
  await f.edit((v) => (v.bindings = []));
  assert.equal(f.inputs.length, 0);
  assert.equal(f.windows[0].key, 'Ctrl+F23');
});
test('reconcile and failures never grant Windows writes; durable journal survives apply failure', async (t) => {
  const f = fixture(t);
  f.settings.touchpadGestures.enabled = true;
  f.settings.touchpadGestures.bindings = [row('a')];
  await f.manager.reconcile();
  assert.equal(f.manager.snapshot().statuses[0].state, 'unconnected');
  assert.equal(
    f.calls.some((c) => c.method === 'touchpad.apply'),
    false,
  );
  f.lease = false;
  await assert.rejects(f.manager.connect(['three.tap']));
  assert.equal(
    f.calls.some((c) => c.method === 'touchpad.apply'),
    false,
  );
  f.lease = true;
  f.fail = true;
  await assert.rejects(f.manager.connect(['three.tap']));
  assert.ok(JSON.parse(fs.readFileSync(path.join(f.directory, 'state.json'))).pending);
  const count = f.calls.filter((c) => c.method === 'touchpad.apply').length;
  await f.manager.reconcile();
  assert.equal(f.calls.filter((c) => c.method === 'touchpad.apply').length, count);
  assert.equal(f.inputs.length, 0);
});
test('enable is local to a PC and leaves shared file bytes unchanged', (t) => {
  const dir = fs.mkdtempSync(path.join(root, 'pc-')),
    file = path.join(dir, 'settings.json');
  fs.writeFileSync(file, JSON.stringify(createDefaultSettings()));
  const a = new DeviceSettingsStore(file, path.join(dir, 'a'), 'PC-A'),
    b = new DeviceSettingsStore(file, path.join(dir, 'b'), 'PC-B');
  t.after(() => {
    a.close();
    b.close();
  });
  a.load();
  b.load();
  const before = fs.readFileSync(file, 'utf8'),
    next = structuredClone(a.value);
  next.touchpadGestures.enabled = true;
  a.save(next, a.revision);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  a.reload();
  b.reload();
  assert.equal(a.value.touchpadGestures.enabled, true);
  assert.equal(b.value.touchpadGestures.enabled, false);
});
test('reconnecting one gesture preserves the other gesture recovery journal', async (t) => {
  const f = fixture(t);
  f.settings.touchpadGestures.enabled = true;
  f.settings.touchpadGestures.bindings = [row('a'), row('b', 'four.tap')];
  f.fail = true;
  await assert.rejects(f.manager.connect(['three.tap', 'four.tap']));
  f.fail = false;
  await f.manager.connect(['three.tap']);
  const history = JSON.parse(fs.readFileSync(path.join(f.directory, 'state.json')));
  assert.deepEqual(
    history.pending.flatMap((operation) => operation.remaining),
    ['four.tap'],
  );
  assert.equal(
    f.manager.snapshot().statuses.find((row) => row.gesture === 'four.tap').state,
    'error',
  );
  assert.deepEqual(
    f.inputs.map((row) => row.shortcut),
    ['F13'],
  );
  await f.manager.connect(['four.tap']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.directory, 'state.json'))).pending.length, 0);
  assert.deepEqual(
    f.inputs.map((row) => row.shortcut),
    ['F13', 'F18'],
  );
});
test('key edit refuses a Windows change that occurred before its monitor notification', async (t) => {
  const f = fixture(t);
  await f.edit((v) => (v.bindings = [row('a')]));
  await f.edit((v) => (v.enabled = true));
  f.windows[0].key = 'Alt+F24';
  const count = f.calls.filter((c) => c.method === 'touchpad.apply').length;
  await assert.rejects(f.edit((v) => (v.connections['three.tap'] = { key: 'F23', modifiers: [] })));
  assert.equal(f.calls.filter((c) => c.method === 'touchpad.apply').length, count);
  assert.equal(f.windows[0].key, 'Alt+F24');
  assert.equal(f.manager.snapshot().statuses[0].state, 'conflict');
});
test('public update is revision/permission gated, configuration only; explicit enable has dryRun', async (t) => {
  const dir = fs.mkdtempSync(path.join(root, 'api-')),
    settings = new DeviceSettingsStore(
      path.join(dir, 'settings.json'),
      path.join(dir, 'local'),
      'TEST',
    );
  settings.load();
  t.after(() => settings.close());
  let permission = false,
    writes = 0;
  const api = new AppDockApi({
    settings,
    save: (v, r) => settings.save(v, r),
    commands: () => [{ id: 'test.run', title: 'Run', appletId: null, available: true }],
    applets: () => [],
    ready: () => true,
    writable: () => true,
    executable: () => true,
    touchpadGesturesEditable: () => permission,
    version: 'test',
    instanceId: 'test',
    execute: async () => {},
    touchpadBridge: {
      snapshot: () => ({}),
      connect: async () => {
        writes++;
      },
      afterLocalEdit: async () => {
        writes++;
      },
    },
  });
  const get = () => api.call('touchpadGestures.get'),
    args = {
      expectedRevision: (await get()).revision,
      operations: [{ kind: 'add', binding: row('a') }],
    };
  await assert.rejects(
    api.call('commands.execute', { id: 'appdock.touchpadGestures.update', args }),
  );
  permission = true;
  await api.call('commands.execute', { id: 'appdock.touchpadGestures.update', args });
  assert.equal(writes, 0);
  assert.equal(settings.value.touchpadGestures.bindings.length, 1);
  await assert.rejects(
    api.call('commands.execute', { id: 'appdock.touchpadGestures.update', args }),
  );
  const enable = { expectedRevision: (await get()).revision, enabled: true, dryRun: true };
  await api.call('commands.execute', { id: 'appdock.touchpadGestures.set-enabled', args: enable });
  assert.equal(writes, 0);
  delete enable.dryRun;
  await api.call('commands.execute', { id: 'appdock.touchpadGestures.set-enabled', args: enable });
  assert.equal(writes, 1);
  assert.equal(settings.value.touchpadGestures.enabled, true);
});
