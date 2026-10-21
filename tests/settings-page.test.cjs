const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const { SettingsInputSession } = require('../out/main/main/core/settings-input-session');
const { SettingsPageSession } = require('../out/main/main/core/settings-page');
const { settingsProjection, applySettingsJson } = require('../out/main/shared/settings-catalog');

test('Applet page edits allow absent display overrides and reset them without empty page objects', () => {
  const current = createDefaultSettings();
  const id = 'fixture.pages';
  current.extensions[id] = { enabled: false, settings: { preserved: 'value' } };
  const applets = [
    { id, pages: [{ id: 'main', title: 'Main', defaultDisplay: 'page' }], settings: [] },
  ];
  const page = { id: `applet:${id}`, kind: 'applet', owner: id, json: true };
  const projected = settingsProjection(current, page, applets);
  projected.extensions[id].startupDelaySeconds = 7;
  const saved = applySettingsJson(current, page, applets, JSON.stringify(projected));
  assert.equal(saved.extensions[id].startupDelaySeconds, 7);
  assert.equal(saved.extensions[id].pages, undefined);
  assert.deepEqual(saved.extensions[id].settings, { preserved: 'value' });
  saved.extensions[id].pages = { main: { display: 'window' }, other: { display: 'window' } };
  const reset = applySettingsJson(saved, page, applets, JSON.stringify(projected));
  assert.deepEqual(reset.extensions[id].pages, { other: { display: 'window' } });
  delete saved.extensions[id].pages.other;
  const onlyPage = applySettingsJson(saved, page, applets, JSON.stringify(projected));
  assert.equal(onlyPage.extensions[id].pages, undefined);
  assert.doesNotThrow(() => require('../out/main/shared/settings-schema').parseSettings(onlyPage));
});
function fixture(actions = {}) {
  let saved = { value: createDefaultSettings(), revision: 1 };
  saved.value.extensions['private.other'] = {
    enabled: false,
    settings: { secret: 'private-value' },
  };
  const applets = [
    {
      id: 'fixture.a.b',
      displayName: 'Fixture',
      runtime: 'node',
      settings: [{ key: 'n.x', title: 'Number', type: 'number', default: 1 }],
      pages: [],
    },
  ];
  const editor = new SettingsInputSession({
    current: () => saved,
    applets: () => applets,
    save: async (value, revision) => {
      assert.equal(revision, saved.revision);
      return (saved = { value, revision: revision + 1 });
    },
    changed() {},
  });
  let calls = 0;
  const navigation = { query: '' };
  const page = new SettingsPageSession(
    { id: 'full', route: 'settings', kind: 'settings', context: 'full' },
    {
      editor,
      navigation,
      host: () => ({ settings: saved, extensions: applets, dark: false }),
      auxiliary: () => ({}),
      actions: () => ({ sample: async () => ++calls, ...actions }),
      changed() {},
    },
  );
  const act = (operation, opid = crypto.randomUUID()) => {
    const m = page.snapshot();
    return page.act({
      id: m.id,
      type: 'settings',
      sessionId: m.content.editing.sessionId,
      editRevision: m.content.editing.editRevision,
      operationId: opid,
      operation,
    });
  };
  return {
    page,
    editor,
    applets,
    navigation,
    replacement: () =>
      new SettingsPageSession(
        { id: 'replacement', route: 'settings', kind: 'settings', context: 'full' },
        {
          editor,
          navigation,
          host: () => ({ settings: saved, extensions: applets, dark: false }),
          auxiliary: () => ({}),
          actions: () => ({}),
          changed() {},
        },
      ),
    act,
    get saved() {
      return saved;
    },
    get calls() {
      return calls;
    },
  };
}
test('all settings pages receive live hint visibility without exposing other page values', async () => {
  const f = fixture();
  await f.act({ kind: 'select', pageId: 'tts' });
  const before = f.page.snapshot();
  assert.equal(before.content.showHints, true);
  f.saved.value.host.showHints = false;
  f.saved.revision++;
  const after = f.page.snapshot();
  assert.equal(after.content.showHints, false);
  assert.ok(after.revision > before.revision);
  assert.equal(after.content.values.host?.showHints, undefined);
  assert.equal(JSON.stringify(after).includes('private-value'), false);
});

test('public settings models never expose unrelated values; issued operations are scoped and replayed once', async () => {
  const f = fixture(),
    m = f.page.snapshot();
  assert.equal(JSON.stringify(m).includes('private-value'), false);
  await assert.rejects(f.act({ kind: 'edit', action: { type: 'values', value: {} } }), /不正/);
  await assert.rejects(
    f.act({
      kind: 'edit',
      action: {
        type: 'page-values',
        pageId: 'appearance',
        before: f.editor.projection(),
        value: { profile: { name: 'attack' } },
      },
    }),
    /変更できない/,
  );
  await assert.rejects(f.act({ kind: 'invoke', actionId: 'sample' }), /許可/);
  const id = m.content.actions.sample;
  await f.act({ kind: 'invoke', actionId: id }, 'once');
  await f.act({ kind: 'invoke', actionId: id }, 'once');
  assert.equal(f.calls, 1);
  await f.act({ kind: 'select', pageId: 'general' });
  await assert.rejects(f.act({ kind: 'invoke', actionId: id }), /許可/);
  f.page.dispose();
  await assert.rejects(f.act({ kind: 'select', pageId: 'tts' }), /Stale/);
});
test('issued action errors return to their control without becoming page errors', async () => {
  let attempts = 0;
  const f = fixture({
    saveDialog: async () => {
      attempts++;
      throw Error('MCPのURLを入力してください。');
    },
  });
  const before = structuredClone(f.saved);
  await assert.rejects(f.act({ kind: 'invoke', actionId: 'unknown' }), /許可/);
  assert.match(f.page.snapshot().content.editing.error, /許可/);
  const actionId = f.page.snapshot().content.actions.saveDialog;
  await assert.rejects(f.act({ kind: 'invoke', actionId }, 'dialog-once'), /MCPのURL/);
  assert.equal(f.page.snapshot().content.editing.error, '');
  await assert.rejects(f.act({ kind: 'invoke', actionId }, 'dialog-once'), /MCPのURL/);
  assert.equal(attempts, 1);
  assert.deepEqual(f.saved, before);
  await f.act({ kind: 'invoke', actionId: f.page.snapshot().content.actions.sample });
  assert.equal(f.calls, 1);
  assert.equal(f.page.snapshot().content.editing.error, '');
  await assert.rejects(f.act({ kind: 'edit', action: { type: 'save' } }), /不正/);
  assert.match(f.page.snapshot().content.editing.error, /不正/);
});

test('invalid input never enters projection; valid page writes persist with privacy and no global save', async () => {
  const f = fixture();
  await f.act({ kind: 'select', pageId: 'applet:fixture.a.b' });
  const before = f.editor.projection(),
    values = structuredClone(before);
  values.extensions['fixture.a.b'].settings['n.x'] = '-';
  await assert.rejects(
    f.act({
      kind: 'edit',
      action: { type: 'page-values', pageId: 'applet:fixture.a.b', before, value: values },
    }),
  );
  assert.notEqual(f.editor.projection().extensions['fixture.a.b'].settings['n.x'], '-');
  values.extensions['fixture.a.b'].settings['n.x'] = 9;
  await f.act({
    kind: 'edit',
    action: { type: 'page-values', pageId: 'applet:fixture.a.b', before, value: values },
  });
  assert.equal(f.saved.value.extensions['fixture.a.b'].settings['n.x'], 9);
  assert.equal(f.saved.value.extensions['private.other'].settings.secret, 'private-value');
  assert.equal(f.page.snapshot().schemaVersion, 2);
  assert.equal(JSON.stringify(f.page.snapshot()).includes('private-value'), false);
  assert.equal('dirty' in f.page.snapshot().content.editing, false);
  await assert.rejects(f.act({ kind: 'edit', action: { type: 'save' } }), /不正/);
  await f.act({ kind: 'edit', action: { type: 'mode', value: 'json' } });
  await assert.rejects(
    f.act({
      kind: 'edit',
      action: {
        type: 'partial-text',
        pageId: 'applet:fixture.a.b',
        before: f.editor.projection(),
        value: '{bad',
      },
    }),
    /JSON/,
  );
  await f.act({ kind: 'select', pageId: 'general' });
  assert.equal(f.editor.snapshot().pageId, 'general');
});

test('search is metadata-only and persistent; explicit movement switches page and latest acknowledgement wins', async () => {
  const f = fixture();
  const before = f.editor.snapshot();
  await f.act({ kind: 'search', text: 'ＦＩＸＴＵＲＥ number' });
  const results = f.page.snapshot().content.results;
  assert.equal(results.length, 1);
  assert.equal(results[0].definition, undefined);
  assert.deepEqual(f.editor.snapshot(), before);
  assert.equal(f.replacement().snapshot().content.query, 'ＦＩＸＴＵＲＥ number');
  await f.act({ kind: 'move', itemId: results[0].id });
  const move = f.page.snapshot().content.move;
  assert.equal(f.editor.snapshot().pageId, 'applet:fixture.a.b');
  assert.equal('dirty' in f.editor.snapshot(), false);
  await f.act({ kind: 'move', itemId: results[0].id });
  const latest = f.page.snapshot().content.move;
  await assert.rejects(f.act({ kind: 'moved', requestId: move.id, pageId: move.pageId }), /古く/);
  await f.act({ kind: 'moved', requestId: latest.id, pageId: latest.pageId });
  assert.equal(f.page.snapshot().content.move.completed, true);
  await f.act({ kind: 'search', text: 'private-value' });
  assert.equal(f.page.snapshot().content.results.length, 0);
  assert.equal(f.editor.snapshot().pageId, latest.pageId);
  await assert.rejects(f.act({ kind: 'search', text: 'x'.repeat(513) }), /512/);
});
test('removed setting targets remain unavailable and cannot be selected', async () => {
  const f = fixture();
  await f.act({ kind: 'search', text: 'Number' });
  const result = f.page.snapshot().content.results[0];
  await f.act({ kind: 'move', itemId: result.id });
  f.applets.splice(0);
  assert(f.page.snapshot().content.page.unavailableReason);
  await assert.rejects(f.act({ kind: 'move', itemId: result.id }), /見つかりません/);
  await f.act({ kind: 'select', pageId: 'tts' });
});

test('settings View teardown releases recording while preserving the Controller, saved values and navigation', async () => {
  let saved = { value: createDefaultSettings(), revision: 1 },
    released = 0;
  const editor = new SettingsInputSession({
    current: () => saved,
    applets: () => [],
    save: async (value) => (saved = { value, revision: saved.revision + 1 }),
    changed() {},
  });
  const navigation = { query: 'Shell' };
  const page = new SettingsPageSession(
    { id: 'view-replacement', route: 'settings', kind: 'settings', context: 'full' },
    {
      editor,
      navigation,
      host: () => ({ settings: saved, extensions: [], dark: false }),
      auxiliary: () => ({}),
      actions: () => ({}),
      changed() {},
      release: () => released++,
    },
  );
  const before = page.snapshot();
  saved.value.host.theme = 'light';
  page.viewClosed();
  const after = page.snapshot();
  assert.equal(released, 1);
  assert.equal(after.id, before.id);
  assert.equal(after.content.editing.sessionId, before.content.editing.sessionId);
  assert.equal(after.content.query, 'Shell');
  assert.equal(after.content.values.host.theme, 'light');
  page.dispose();
});
