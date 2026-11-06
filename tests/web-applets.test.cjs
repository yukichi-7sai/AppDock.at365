const { siblingManifest } = require('./fixtures/sibling-manifest.cjs');
const {
  webUrl,
  allowedWebNavigation: allowedWebAppletNavigation,
} = require('../out/main/shared/web-content');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { validateCollectionRecords } = require('../out/main/shared/page-collections');
const definition = siblingManifest('Applet.WebApplet.at365').pageCollections[0];
const { createDefaultSettings, parseSettings } = require('../out/main/shared/settings-schema');
const { ribbonItems } = require('../out/main/shared/applet-pages');
const account = { id: `account.${randomUUID()}`, name: '仕事用' };
const item = {
  id: `web.${randomUUID()}`,
  name: 'ページ',
  url: 'https://app.example.com/start',
  accountId: account.id,
  enabled: true,
  display: 'page',
  navigation: 'same-origin',
  allowedOrigins: [],
  icon: '',
};
test('legacy settings no longer import or alter other applets', () => {
  const s = createDefaultSettings();
  s.webApplets = { items: [item], accounts: [account] };
  s.extensions['at365.gmail'] = { enabled: true, settings: { monitoring: true } };
  const next = parseSettings(s);
  assert.equal(next.webApplets, undefined);
  assert.deepEqual(next.extensions, s.extensions);
});
test('Web account references, identity, limits, protocols and icon formats are validated', () => {
  const good = { accounts: [account], items: [item] };
  assert.deepEqual(validateCollectionRecords(definition, good.items), good.items);
  for (const patch of [
    { accountId: 'at365.gmail' },
    { url: 'file:///A:/private' },
    { url: 'https://user:password@example.com/' },
    { icon: 'data:image/svg+xml;base64,PHN2Zz4=' },
    { navigation: 'unsafe' },
    { allowedOrigins: ['https://example.com/path'] },
    { id: 'web.../../bad' },
  ])
    assert.throws(() => validateCollectionRecords(definition, [{ ...item, ...patch }]));
  assert.throws(() => validateCollectionRecords(definition, [item, item]));
  for (const v of [
    'javascript:alert(1)',
    'data:text/html,secret',
    'ftp://example.com/',
    'https://example.com/\n',
  ])
    assert.throws(() => webUrl(v));
});
test('Navigation compares complete origins, not sibling subdomains or prefixes', () => {
  assert.equal(allowedWebAppletNavigation(item, 'https://app.example.com/other'), true);
  for (const url of [
    'https://app.example.com.evil.test/',
    'https://other.example.com/',
    'http://app.example.com/',
    'https://app.example.com:444/',
    'file:///A:/test',
  ])
    assert.equal(allowedWebAppletNavigation(item, url), false);
  assert.equal(
    allowedWebAppletNavigation({ ...item, navigation: 'none' }, item.url + '#anchor'),
    true,
  );
  assert.equal(
    allowedWebAppletNavigation({ ...item, navigation: 'none' }, 'https://app.example.com/other'),
    false,
  );
  assert.equal(
    allowedWebAppletNavigation(
      { ...item, allowedOrigins: ['https://login.example.com'] },
      'https://login.example.com/auth',
    ),
    true,
  );
  assert.equal(
    allowedWebAppletNavigation({ ...item, navigation: 'any' }, 'https://other.example.com/'),
    true,
  );
  assert.equal(
    allowedWebAppletNavigation({ ...item, navigation: 'any' }, 'javascript:alert(1)'),
    false,
  );
});
test('saved WebApplet identities retain ribbon preferences', () => {
  const s = createDefaultSettings();
  s.extensions['at365.web-applet'] = { enabled: true, settings: { items: [item] } };
  s.migrations = { webApplet: { version: 1, owner: 'at365.web-applet', ids: [item.id] } };
  s.ribbon.order = ['page:' + item.id + ':main'];
  const next = parseSettings(s);
  assert.deepEqual(next.ribbon, s.ribbon);
  assert.equal(next.extensions['at365.web-applet'].settings.items[0].id, item.id);
});
