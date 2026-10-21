const { test } = require('node:test');
const assert = require('node:assert/strict');
const { settingsCatalog } = require('../out/main/shared/settings-catalog');
const { settingsPageCommands } = require('../out/main/shared/settings-navigation');
const { hostCommandsForApplets, validCommandId } = require('../out/main/shared/commands');
const { createDefaultSettings } = require('../out/main/shared/settings-schema');
const { automationCommands } = require('../out/main/main/core/automation-commands');
const { updateCommands } = require('../out/main/shared/update-commands');
const { trayCommandCatalog, resolveTrayMenu } = require('../out/main/shared/tray-menu');

const applet = (id, displayName, extra = {}) => ({
  id,
  displayName,
  enabled: false,
  state: 'stopped',
  commands: [],
  settings: [],
  ...extra,
});
test('every settings index page has one public command, including new and disabled Applets', () => {
  const applets = [
    applet('test.stopped', 'Stopped'),
    applet('web.child', 'Child', { collection: {} }),
  ];
  const settings = createDefaultSettings();
  const verify = () => {
    const pages = settingsCatalog(applets, settings);
    const commands = settingsPageCommands(applets);
    assert.deepEqual(new Set(commands.map((c) => c.pageId)), new Set(pages.map((p) => p.id)));
    assert.equal(commands.length, pages.length);
    assert.equal(new Set(commands.map((c) => c.id)).size, commands.length);
    const ui = hostCommandsForApplets(applets);
    const published = automationCommands(applets);
    const tray = trayCommandCatalog(applets);
    for (const c of commands) {
      assert(validCommandId(c.id));
      assert.equal(ui.filter((x) => x.id === c.id).length, 1);
      const publicCommand = published.find((x) => x.id === c.id);
      assert.equal(publicCommand.available, true);
      assert.equal(publicCommand.appletId, null);
      const resolved = resolveTrayMenu(
        [{ id: 'navigation', type: 'command', command: c.id }],
        tray,
      );
      assert.equal(resolved[0].enabled, true);
      assert.equal(resolved[0].title, c.title);
      assert.equal(
        publicCommand.description,
        `${pages.find((p) => p.id === c.pageId).title}の設定を開きます。`,
      );
    }
    return commands;
  };
  verify();
  applets.push(applet('test.new', 'New Applet'));
  const commands = verify();
  assert.equal(
    commands.find((c) => c.pageId === 'shortcuts').title,
    'ショートカットキー設定を開く',
  );
  assert.equal(commands.find((c) => c.pageId === 'gestures').title, 'マウスジェスチャー設定を開く');
  assert.equal(commands.find((c) => c.pageId === 'ribbon').id, 'appdock.ribbon.settings.open');
  assert.equal(commands.find((c) => c.pageId === 'about').id, 'appdock.updates.open');
  const before = commands.find((c) => c.pageId === 'applet:test.new').id;
  applets.at(-1).displayName = 'Renamed';
  assert.equal(verify().find((c) => c.pageId === 'applet:test.new').id, before);
  applets.pop();
  assert(!verify().some((c) => c.id === before));
});
test('update commands are public with descriptions and preserve the existing settings command', () => {
  const commands = automationCommands([]);
  for (const update of updateCommands) {
    const published = commands.find((c) => c.id === update.id);
    assert.equal(published.title, update.title);
    assert.equal(published.description, update.description);
    assert.equal(published.completion, 'handlerReturned');
    assert.equal(published.available, true);
  }
  assert.equal(commands.find((c) => c.id === 'appdock.settings.open').title, '設定を開く');
  assert(!commands.some((c) => ['appdock.quit', 'appdock.restart'].includes(c.id)));
});
