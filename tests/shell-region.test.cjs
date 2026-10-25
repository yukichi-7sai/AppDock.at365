const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const { parseSettings, createDefaultSettings } = require('../out/main/shared/settings-schema');
const { shellRegions, defaultShellId, parseShellProviders } = require('../out/main/shared/shell');
const { ShellProviderRegistry } = require('../out/main/main/core/shell-provider-registry');
const { SettingsStore } = require('../out/main/main/core/settings');
const {
  settingsCatalog,
  settingsProjection,
  applySettingsJson,
  searchSettings,
} = require('../out/main/shared/settings-catalog');
const { mergeSettingsInput } = require('../out/main/shared/settings-input');
const { readManifest, ExtensionManager } = require('../out/main/main/core/extensions');
function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appdock-shell-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function provider(id, extra = {}) {
  return {
    id,
    version: '1.0.0',
    folder: 'hidden/path',
    generation: id + '-run',
    enabled: true,
    state: 'running',
    sourceKind: id === defaultShellId ? 'builtin' : 'external',
    minimumHostVersion: '0.34.0',
    shell: {
      apiVersion: 1,
      ribbonSchemaVersion: 3,
      views: Object.fromEntries(shellRegions.map((r) => [r.id, r.id + '.html'])),
    },
    ...extra,
  };
}
function fixture(extra = {}) {
  let assignments = { ribbon: 'shell.a', statusbar: 'shell.b' };
  let providers = [provider(defaultShellId), provider('shell.a'), provider('shell.b')];
  const registry = new ShellProviderRegistry({
    assignments: () => assignments,
    providers: () => providers,
    safeMode: false,
    ...extra,
  });
  return { registry, assignments, providers };
}

test('all retired page assignments remain inert while their saved values and legacy requirements survive', () => {
  const f = fixture();
  const retired = [
    'page.home',
    'page.logs',
    'page.image-library',
    'page.notifications',
    'page.settings',
  ];
  const assignments = Object.fromEntries(retired.map((region) => [region, 'shell.a']));
  Object.assign(f.assignments, assignments);
  assert.deepEqual(parseShellProviders({ shellProviders: assignments }), assignments);
  assert.equal(f.registry.snapshot().regions.length, 6);
  for (const region of retired) {
    assert(!f.registry.snapshot().regions.some((state) => state.region === region));
    const requirement = { region, state: 'visible' };
    assert.match(f.registry.requirement('shell.a', requirement), /本体/);
    assert.equal(f.registry.lease('shell.a', requirement)(), false);
  }
});

test('legacy ribbon providers fall back per region while compatible bar and overlay assignments stay active', () => {
  const f = fixture();
  const external = f.providers.find((p) => p.id === 'shell.a');
  delete external.shell.ribbonSchemaVersion;
  f.assignments['titlebar'] = external.id;
  assert.equal(f.registry.resolve('ribbon').provider.id, defaultShellId);
  assert.match(f.registry.resolve('ribbon').reason, /対応していない/);
  assert.equal(f.registry.resolve('titlebar').provider.id, external.id);
  external.shell.ribbonSchemaVersion = 3;
  assert.equal(f.registry.resolve('ribbon').provider.id, external.id);
});
test('legacy scalar migrates eight fixed regions without startup writes, while new empty map takes precedence', (t) => {
  const settings = createDefaultSettings();
  delete settings.host.shellProviders;
  settings.host.shellProvider = 'shell.unknown';
  const parsed = parseSettings(settings);
  assert.equal(parsed.host.shellProvider, undefined);
  assert.equal(Object.keys(parsed.host.shellProviders).length, 8);
  assert(Object.values(parsed.host.shellProviders).every((id) => id === 'shell.unknown'));
  assert.deepEqual(parseSettings(parsed), parsed);
  const dir = temporary(t),
    file = path.join(dir, 'settings.json'),
    text = JSON.stringify(settings);
  fs.writeFileSync(file, text);
  const store = new SettingsStore(file);
  store.load();
  assert.equal(fs.readFileSync(file, 'utf8'), text);
  store.save(store.value, store.revision);
  assert.equal(JSON.parse(fs.readFileSync(file)).host.shellProvider, undefined);
  settings.host.shellProviders = {};
  assert.deepEqual(parseSettings(settings).host.shellProviders, {});
  settings.host.shellProviders = null;
  assert.throws(() => parseSettings(settings), /shellProviders/);
});
test('map validates own keys, size, reserved IDs and unknown regions without losing future assignments', () => {
  assert.deepEqual(parseShellProviders({ shellProviders: { 'future.panel': 'missing.shell' } }), {
    'future.panel': 'missing.shell',
  });
  for (const v of [
    [],
    null,
    1,
    { statusbar: 12 },
    { constructor: 'shell.a' },
    { 'PAGE.home': 'shell.a' },
    { statusbar: 'constructor' },
    Object.fromEntries(Array.from({ length: 33 }, (_, i) => ['page.x' + i, 'shell.a'])),
  ])
    assert.throws(() => parseShellProviders({ shellProviders: v }));
  assert.deepEqual(parseShellProviders(Object.create({ shellProvider: 'shell.a' })), {});
  const map = Object.assign(Object.create({ statusbar: 'shell.b' }), { ribbon: 'shell.a' });
  assert.deepEqual(parseShellProviders({ shellProviders: map }), { ribbon: 'shell.a' });
});
test('appearance projection and field merge preserve dotted keys and unedited concurrent assignments', () => {
  const value = createDefaultSettings();
  value.host.shellProviders = { statusbar: 'shell.a', 'future.panel': 'shell.b' };
  const page = settingsCatalog([], value).find((p) => p.id === 'appearance');
  const before = settingsProjection(value, page, []);
  const next = structuredClone(before);
  next.host.shellProviders['statusbar'] = 'shell.c';
  const current = structuredClone(before);
  current.host.shellProviders.ribbon = 'shell.b';
  const merged = mergeSettingsInput(before, next, current);
  assert.deepEqual(merged.host.shellProviders, {
    statusbar: 'shell.c',
    'future.panel': 'shell.b',
    ribbon: 'shell.b',
  });
  const result = applySettingsJson(value, page, [], JSON.stringify(merged));
  assert.deepEqual(result.host.shellProviders, merged.host.shellProviders);
  assert.throws(
    () =>
      applySettingsJson(
        value,
        page,
        [],
        JSON.stringify({ host: { theme: 'light', shellProvider: 'shell.a' } }),
      ),
    /変更できないキー/,
  );
  assert(
    searchSettings([page], 'デスクトップ').some(
      (i) => i.key === 'shellProviders.notification.desktop',
    ),
  );
  current.host.shellProviders['statusbar'] = 'shell.d';
  assert.throws(() => mergeSettingsInput(before, next, current), /同じ設定/);
});
test('all-capability providers mix independently; disable and restoration retain assignments', () => {
  const { registry: r, assignments, providers } = fixture();
  assert.equal(r.resolve('ribbon').provider.id, 'shell.a');
  assert.equal(r.resolve('statusbar').provider.id, 'shell.b');
  providers[1].enabled = false;
  assert.equal(r.resolve('ribbon').provider.id, defaultShellId);
  assert.equal(r.resolve('statusbar').provider.id, 'shell.b');
  assert.equal(assignments.ribbon, 'shell.a');
  providers[1].enabled = true;
  assert.equal(r.resolve('ribbon').provider.id, 'shell.a');
});
test('retired temporary-group assignments and views cannot override the ribbon provider', () => {
  const { registry, assignments, providers } = fixture();
  assignments['overlay.ribbon-group'] = 'shell.b';
  providers[1].shell.views['overlay.ribbon-group'] = 'ignored.html';
  assert.equal(registry.resolve('ribbon').provider.id, 'shell.a');
  assert(!registry.snapshot().regions.some((r) => r.region === 'overlay.ribbon-group'));
  assert(!registry.ownState('shell.a').regions.some((r) => r.region === 'overlay.ribbon-group'));
  assert.equal(
    require('../out/main/shared/shell').shellView(providers[1].shell, 'overlay.ribbon-group'),
    undefined,
  );
  const requirement = { region: 'overlay.ribbon-group', state: 'resolved' };
  assert.match(registry.requirement('shell.a', requirement), /リボン/);
  assert.equal(registry.lease('shell.a', requirement)(), false);
  assert.equal(assignments['overlay.ribbon-group'], 'shell.b');
  providers[1].shell.ribbonSchemaVersion = 2;
  assert.equal(registry.resolve('ribbon').provider.id, defaultShellId);
  providers[1].shell.ribbonSchemaVersion = 3;
  assert.equal(registry.resolve('ribbon').provider.id, 'shell.a');
});
test('uninstalled, waiting, partial and incompatible providers fall back only in their assigned region', () => {
  const { registry: r, assignments, providers } = fixture();
  assignments['page.settings'] = 'shell.a';
  providers[1].minimumHostVersion = '0.32.0';
  assert.equal(
    r.snapshot().regions.some((v) => v.region === 'page.settings'),
    false,
  );
  assert.match(r.requirement('shell.a', { region: 'page.settings', state: 'resolved' }), /本体/);
  assert.equal(r.resolve('ribbon').provider.id, 'shell.a');
  delete providers[1].shell.views.ribbon;
  assert.equal(r.resolve('ribbon').provider.id, defaultShellId);
  assignments.ribbon = 'missing';
  assert.match(r.resolve('ribbon').reason, /未導入/);
  assignments.ribbon = 'shell.a';
  providers[1].state = 'waiting';
  assert.equal(r.resolve('ribbon').provider.id, defaultShellId);
  assert.equal(r.resolve('statusbar').provider.id, 'shell.b');
});
test('fault suppression is per region and version, survives enable cycling, and explicit retry clears only one region', () => {
  const { registry: r, assignments, providers } = fixture();
  assignments['statusbar'] = 'shell.a';
  r.fail('ribbon', 'shell.a', '1.0.0');
  assert.equal(r.resolve('ribbon').provider.id, defaultShellId);
  assert.equal(r.resolve('statusbar').provider.id, 'shell.a');
  providers[1].enabled = false;
  providers[1].enabled = true;
  assert.equal(r.resolve('ribbon').provider.id, defaultShellId);
  r.fail('statusbar', 'shell.a', '1.0.0');
  r.retry('ribbon');
  assert.equal(r.resolve('ribbon').provider.id, 'shell.a');
  assert.equal(r.resolve('statusbar').provider.id, defaultShellId);
  providers[1].version = '1.0.1';
  assert.equal(r.resolve('statusbar').provider.id, 'shell.a');
});
test('safe mode preserves assignments and never selects an external fallback or forged Default', () => {
  const f = fixture({ safeMode: true });
  assert.equal(f.registry.resolve('ribbon').provider.id, defaultShellId);
  assert.equal(f.assignments.ribbon, 'shell.a');
  f.providers[0].sourceKind = 'external';
  assert.equal(f.registry.resolve('ribbon').provider, undefined);
  assert.match(f.registry.resolve('ribbon').reason, /Default/);
});
test('resolved, bound and visible differ; worker generation and modal blocking invalidate visible commands', () => {
  let blocked = false;
  const f = fixture({ blocked: () => blocked }),
    r = f.registry;
  const b = {
    provider: 'shell.a',
    version: '1.0.0',
    generation: 'shell.a-run',
    session: 'view-1',
    ready: true,
    visible: true,
  };
  r.observe('ribbon', () => b);
  assert.equal(r.requirement('shell.a', { region: 'ribbon', state: 'visible' }), undefined);
  blocked = true;
  assert(r.requirement('shell.a', { region: 'ribbon', state: 'visible' }));
  assert.equal(r.requirement('shell.a', { region: 'ribbon', state: 'resolved' }), undefined);
  blocked = false;
  f.assignments.ribbon = 'shell.b';
  assert.equal(r.region('ribbon').boundProvider, 'shell.a');
  assert.equal(r.region('ribbon').pendingProvider, 'shell.b');
  assert(r.requirement('shell.a', { region: 'ribbon', state: 'resolved' }));
  assert.equal(r.requirement('shell.a', { region: 'ribbon', state: 'visible' }), undefined);
  f.providers[1].generation = 'shell.a-new';
  assert.equal(r.region('ribbon').boundProvider, null);
  assert(r.requirement('shell.a', { region: 'ribbon', state: 'visible' }));
});
test('own state exposes only declared regions and booleans, with stable monotonic presentation revision', () => {
  const f = fixture();
  f.providers[1].shell.views = { ribbon: 'index.html' };
  const one = f.registry.ownState('shell.a');
  assert.equal(one.regions.length, 1);
  assert.equal(one.regions[0].resolved, true);
  assert(!JSON.stringify(one).includes('shell.b'));
  assert(!JSON.stringify(one).includes('hidden/path'));
  assert.equal(f.registry.ownState('shell.a').revision, one.revision);
  f.providers[1].enabled = false;
  assert(f.registry.ownState('shell.a').revision > one.revision);
});
test('requirement declarations validate capability, version, known regions and activation conflict', (t) => {
  const dir = temporary(t);
  fs.writeFileSync(path.join(dir, 'worker.cjs'), 'exports.activate=async()=>{}');
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html>');
  const m = {
    apiVersion: 1,
    id: 'shell.a',
    name: 'A',
    version: '1.0.0',
    minimumHostVersion: '0.34.0',
    runtime: 'node',
    entry: 'worker.cjs',
    capabilities: ['shell'],
    shell: { apiVersion: 1, ui: 'index.html' },
    commands: [
      { id: 'shell.a.run', title: 'Run', shellRequirement: { region: 'ribbon', state: 'visible' } },
    ],
  };
  const read = () => {
    fs.writeFileSync(path.join(dir, 'extension.json'), JSON.stringify(m));
    return readManifest(dir);
  };
  assert.equal(read().commands[0].shellRequirement.state, 'visible');
  for (const change of [
    () => (m.commands[0].shellRequirement.region = 'future.panel'),
    () => (m.commands[0].shellRequirement.state = 'selected'),
    () => (m.commands[0].activateOnExecute = true),
    () => (m.minimumHostVersion = '0.33.0'),
    () => (m.capabilities = []),
  ]) {
    const original = JSON.parse(JSON.stringify(m));
    change();
    assert.throws(read);
    Object.keys(m).forEach((k) => delete m[k]);
    Object.assign(m, original);
  }
});
test('runtime replace and aliases keep manifest conditions, final execute rejects state changes after listing', (t) => {
  const dir = temporary(t),
    settings = new SettingsStore(path.join(dir, 'settings.json'));
  settings.value.extensions['shell.a'] = { enabled: true, settings: {} };
  const manager = new ExtensionManager({
    roots: [],
    settings,
    nodeExecutable: 'unused',
    nodeWorker: 'unused',
    dotnetHost: 'unused',
    api: async () => {},
    log: () => {},
  });
  const e = {
    manifest: {
      id: 'shell.a',
      version: '1.0.0',
      commands: [
        {
          id: 'shell.a.run',
          title: 'Run',
          aliases: ['shell.a.old'],
          automation: true,
          shellRequirement: { region: 'ribbon', state: 'visible' },
        },
      ],
      settings: [],
    },
    state: 'running',
    commands: [{ id: 'shell.a.run', title: 'Runtime replacement', shellRequirement: undefined }],
    peer: { closed: false, request: async () => null },
    tray: [],
    panel: null,
    settingOptions: {},
    error: null,
  };
  manager.items.set('shell.a', e);
  let accepted = true;
  manager.shellRequirement = () => (accepted ? undefined : 'Shell target unavailable');
  assert.equal(manager.commandCatalog(e).find((c) => c.id === 'shell.a.old').available, true);
  accepted = false;
  const commands = manager.commandCatalog(e);
  assert.equal(commands.find((c) => c.id === 'shell.a.run').available, false);
  assert.equal(
    commands.find((c) => c.id === 'shell.a.old').disabledReason,
    'Shell target unavailable',
  );
  assert.throws(() => manager.execute('shell.a.old'), /Shell target/);
});

test('visible execution lease expires when a View session changes even if the same provider returns', async () => {
  const f = fixture(),
    b = {
      provider: 'shell.a',
      version: '1.0.0',
      generation: 'shell.a-run',
      session: 'view-1',
      ready: true,
      visible: true,
    };
  f.registry.observe('ribbon', () => b);
  const valid = f.registry.lease('shell.a', { region: 'ribbon', state: 'visible' });
  assert.equal(valid(), true);
  b.session = 'view-2';
  assert.equal(valid(), false);
  const { CommandContexts } = require('../out/main/main/core/command-contexts');
  const calls = new CommandContexts();
  let eligible = true;
  await calls.run(
    'shell.a',
    undefined,
    async (id) => {
      const context = calls.get('shell.a', id);
      assert.equal(context.signal.aborted, false);
      eligible = false;
      assert.throws(() => calls.get('shell.a', id), /Shell/);
      assert.equal(context.signal.aborted, true);
    },
    () => eligible,
  );
});

test('unassigned worker state does not disclose another provider failure reason', () => {
  const f = fixture();
  f.providers[1].enabled = false;
  const b = f.registry.ownState('shell.b');
  assert.equal(
    b.regions.find((r) => r.region === 'ribbon').reason,
    'この領域に割り当てられていません。',
  );
});
