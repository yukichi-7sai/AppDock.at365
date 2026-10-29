const assert = require('node:assert/strict');
exports.check = async ({ app, local, shared, assets, checks }) => {
  const result = await app.evaluate(
    async ({ app, BrowserWindow }, data) => {
      const path = process.mainModule.require('node:path'),
        fs = process.mainModule.require('node:fs');
      const load = (name) =>
        process.mainModule.require(path.join(app.getAppPath(), 'out/main/main/core', name + '.js'));
      const accountApi = load('web-accounts'),
        { webAccountSettingsTargets } = load('settings-web-account-target');
      const definition = {
        url: 'https://mail.fixture.test/',
        observeOrigin: 'https://mail.fixture.test',
        origins: ['https://mail.fixture.test'],
        ui: 'index.html',
        observer: 'observer.js',
      };
      const privateId = 'fixture.private-service';
      const privateController = accountApi.getWebAccounts(
        privateId,
        'Private fixture',
        data.assets,
        data.local,
        definition,
        { sharedRoot: data.shared, capabilities: [], shortcut: () => false, failed: () => {} },
      );
      try {
        const make = (id, webAccounts) => ({
          id,
          displayName: id,
          enabled: true,
          state: 'running',
          capabilities: ['web-accounts'],
          webAccounts,
        });
        const owners = [
          make('fixture.mail', {
            ...definition,
            accountGroup: { id: 'fixture.google', title: 'Shared fixture' },
          }),
          make(privateId, definition),
        ];
        const options = {
          applets: owners,
          localRoot: data.local,
          sharedRoot: data.shared,
          checkRevision: (revision) => {
            if (revision !== 'fixture') throw Error('Bad fixture revision');
          },
          changed: () => {},
        };
        const targets = () => webAccountSettingsTargets(options),
          privateTarget = targets().find((t) => t.ownerId === privateId);
        const initial = privateController.snapshot(),
          windows = BrowserWindow.getAllWindows().length;
        const rows = privateTarget.rows();
        rows[0].name = 'MCP live private';
        const newId = '33333333-3333-4333-8333-333333333333';
        rows.push({ id: newId, name: 'MCP live addition' });
        privateTarget.plan(rows, 'fixture').commit();
        const after = privateController.snapshot();
        const noViews =
          privateController.views.size === 0 && BrowserWindow.getAllWindows().length === windows;
        const groupTarget = targets().find((t) => t.ownerId === 'fixture.mail'),
          groupRows = groupTarget.rows(),
          originalName = groupRows[0].name;
        groupRows[0].name = 'MCP live shared';
        groupTarget.plan(groupRows, 'fixture').commit();
        const sharedNames = [
          groupFixture.mail.snapshot().accounts[0].name,
          groupFixture.calendar.snapshot().accounts[0].name,
        ];
        const restore = targets().find((t) => t.ownerId === 'fixture.mail'),
          restored = restore.rows();
        restored[0].name = originalName;
        restore.plan(restored, 'fixture').commit();
        const mismatch = webAccountSettingsTargets({
          ...options,
          applets: [
            make(privateId, {
              ...definition,
              accountGroup: { id: 'fixture.other', title: 'Different' },
            }),
          ],
        })[0];
        const pending = targets().find((t) => t.ownerId === privateId),
          pendingRows = pending.rows();
        pendingRows[0].name = 'Must not save';
        const plan = pending.plan(pendingRows, 'fixture');
        await accountApi.closeWebAccounts(privateId);
        let closedCode;
        try {
          plan.commit();
        } catch (error) {
          closedCode = error.code;
        }
        const raw = JSON.parse(
          fs.readFileSync(path.join(data.local, 'web-accounts', privateId, 'accounts.json')),
        );
        return {
          initialSelected: initial.selected,
          selected: after.selected,
          privateNames: after.accounts.map((a) => a.name),
          noViews,
          sharedNames,
          mismatchAvailable: mismatch.available,
          closedCode,
          persistedName: raw.accounts[0].name,
        };
      } finally {
        await accountApi.closeWebAccounts(privateId);
      }
    },
    { local, shared, assets },
  );
  assert.equal(result.selected, result.initialSelected);
  assert.deepEqual(result.privateNames, ['MCP live private', 'MCP live addition']);
  assert.equal(result.noViews, true);
  assert.deepEqual(result.sharedNames, ['MCP live shared', 'MCP live shared']);
  assert.equal(result.mismatchAvailable, false);
  assert.equal(result.closedCode, 'UNAVAILABLE');
  assert.equal(result.persistedName, 'MCP live private');
  checks.push(
    'Public service roster plans update live private/shared owners without selecting a new account or opening a private page; changed declarations and disposed owners reject stale commits',
  );
};
