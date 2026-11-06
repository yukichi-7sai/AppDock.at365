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
const item = {
  id: randomUUID(),
  name: 'ページ',
  url: 'https://app.example.com/start',
  enabled: true,
  display: 'page',
  navigation: 'same-origin',
  allowedOrigins: [],
  icon: '',
};
test('legacy settings no longer import or alter other applets', () => {
  const s = createDefaultSettings();
  s.webApplets = { items: [item], accounts: [] };
  s.extensions['at365.gmail'] = { enabled: true, settings: { monitoring: true } };
  const next = parseSettings(s);
  assert.equal(next.webApplets, undefined);
  assert.deepEqual(next.extensions, s.extensions);
});
test('site UUIDs, protocols and icon formats are validated', () => {
  assert.deepEqual(validateCollectionRecords(definition, [item]), [item]);
  for (const patch of [
    { id: 'at365.gmail' },
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
test('site identities and ribbon preferences survive settings round trips', () => {
  const s = createDefaultSettings();
  s.extensions['at365.web-applet'] = { enabled: true, settings: { sites: [item] } };
  s.ribbon.order = ['page:at365.web-applet.sites.' + item.id + ':main'];
  const next = parseSettings(s);
  assert.deepEqual(next.ribbon, s.ribbon);
  assert.equal(next.extensions['at365.web-applet'].settings.sites[0].id, item.id);
});
