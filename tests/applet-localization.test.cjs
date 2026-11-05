const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  AppletTranslations,
  loadAppletTranslations,
  appletTranslations,
} = require('../out/main/main/core/applet-localization');
const { readManifest, ExtensionManager } = require('../out/main/main/core/extensions');
const { appletText } = require('../out/main/shared/applet-localization');
const {
  hostResources,
  configureHostLanguage,
} = require('../out/main/main/core/host-translation-source');
const { hostLanguages, effectiveHostLanguage } = require('../out/main/shared/host-language');

function fixture(t) {
  const artifacts = path.resolve('.artifacts');
  fs.mkdirSync(artifacts, { recursive: true });
  const root = fs.mkdtempSync(path.join(artifacts, 'applet-localization-'));
  const folder = path.join(root, 'extensions/fixture');
  const external = path.join(root, 'translations');
  const base = {
    name: '表示名',
    title: '設定',
    fallback: '基本',
    named: '{{name}} は {{count}} 件',
    another: '追加',
  };
  const manifest = {
    apiVersion: 1,
    id: 'fixture.localized',
    name: 'Fixture',
    version: '1.0.0',
    runtime: 'node',
    entry: 'index.cjs',
    minimumHostVersion: '0.159.0',
    localization: { defaultLanguage: 'ja' },
  };
  function write(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value));
  }
  const bundled = (name, value) => write(path.join(folder, 'resources/translations', name), value);
  const outside = (name, value) =>
    write(path.join(external, 'applets/fixture.localized', name), value);
  bundled('applet.json', base);
  write(path.join(folder, 'extension.json'), manifest);
  fs.writeFileSync(path.join(folder, 'index.cjs'), 'exports.activate = async () => {};');
  const prior = hostResources.en;
  hostResources.en = {};
  t.after(() => {
    if (prior === undefined) delete hostResources.en;
    else hostResources.en = prior;
    configureHostLanguage(() => 'ja');
    assert.equal(path.dirname(root), artifacts);
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    root,
    folder,
    external,
    base,
    manifest,
    write,
    bundled,
    outside,
    load: () => new AppletTranslations(folder, manifest.id, 'ja', external),
  };
}

test('manual placement uses bundled selected language without creating external files or adding host languages', (t) => {
  const f = fixture(t);
  const choices = [...hostLanguages];
  f.bundled('applet_en.json', { name: 'Bundled English' });
  f.bundled('applet_fr.json', { name: 'French' });
  const translations = f.load();
  configureHostLanguage(() => 'en');
  assert.equal(translations.snapshot().messages.name, 'Bundled English');
  assert.equal(translations.snapshot().messages.fallback, '基本');
  assert.equal(fs.existsSync(f.external), false);
  assert.deepEqual(hostLanguages, choices);
  configureHostLanguage(() => 'fr');
  assert.equal(effectiveHostLanguage(), 'ja');
  assert.equal(translations.snapshot().messages.name, '表示名');
});

test('external selected, bundled selected, external base and bundled base resolve per key with validation', (t) => {
  const f = fixture(t);
  f.bundled('applet_en.json', {
    name: 'Bundled',
    title: 'Bundled title',
    named: '{{name}}: {{count}}',
  });
  f.outside('applet_en.json', {
    name: 'External',
    title: ' ',
    named: '{{other}}',
    another: false,
    unknown: 'ignored',
  });
  f.outside('applet.json', { title: '外部基本', fallback: '外部フォールバック', named: '{{bad}}' });
  const snapshot = f.load().snapshot('en');
  assert.deepEqual(snapshot.messages, {
    name: 'External',
    title: 'Bundled title',
    fallback: '外部フォールバック',
    named: '{{name}}: {{count}}',
    another: '追加',
  });
  assert.equal(
    appletText(snapshot, 'named', { name: '{{count}} $t(name)', count: 3 }),
    '{{count}} $t(name): 3',
  );
  assert.equal(appletText(snapshot, 'unknown'), 'unknown');
  snapshot.messages.name = 'mutated';
  assert.equal(f.load().snapshot('en').messages.name, 'External');
});

test('broken optional packs fall back, required dictionaries and incompatible declarations fail', (t) => {
  const f = fixture(t);
  f.bundled('applet_en.json', { name: 'Bundled' });
  f.outside('applet_en.json', {});
  fs.writeFileSync(path.join(f.external, 'applets/fixture.localized/applet_en.json'), '{');
  assert.equal(f.load().snapshot('en').messages.name, 'Bundled');
  assert.throws(
    () => loadAppletTranslations({ ...f.manifest, minimumHostVersion: '0.158.4' }, f.folder),
    /翻訳/,
  );
  assert.throws(
    () =>
      loadAppletTranslations(
        { ...f.manifest, localization: { defaultLanguage: '../en' } },
        f.folder,
      ),
    /翻訳/,
  );
  f.bundled('applet.json', { bad: false });
  assert.throws(() => f.load(), /翻訳/);
});

test('manifest translation changes presentation only, including stopped commands and nested settings', (t) => {
  const f = fixture(t);
  f.bundled('applet_en.json', { name: 'English name', title: 'English setting' });
  f.write(path.join(f.folder, 'extension.json'), {
    ...f.manifest,
    displayName: '%name%',
    capabilities: ['settings'],
    commands: [{ id: 'fixture.localized.run', title: '%title%' }],
    settings: [
      { key: 'message', type: 'string', title: '%title%', default: '%name%' },
      {
        key: 'choice',
        type: 'select',
        title: '%title%',
        default: '%name%',
        options: [{ label: '%name%', value: '%name%' }],
      },
    ],
  });
  const manifest = readManifest(f.folder);
  assert.equal(manifest.displayName, '表示名');
  configureHostLanguage(() => 'en');
  assert.equal(manifest.displayName, 'English name');
  assert.equal(manifest.settings[0].title, 'English setting');
  assert.equal(manifest.settings[0].default, '%name%');
  assert.equal(manifest.settings[1].options[0].value, '%name%');
  assert.equal(manifest.settings[1].options[0].label, 'English name');
  assert.equal(manifest.name, 'Fixture');
  assert.equal(appletTranslations(manifest).snapshot().language, 'en');
  const entry = {
    manifest,
    commands: [{ id: 'fixture.localized.run', title: 'Runtime literal' }],
    state: 'running',
  };
  const manager = Object.create(ExtensionManager.prototype);
  manager.settings = { value: { extensions: { 'fixture.localized': { enabled: true } } } };
  manager.canActivateForCommand = () => false;
  assert.equal(manager.commandCatalog(entry)[0].title, 'English setting');
  entry.commands = [];
  entry.state = 'stopped';
  assert.equal(manager.commandCatalog(entry)[0].title, 'English setting');
});

test('opt-in boundaries preserve literal legacy text and reject missing translation references', (t) => {
  const f = fixture(t);
  f.write(path.join(f.folder, 'extension.json'), {
    ...f.manifest,
    localization: undefined,
    displayName: '%name%',
  });
  assert.equal(readManifest(f.folder).displayName, '%name%');
  f.write(path.join(f.folder, 'extension.json'), { ...f.manifest, displayName: '%missing%' });
  assert.throws(() => readManifest(f.folder), /翻訳/);
});

test('linked dictionary directories cannot supply translations', (t) => {
  const f = fixture(t);
  const other = path.join(f.root, 'other');
  f.write(path.join(other, 'applet_en.json'), { name: 'outside' });
  fs.mkdirSync(path.join(f.external, 'applets'), { recursive: true });
  fs.symlinkSync(other, path.join(f.external, 'applets/fixture.localized'), 'junction');
  assert.equal(f.load().snapshot('en').messages.name, '表示名');
  // Remove the test junction before fixture cleanup, without traversing its target.
  fs.unlinkSync(path.join(f.external, 'applets/fixture.localized'));
});

test('translated presentation respects page and custom-command field constraints', (t) => {
  const f = fixture(t);
  f.bundled('applet_en.json', { name: 'x'.repeat(101), title: 'invalid\nheading' });
  const manifest = {
    ...f.manifest,
    pages: [{ title: '%title%' }],
    customCommandTypes: [
      {
        title: '%name%',
        description: '%title%',
        fields: [{ title: '%name%', options: [{ label: '%name%' }] }],
      },
    ],
  };
  f.load().bind(manifest);
  configureHostLanguage(() => 'en');
  assert.equal(manifest.pages[0].title, '設定');
  assert.equal(manifest.customCommandTypes[0].title, '表示名');
  assert.equal(manifest.customCommandTypes[0].fields[0].options[0].label, '表示名');
  f.bundled('applet.json', { name: 'x'.repeat(101), title: '設定' });
  assert.throws(
    () => f.load().bind({ ...f.manifest, customCommandTypes: [{ title: '%name%' }] }),
    /翻訳/,
  );
});
