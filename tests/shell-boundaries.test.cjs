const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path');
const root = path.resolve(__dirname, '..');
const inside = (file, directory) => file === directory || file.startsWith(directory + path.sep);
const shell = path.join(root, 'shells', 'default');
const host = path.join(root, 'src');
const sdk = path.join(host, 'shared');
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file) : /\.(tsx?|c?js)$/.test(file) ? [file] : [];
  });
}
test('host and Default Shell communicate through public contracts, without cross-importing implementations', () => {
  const violations = [];
  for (const file of [...files(host), ...files(shell)]) {
    // Guard literal module edges; the generic manifest/resource loader is intentionally separate.
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(
      /\b(?:from\s*|import\s*(?:\(\s*)?|require\s*\(\s*)['"]([^'"]+)['"]/g,
    )) {
      const specifier = match[1];
      if (!specifier.startsWith('.') && !path.isAbsolute(specifier)) continue;
      const target = path.resolve(path.dirname(file), specifier);
      if (
        (inside(file, host) && inside(target, shell)) ||
        (inside(file, shell) && inside(target, host) && !inside(target, sdk))
      ) {
        violations.push(path.relative(root, file) + ' -> ' + specifier);
      }
    }
  }
  assert.deepEqual(violations, []);
});
test('settings UI ships only in the host renderer, with no settings Shell entry', () => {
  assert.equal(fs.existsSync(path.join(sdk, 'settings-ui')), false);
  assert.equal(fs.existsSync(path.join(shell, 'settings.html')), false);
  assert(fs.existsSync(path.join(host, 'renderer/settings/SettingsPage.tsx')));
  const manifest = JSON.parse(fs.readFileSync(path.join(shell, 'extension.json'), 'utf8'));
  assert.equal(manifest.shell.views['page.settings'], undefined);
  assert.equal(fs.existsSync(path.join(root, 'src/main/shell-page-preload.ts')), false);
  assert.equal(fs.existsSync(path.join(host, 'renderer/pages/HomePage.tsx')), false);
  assert.equal(fs.existsSync(path.join(host, 'main/core/home-page.ts')), false);
  for (const name of ['LogPage', 'NotificationCenterPage', 'ImageLibraryPage'])
    assert(fs.existsSync(path.join(host, 'renderer/pages', name + '.tsx')));
  assert(Object.keys(manifest.shell.views).every((region) => !region.startsWith('page.')));
});

test('window bars are rendered only by the selected Shell and ship in the default manifest', () => {
  const source = fs.readFileSync(path.join(host, 'renderer/main.tsx'), 'utf8');
  assert(!source.includes('<header className="titlebar">'));
  assert(!source.includes('<footer className="statusbar">'));
  assert(!fs.existsSync(path.join(host, 'renderer/UpdateProgress.tsx')));
  const manifest = JSON.parse(fs.readFileSync(path.join(shell, 'extension.json'), 'utf8'));
  for (const region of ['titlebar', 'statusbar'])
    assert(fs.existsSync(path.join(shell, manifest.shell.views[region])));
});
