const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.artifacts', 'settings-view-client-unit');
fs.mkdirSync(output, { recursive: true });
const tsPackage = require.resolve('typescript/package.json');
const config = path.join(output, 'tsconfig.json');
fs.writeFileSync(
  config,
  JSON.stringify({
    extends: path.join(root, 'tsconfig.json'),
    compilerOptions: {
      noEmit: false,
      module: 'Node16',
      moduleResolution: 'Node16',
      rootDir: path.join(root, 'src'),
      outDir: path.join(output, 'compiled'),
    },
    include: [path.join(root, 'src/renderer/settings/runtime.ts')],
  }),
);
execFileSync(
  process.execPath,
  [path.join(path.dirname(tsPackage), require(tsPackage).bin.tsc), '-p', config],
  { cwd: root, windowsHide: true, stdio: 'pipe' },
);
const { SettingsViewClient } = require(path.join(output, 'compiled/renderer/settings/runtime.js'));
const { createDefaultSettings } = require(path.join(output, 'compiled/shared/settings-schema.js'));
const { settingsCatalog, settingsProjection } = require(
  path.join(output, 'compiled/shared/settings-catalog.js'),
);
const row = {
  id: 'test-row',
  command: 'appdock.open',
  gesture: 'three.tap',
  enabled: true,
  when: { scope: 'global', appletIds: [], processes: [] },
};
function fixture(pageId = 'touchpad-gestures') {
  const settings = createDefaultSettings();
  const page = settingsCatalog([], settings).find((item) => item.id === pageId);
  let model = {
    id: 'view',
    kind: 'settings',
    revision: 1,
    content: {
      page,
      values: settingsProjection(settings, page, []),
      editing: { sessionId: 'edit', editRevision: 1, mode: 'form' },
      auxiliary: {},
      actions: {},
    },
  };
  let displayed,
    error,
    calls = 0,
    behavior = async () => {
      throw Error('key conflict');
    };
  const client = new SettingsViewClient(
    (m) => {
      displayed = m;
    },
    (e) => {
      error = e;
    },
    {
      get: async () => structuredClone(model),
      act: async (_, request) => {
        calls++;
        await behavior(request.operation);
        return { model: structuredClone(model) };
      },
    },
    'connection',
  );
  client.accept(structuredClone(model));
  return {
    client,
    get displayed() {
      return displayed;
    },
    get error() {
      return error;
    },
    get calls() {
      return calls;
    },
    edit(change) {
      const editor = client.editor(displayed);
      change(editor.value);
      editor.edit(editor.value);
    },
    behavior(fn) {
      behavior = fn;
    },
    save(operation) {
      model = {
        ...model,
        revision: model.revision + 1,
        content: {
          ...model.content,
          values: structuredClone(operation.action.value),
          editing: {
            ...model.content.editing,
            editRevision: model.content.editing.editRevision + 1,
          },
        },
      };
    },
  };
}
test('failed touchpad form restores saved values and later key edit does not save rejected row', async () => {
  const f = fixture();
  f.edit((s) => {
    s.touchpadGestures.bindings = [row];
  });
  await f.client.flush();
  assert.deepEqual(f.displayed.content.values.touchpadGestures.bindings, []);
  assert.match(f.error, /key conflict/);
  f.behavior(async (op) => f.save(op));
  f.edit((s) => {
    s.touchpadGestures.connections['three.tap'].key = 'F24';
  });
  await f.client.flush();
  assert.deepEqual(f.displayed.content.values.touchpadGestures.bindings, []);
  assert.equal(f.displayed.content.values.touchpadGestures.connections['three.tap'].key, 'F24');
});
test('queued forms based on rejected input are discarded; fresh input can save', async () => {
  const f = fixture();
  f.edit((s) => {
    s.touchpadGestures.bindings = [row];
  });
  f.edit((s) => {
    s.touchpadGestures.connections['three.tap'].key = 'F24';
  });
  await f.client.flush();
  assert.equal(f.calls, 1);
  assert.deepEqual(f.displayed.content.values.touchpadGestures.bindings, []);
  assert.equal(f.displayed.content.values.touchpadGestures.connections['three.tap'].key, 'F13');
  f.behavior(async (op) => f.save(op));
  f.edit((s) => {
    s.touchpadGestures.bindings = [row];
  });
  await f.client.flush();
  assert.equal(f.calls, 2);
  assert.deepEqual(f.displayed.content.values.touchpadGestures.bindings, [row]);
});
test('post-save Windows failure displays actual saved values', async () => {
  const f = fixture();
  f.behavior(async (op) => {
    f.save(op);
    throw Error('Windows apply failed');
  });
  f.edit((s) => {
    s.touchpadGestures.bindings = [row];
  });
  await f.client.flush();
  assert.deepEqual(f.displayed.content.values.touchpadGestures.bindings, [row]);
  assert.match(f.error, /Windows apply failed/);
});
test('other forms and touchpad JSON retain failed input', async () => {
  const general = fixture('general');
  general.edit((s) => {
    s.host.soundEnabled = false;
  });
  await general.client.flush();
  assert.equal(general.displayed.content.values.host.soundEnabled, false);
  const touchpad = fixture();
  touchpad.client.setText('{invalid');
  await touchpad.client.flush();
  assert.equal(touchpad.client.text(touchpad.displayed), '{invalid');
});
