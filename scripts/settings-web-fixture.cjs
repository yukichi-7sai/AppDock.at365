const fs = require('node:fs'),
  path = require('node:path');
/** Disabled remote collection: settings tests never open the external site. */
function installWebSettings(profile, settings, items = [], accounts = []) {
  const owner = 'fixture.web-settings';
  const fields = [
    { key: 'name', title: 'WebAppletの名前', type: 'string', default: '' },
    {
      key: 'url',
      title: 'WebAppletのURL',
      type: 'string',
      format: 'url',
      default: 'https://example.test/',
    },
    {
      key: 'display',
      title: 'WebAppletの表示方法',
      type: 'select',
      options: [
        { value: 'page', label: '本体ページ' },
        { value: 'window', label: '別ウィンドウ' },
      ],
      default: 'page',
    },
  ];
  const folder = path.join(profile, 'extensions', owner);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(
    path.join(folder, 'extension.json'),
    JSON.stringify({
      apiVersion: 1,
      id: owner,
      name: 'Web settings owner',
      version: '1.0.0',
      minimumHostVersion: '0.45.0',
      runtime: 'node',
      entry: 'index.cjs',
      capabilities: ['pages', 'dynamic-pages', 'settings', 'web-profiles'],
      settings: [{ key: 'items', title: '登録サイト', type: 'object-list', fields, default: [] }],
      pageCollections: [{ key: 'items', source: 'remote', fields }],
    }),
  );
  fs.writeFileSync(path.join(folder, 'index.cjs'), 'module.exports = {};');
  settings.extensions[owner] = { enabled: false, settings: { items } };
  const accountFile = path.join(profile, 'data', 'web-profiles', owner, 'accounts.json');
  fs.mkdirSync(path.dirname(accountFile), { recursive: true });
  fs.writeFileSync(accountFile, JSON.stringify({ schemaVersion: 1, accounts }));
  return owner;
}
module.exports = { installWebSettings };
