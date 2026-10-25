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
    include: [
      path.join(root, 'src/renderer/settings/runtime.ts'),
      path.join(root, 'src/shared/settings-input.ts'),
    ],
  }),
);
execFileSync(
  process.execPath,
  [path.join(path.dirname(tsPackage), require(tsPackage).bin.tsc), '-p', config],
  { cwd: root, windowsHide: true, stdio: 'pipe' },
);
const { SettingsViewClient } = require(path.join(output, 'compiled/renderer/settings/runtime.js'));
const { createDefaultSettings } = require(path.join(output, 'compiled/shared/settings-schema.js'));
const { mergeSettingsInput } = require(path.join(output, 'compiled/shared/settings-input.js'));
const { settingsCatalog, settingsProjection } = require(
  path.join(output, 'compiled/shared/settings-catalog.js'),
);
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
    external(change, notify = true) {
      const values = structuredClone(model.content.values);
      change(values);
      model = {
        ...model,
        revision: model.revision + 1,
        content: {
          ...model.content,
          values,
          editing: {
            ...model.content.editing,
            editRevision: model.content.editing.editRevision + 1,
          },
        },
      };
      if (notify) client.accept(structuredClone(model));
    },
    save(operation) {
      model = {
        ...model,
        revision: model.revision + 1,
        content: {
          ...model.content,
          values: mergeSettingsInput(
            operation.action.before,
            operation.action.type === 'partial-text'
              ? JSON.parse(operation.action.value)
              : operation.action.value,
            model.content.values,
          ),
          editing: {
            ...model.content.editing,
            editRevision: model.content.editing.editRevision + 1,
          },
        },
      };
    },
  };
}
test('failed touchpad form resets rejected modifiers before a later key edit', async () => {
  const f = fixture();
  f.edit((s) => {
    s.touchpadGestures.connections['three.tap'].modifiers = ['Ctrl'];
  });
  await f.client.flush();
  assert.deepEqual(
    f.displayed.content.values.touchpadGestures.connections['three.tap'].modifiers,
    [],
  );
  assert.match(f.error, /key conflict/);
  f.behavior(async (op) => f.save(op));
  f.edit((s) => {
    s.touchpadGestures.connections['three.tap'].key = 'F24';
  });
  await f.client.flush();
  assert.deepEqual(
    f.displayed.content.values.touchpadGestures.connections['three.tap'].modifiers,
    [],
  );
  assert.equal(f.displayed.content.values.touchpadGestures.connections['three.tap'].key, 'F24');
});
test('queued forms based on rejected input are discarded; fresh input can save', async () => {
  const f = fixture();
  f.edit((s) => {
    s.touchpadGestures.connections['three.tap'].modifiers = ['Ctrl'];
  });
  f.edit((s) => {
    s.touchpadGestures.connections['three.tap'].key = 'F24';
  });
  await f.client.flush();
  assert.equal(f.calls, 1);
  assert.deepEqual(
    f.displayed.content.values.touchpadGestures.connections['three.tap'].modifiers,
    [],
  );
  assert.equal(f.displayed.content.values.touchpadGestures.connections['three.tap'].key, 'F13');
  f.behavior(async (op) => f.save(op));
  f.edit((s) => {
    s.touchpadGestures.connections['three.tap'].modifiers = ['Ctrl'];
  });
  await f.client.flush();
  assert.equal(f.calls, 2);
  assert.deepEqual(f.displayed.content.values.touchpadGestures.connections['three.tap'].modifiers, [
    'Ctrl',
  ]);
  assert.equal(f.displayed.content.values.touchpadGestures.connections['three.tap'].key, 'F13');
});
test('post-save Windows failure displays actual saved values', async () => {
  const f = fixture();
  f.behavior(async (op) => {
    f.save(op);
    throw Error('Windows apply failed');
  });
  f.edit((s) => {
    s.touchpadGestures.connections['three.tap'].modifiers = ['Ctrl'];
  });
  await f.client.flush();
  assert.deepEqual(f.displayed.content.values.touchpadGestures.connections['three.tap'].modifiers, [
    'Ctrl',
  ]);
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
test('an asynchronous editor keeps unrelated changes received after its render', async () => {
  const f = fixture('general');
  f.behavior(async (op) => f.save(op));
  const editor = f.client.editor(f.displayed);
  f.external((values) => {
    values.host.closeToTray = !editor.value.host.closeToTray;
  });
  editor.value.host.soundEnabled = !editor.value.host.soundEnabled;
  editor.edit(editor.value);
  await f.client.flush();
  assert.equal(f.error, '');
  assert.equal(f.displayed.content.values.host.soundEnabled, editor.value.host.soundEnabled);
  assert.equal(f.displayed.content.values.host.closeToTray, !editor.value.host.closeToTray);
});
test('an asynchronous editor rejects a changed field instead of silently overwriting it', async () => {
  const f = fixture('ai');
  f.behavior(async (op) => f.save(op));
  const editor = f.client.editor(f.displayed);
  f.external((values) => {
    values.ai.commonPrompt = 'external prompt';
  });
  editor.value.ai.commonPrompt = 'pending prompt';
  editor.edit(editor.value);
  await f.client.flush();
  assert(f.error, 'the stale input must report a conflict');
  assert.equal(f.client.model.content.values.ai.commonPrompt, 'external prompt');
  assert.equal(
    f.displayed.content.values.ai.commonPrompt,
    'pending prompt',
    'failed text stays local',
  );
});
test('consecutive queued edits still save their cumulative optimistic input', async () => {
  const f = fixture('general');
  f.behavior(async (op) => f.save(op));
  const initial = structuredClone(f.displayed.content.values);
  f.edit((settings) => {
    settings.host.soundEnabled = !initial.host.soundEnabled;
  });
  f.edit((settings) => {
    settings.host.closeToTray = !initial.host.closeToTray;
  });
  await f.client.flush();
  assert.equal(f.calls, 2);
  assert.equal(f.error, '');
  assert.equal(f.displayed.content.values.host.soundEnabled, !initial.host.soundEnabled);
  assert.equal(f.displayed.content.values.host.closeToTray, !initial.host.closeToTray);
});
test('a successful local save cannot authorize an older asynchronous editor to replace external fields', async () => {
  const f = fixture('general');
  f.behavior(async (op) => f.save(op));
  const editor = f.client.editor(f.displayed);
  f.external((values) => {
    values.host.closeToTray = !editor.value.host.closeToTray;
  });
  f.edit((settings) => {
    settings.host.hardwareAcceleration = !editor.value.host.hardwareAcceleration;
  });
  await f.client.flush();
  editor.value.host.soundEnabled = !editor.value.host.soundEnabled;
  editor.edit(editor.value);
  await f.client.flush();
  assert.equal(f.error, '');
  assert.equal(f.displayed.content.values.host.closeToTray, !editor.value.host.closeToTray);
  assert.equal(
    f.displayed.content.values.host.hardwareAcceleration,
    !editor.value.host.hardwareAcceleration,
  );
  assert.equal(f.displayed.content.values.host.soundEnabled, editor.value.host.soundEnabled);
});
test('queued forms preserve external fields merged by the first queued save', async () => {
  const f = fixture('general');
  f.behavior(async (op) => f.save(op));
  const initial = structuredClone(f.displayed.content.values);
  f.external((values) => {
    values.host.startMinimized = !initial.host.startMinimized;
  }, false);
  f.edit((settings) => {
    settings.host.soundEnabled = !initial.host.soundEnabled;
  });
  f.edit((settings) => {
    settings.host.closeToTray = !initial.host.closeToTray;
  });
  await f.client.flush();
  assert.equal(f.error, '');
  assert.equal(f.displayed.content.values.host.startMinimized, !initial.host.startMinimized);
  assert.equal(f.displayed.content.values.host.soundEnabled, !initial.host.soundEnabled);
  assert.equal(f.displayed.content.values.host.closeToTray, !initial.host.closeToTray);
});
test('queued JSON edits rebase their own changes without copying merged external values into before', async () => {
  const f = fixture('general');
  f.behavior(async (op) => f.save(op));
  const value = structuredClone(f.displayed.content.values);
  const initial = structuredClone(value);
  f.external((values) => {
    values.host.startMinimized = !initial.host.startMinimized;
  }, false);
  value.host.soundEnabled = !value.host.soundEnabled;
  f.client.setText(JSON.stringify(value));
  value.host.closeToTray = !value.host.closeToTray;
  f.client.setText(JSON.stringify(value));
  await f.client.flush();
  assert.equal(f.error, '');
  assert.equal(f.displayed.content.values.host.startMinimized, !initial.host.startMinimized);
  assert.equal(f.displayed.content.values.host.soundEnabled, !initial.host.soundEnabled);
  assert.equal(f.displayed.content.values.host.closeToTray, !initial.host.closeToTray);
});
test('three queued JSON replacements of the same field remain ordered', async () => {
  const f = fixture('ai');
  f.behavior(async (op) => f.save(op));
  const value = structuredClone(f.displayed.content.values);
  for (const prompt of ['first', 'second', 'third']) {
    value.ai.commonPrompt = prompt;
    f.client.setText(JSON.stringify(value));
  }
  await f.client.flush();
  assert.equal(f.calls, 3);
  assert.equal(f.error, '');
  assert.equal(f.displayed.content.values.ai.commonPrompt, 'third');
});
test('interleaved JSON confirmations use each input creation revision', async () => {
  const f = fixture('ai');
  const gates = Array.from({ length: 3 }, () => {
    let resolve;
    const promise = new Promise((done) => {
      resolve = done;
    });
    return { promise, resolve };
  });
  f.behavior(async (op) => {
    await gates[f.calls - 1].promise;
    f.save(op);
  });
  const value = structuredClone(f.displayed.content.values);
  value.ai.commonPrompt = 'first';
  f.client.setText(JSON.stringify(value));
  value.ai.commonPrompt = 'second';
  f.client.setText(JSON.stringify(value));
  gates[0].resolve();
  for (let i = 0; i < 50 && f.calls < 2; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.calls, 2);
  assert.equal(f.client.model.content.values.ai.commonPrompt, 'first');
  value.ai.commonPrompt = 'third';
  f.client.setText(JSON.stringify(value));
  gates[1].resolve();
  gates[2].resolve();
  await f.client.flush();
  assert.equal(f.calls, 3);
  assert.equal(f.error, '');
  assert.equal(f.displayed.content.values.ai.commonPrompt, 'third');
});
test('correcting a rejected form compares against saved values, not the rejected display', async () => {
  const f = fixture('ai');
  f.edit((settings) => {
    settings.ai.commonPrompt = 'rejected';
  });
  await f.client.flush();
  f.behavior(async (op) => f.save(op));
  f.edit((settings) => {
    settings.ai.commonPrompt = 'corrected';
  });
  await f.client.flush();
  assert.equal(f.error, '');
  assert.equal(f.displayed.content.values.ai.commonPrompt, 'corrected');
});
test('a retained failed form is not silently dropped when a later field is saved', async () => {
  const f = fixture('general');
  const initial = structuredClone(f.displayed.content.values);
  f.edit((settings) => {
    settings.host.soundEnabled = !initial.host.soundEnabled;
  });
  await f.client.flush();
  f.behavior(async (op) => f.save(op));
  f.edit((settings) => {
    settings.host.closeToTray = !initial.host.closeToTray;
  });
  await f.client.flush();
  assert.equal(f.error, '');
  assert.equal(f.displayed.content.values.host.soundEnabled, !initial.host.soundEnabled);
  assert.equal(f.displayed.content.values.host.closeToTray, !initial.host.closeToTray);
});

test('presentation-only model copies retain the saved basis of rejected input', async () => {
  const f = fixture('ai');
  f.edit((settings) => {
    settings.ai.commonPrompt = 'rejected';
  });
  await f.client.flush();
  const resized = {
    ...f.displayed,
    content: { ...f.displayed.content, sidebarWidth: 240 },
  };
  const editor = f.client.editor(resized);
  f.behavior(async (op) => f.save(op));
  editor.value.ai.commonPrompt = 'corrected after resize';
  editor.edit(editor.value);
  await f.client.flush();
  assert.equal(f.error, '');
  assert.equal(f.client.model.content.values.ai.commonPrompt, 'corrected after resize');
});
