const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

function readStarterDefinition(root) {
  const definition = JSON.parse(
    fs.readFileSync(path.join(root, 'scripts/starter-applets.json'), 'utf8').replace(/^\uFEFF/, ''),
  );
  assert.equal(definition.schemaVersion, 1, 'Invalid starter definition');
  assert.ok(
    Array.isArray(definition.applets) && definition.applets.length,
    'Starter roster is empty',
  );
  const repositories = new Set();
  const ids = new Set();
  for (const item of definition.applets) {
    assert.ok(
      typeof item.repository === 'string' &&
        /^Applet\.[A-Za-z0-9][A-Za-z0-9._-]*$/.test(item.repository) &&
        !item.repository.endsWith('.'),
      'Invalid starter repository',
    );
    assert.ok(
      typeof item.id === 'string' && item.id.trim() === item.id && item.id.length,
      'Invalid starter Applet ID',
    );
    assert.ok(!repositories.has(item.repository.toLowerCase()), 'Duplicate starter repository');
    assert.ok(!ids.has(item.id.toLowerCase()), 'Duplicate Applet ID');
    repositories.add(item.repository.toLowerCase());
    ids.add(item.id.toLowerCase());
  }
  return definition.applets;
}

function starterSources(root) {
  return readStarterDefinition(root).map(({ repository, id }) => {
    const directory = path.join(path.dirname(root), repository);
    assert.ok(fs.existsSync(directory), `Missing starter repository: ${repository}`);
    const info = fs.lstatSync(directory);
    assert.ok(
      info.isDirectory() && !info.isSymbolicLink(),
      `Starter repository cannot be a link: ${repository}`,
    );
    assert.ok(
      fs.existsSync(path.join(directory, '.git')),
      `Missing Applet Git repository: ${repository}`,
    );
    for (const name of ['extension.json', 'publish.bat']) {
      assert.ok(
        fs.existsSync(path.join(directory, name)) &&
          fs.statSync(path.join(directory, name)).isFile(),
        `Missing ${name}: ${repository}`,
      );
    }
    const manifest = JSON.parse(
      fs.readFileSync(path.join(directory, 'extension.json'), 'utf8').replace(/^\uFEFF/, ''),
    );
    assert.equal(manifest.id, id, `Starter Applet ID mismatch: ${repository}`);
    return { repository, id, version: manifest.version, directory };
  });
}

module.exports = { readStarterDefinition, starterSources };
