const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { settleSettings } = require('./settings-immediate-helper.cjs');
const { normalizeShortcut } = require('../out/main/shared/commands');

module.exports = async ({
  host,
  select,
  snapshot,
  until,
  inspect,
  inspector,
  electronExpression,
  profile,
  checks,
}) => {
  const samples = [];
  const interactions = [];
  const pages = [
    [
      'Applet管理',
      '.applet-management-actions .settings-list-icon, .applet-management-links .settings-list-icon',
    ],
    ['リボン', '.ribbon-row-controls .settings-list-icon'],
    ['タスクトレイ', '.tray-row-controls .settings-list-icon'],
    ['ショートカットキー', '.command-binding-table .settings-list-icon'],
    ['マウスジェスチャー', '.command-binding-table .settings-list-icon'],
    ['カスタムコマンド', '.settings-list tbody .settings-list-icon'],
    ['AI', '.ai-connection-table .settings-list-icon'],
    ['MCPクライアント', '.settings-list tbody .settings-list-icon'],
  ];
  const change = (patch) =>
    host.evaluate(async (patch) => {
      const s = await window.dock.snapshot();
      await window.dock.saveSettings(
        { ...s.settings.value, host: { ...s.settings.value.host, ...patch } },
        s.settings.revision,
      );
    }, patch);
  const binding = (id) => host.locator(`[data-binding-id="${id}"]`);
  for (const theme of ['light', 'dark']) {
    await change({ theme });
    for (const width of [1280, 760]) {
      await inspect(
        inspector,
        `(${(e, width) => {
          const window = e.BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
          window.setMinimumSize(600, 600);
          window.setSize(width, 900);
        }})(${electronExpression},${width})`,
      );
      assert.equal(await host.evaluate(() => innerWidth), width);
      await until(
        () =>
          host.evaluate(async () => {
            const connection =
              document.querySelector('.settings-surface').dataset.settingsConnection;
            return (
              (await window.dock.settingsPage.get(connection)).content.hostWidth === innerWidth
            );
          }),
        'resized host',
      );
      let reference;
      for (const [title, selector] of pages) {
        await select(title);
        if (['Applet管理', 'AI', 'MCPクライアント'].includes(title)) {
          const order = host.getByRole('button', { name: /並べ替え/ });
          assert.equal(await order.count(), 1, title + ' has one order action');
          assert.equal(
            await order.evaluate(
              (e) =>
                !!e.closest('thead th') &&
                e.previousElementSibling?.matches('.applet-shortcut-add') &&
                e.parentElement.getBoundingClientRect().right <=
                  e.closest('th').getBoundingClientRect().right + 1 &&
                getComputedStyle(e.parentElement).whiteSpace === 'nowrap',
            ),
            true,
            title + ' places order immediately after add in its name header',
          );
          assert.equal(
            await host
              .locator('.command-list-toolbar, .settings-list-toolbar, .ai-connections-toolbar')
              .getByRole('button', { name: /並べ替え/ })
              .count(),
            0,
            title + ' toolbar has no duplicate order action',
          );
          if (!(await order.isDisabled())) {
            const before = (await snapshot()).settings.value;
            await order.click();
            const dialog = host.getByRole('dialog');
            await dialog.waitFor();
            await dialog.press('Escape');
            await dialog.waitFor({ state: 'hidden' });
            assert.deepEqual((await snapshot()).settings.value, before);
          }
          await host.screenshot({
            path: path.join(profile, `header-actions-${theme}-${width}-${title}.png`),
          });
        }
        await host.getByRole('heading', { level: 1 }).hover();
        const geometry = await host.locator(selector).evaluateAll((buttons) => {
          const probe = document.createElement('span');
          probe.style.cssText =
            'display:none;background:transparent;color:var(--text);border:1px solid transparent';
          document.body.append(probe);
          const normal = getComputedStyle(probe);
          const result = buttons.map((button) => {
            const r = button.getBoundingClientRect(),
              s = getComputedStyle(button),
              cell = button.closest('td');
            return {
              label: button.getAttribute('aria-label'),
              width: r.width,
              height: r.height,
              color: s.color,
              background: s.backgroundColor,
              radius: s.borderRadius,
              border: s.borderColor,
              accent: button.classList.contains('accent-action'),
              expectedColor: normal.color,
              expectedBackground: normal.backgroundColor,
              expectedBorder: normal.borderColor,
              insideCell:
                !cell ||
                (r.left >= cell.getBoundingClientRect().left &&
                  r.right <= cell.getBoundingClientRect().right),
              rect: r.toJSON(),
              cell: cell?.getBoundingClientRect().toJSON(),
              gap: getComputedStyle(button.parentElement).gap,
            };
          });
          probe.remove();
          return result;
        });
        assert(geometry.length, title + ' has row actions');
        if (!reference) reference = geometry.find((button) => !button.accent);
        for (const button of geometry) {
          assert.equal(button.width, 32, title + ': ' + button.label);
          assert.equal(button.height, 32, title + ': ' + button.label);
          assert.equal(button.radius, reference.radius);
          assert(
            button.insideCell,
            title + ': actions stay inside their cells: ' + JSON.stringify(button),
          );
          assert.equal(button.background, button.expectedBackground, title + ': ' + button.label);
          assert.equal(button.border, button.expectedBorder, title + ': ' + button.label);
          if (!button.accent) {
            assert.equal(button.color, button.expectedColor, title + ': ' + button.label);
          }
        }
        samples.push({ theme, width, page: title, geometry });
        const buttons = host.locator(selector);
        const candidates = await buttons.evaluateAll((buttons) =>
          [false, true].map((accent) =>
            buttons.findIndex(
              (button) => !button.disabled && button.classList.contains('accent-action') === accent,
            ),
          ),
        );
        for (const index of candidates.filter((index) => index >= 0)) {
          const button = buttons.nth(index);
          const read = () =>
            button.evaluate((e) => {
              const accent = e.classList.contains('accent-action');
              const probe = document.createElement('span');
              probe.style.cssText = `display:none;background:var(${accent ? '--accent-hover' : '--panel'});border:1px solid var(${accent ? '--accent-hover' : '--border'})`;
              document.body.append(probe);
              const style = getComputedStyle(e),
                expected = getComputedStyle(probe),
                rect = e.getBoundingClientRect();
              const result = {
                width: rect.width,
                height: rect.height,
                background: style.backgroundColor,
                border: style.borderColor,
                borderStyle: style.borderStyle,
                borderWidth: style.borderWidth,
                filter: style.filter,
                expectedBackground: expected.backgroundColor,
                expectedBorder: expected.borderColor,
                focused: e.matches(':focus-visible'),
              };
              probe.remove();
              return result;
            });
          const rest = await read();
          assert.equal(rest.background, 'rgba(0, 0, 0, 0)');
          assert.equal(rest.border, 'rgba(0, 0, 0, 0)');
          await button.hover();
          const hover = await read();
          assert.equal(hover.background, hover.expectedBackground);
          assert.equal(hover.border, hover.expectedBorder);
          assert.equal(hover.borderStyle, 'solid');
          assert(parseFloat(hover.borderWidth) > 0);
          assert.equal(
            hover.filter,
            'none',
            'hover keeps the neutral border from bleaching into the background',
          );
          await host.getByRole('heading', { level: 1 }).hover();
          await button.focus();
          await host.keyboard.press('Tab');
          await host.keyboard.press('Shift+Tab');
          const focus = await read();
          assert(focus.focused);
          assert.equal(focus.background, focus.expectedBackground);
          assert.equal(focus.border, focus.expectedBorder);
          for (const state of [rest, hover, focus]) {
            assert.equal(state.width, 32);
            assert.equal(state.height, 32);
          }
          interactions.push({
            theme,
            width,
            page: title,
            label: await button.getAttribute('aria-label'),
            rest,
            hover,
            focus,
          });
          await button.evaluate((e) => e.blur());
        }
        if (title === 'ショートカットキー' || title === 'マウスジェスチャー') {
          const s = (await snapshot()).settings.value;
          const gestures = title === 'マウスジェスチャー';
          const rows = gestures ? s.gestures.bindings : s.keybindings;
          const key = (row) => (gestures ? row.gesture : normalizeShortcut(row.key));
          const groups = new Map();
          for (const row of rows) {
            if (!groups.has(key(row))) groups.set(key(row), new Set());
            groups.get(key(row)).add(row.command);
          }
          assert.deepEqual(await host.locator('.command-binding-table th').allTextContents(), [
            'コマンド',
            '割り当て',
            '操作',
            '移動',
          ]);
          assert.equal(await host.locator('.gesture-menu-trigger').count(), 0);
          for (const row of rows) {
            const multiple = groups.get(key(row)).size >= 2;
            const actions = binding(row.id).locator('.binding-row-actions');
            assert.deepEqual(
              await actions.locator('button').evaluateAll((buttons) => buttons.map((b) => b.title)),
              [
                '編集',
                `この${gestures ? 'ジェスチャー' : 'キー'}の実行順${multiple ? '（複数のコマンド）' : ''}`,
                '削除',
              ],
            );
            assert.equal(
              await actions.locator('.binding-order').getAttribute('data-multiple-commands'),
              String(multiple),
            );
            assert.equal(await actions.locator('.accent-action').count(), multiple ? 1 : 0);
            const alignment = await binding(row.id).evaluate((tr) => {
              const a = tr.querySelector('.applet-shortcut-value').getBoundingClientRect();
              const b = tr.querySelector('.binding-row-actions').getBoundingClientRect();
              return {
                delta: Math.abs(a.top + a.height / 2 - b.top - b.height / 2),
                value: a.toJSON(),
                actions: b.toJSON(),
                rowHeight: tr.getBoundingClientRect().height,
                badgeColor: getComputedStyle(tr.querySelector('kbd')).color,
                textColor: getComputedStyle(tr).color,
                orderColor: getComputedStyle(tr.querySelector('.binding-order')).color,
                lastAssignment: tr === tr.parentElement.lastElementChild,
                lastCommand: tr.parentElement === tr.closest('table').lastElementChild,
                padding: [...tr.querySelectorAll('.binding-value-cell, .binding-actions-cell')].map(
                  (cell) => ({
                    top: getComputedStyle(cell).paddingTop,
                    bottom: getComputedStyle(cell).paddingBottom,
                    border: getComputedStyle(cell).borderBottomWidth,
                  }),
                ),
              };
            });
            assert(alignment.delta < 1, JSON.stringify(alignment));
            assert.equal(
              alignment.badgeColor,
              multiple ? alignment.orderColor : alignment.textColor,
              'input badge uses accent only for multiple commands',
            );
            (samples.at(-1).bindings ??= []).push({ id: row.id, ...alignment });
          }
          const filter = host.getByLabel(
            gestures ? 'ジェスチャーのコマンドを検索' : 'ショートカットキーのコマンドを検索',
          );
          await filter.fill('fixture.hints.run');
          await host.locator('.binding-row-actions').first().scrollIntoViewIfNeeded();
          await host.screenshot({
            path: path.join(
              profile,
              `actions-${gestures ? 'gestures' : 'keys'}-${theme}-${width}.png`,
            ),
          });
          await filter.fill('');
        }
      }
      checks.push(
        `${theme}/${width}: eight lists share 32px transparent icons, hover/keyboard focus surfaces, four binding columns and per-input assignment indicators`,
      );
    }
  }
  await require('./binding-input-filter-checks.cjs')({
    host,
    select,
    snapshot,
    until,
    profile,
    checks,
  });
  for (const [page, id, editor] of [
    ['ショートカットキー', 'nav.owner', '.applet-shortcut-dialog'],
    ['マウスジェスチャー', 'actions.gesture', '.gesture-binding-dialog'],
  ]) {
    await select(page);
    const before = structuredClone((await snapshot()).settings.value);
    const filter = host.getByLabel(
      page === 'ショートカットキー'
        ? 'ショートカットキーのコマンドを検索'
        : 'ジェスチャーのコマンドを検索',
    );
    await filter.fill('fixture.hints.run');
    assert.equal(
      await binding(id).locator('.binding-order.accent-action').count(),
      1,
      'other commands outside filter still count',
    );
    await binding(id).locator('.applet-shortcut-edit').focus();
    await host.keyboard.press('Enter');
    await host.locator(editor).waitFor();
    await host.locator(editor).press('Escape');
    assert(
      await binding(id)
        .locator('.applet-shortcut-edit')
        .evaluate((e) => e === document.activeElement),
    );
    await binding(id).locator('.binding-order').click();
    const order = host.locator('.shortcut-order-dialog');
    await order.waitFor();
    assert((await order.locator('[data-order-binding]').count()) >= 2);
    await order.press('Escape');
    assert(
      await binding(id)
        .locator('.binding-order')
        .evaluate((e) => e === document.activeElement),
    );
    assert.deepEqual((await snapshot()).settings.value, before, 'cancel preserves saved settings');
    await binding(id).locator('.binding-delete').click();
    await settleSettings(host);
    assert.equal(await host.getByRole('alertdialog').count(), 0);
    assert.equal(await binding(id).count(), 0);
    const after = (await snapshot()).settings.value;
    await filter.fill('');
    const affected =
      page === 'ショートカットキー'
        ? after.keybindings.filter(
            (row) =>
              normalizeShortcut(row.key) ===
              normalizeShortcut(before.keybindings.find((row) => row.id === id).key),
          )
        : after.gestures.bindings.filter(
            (row) => row.gesture === before.gestures.bindings.find((row) => row.id === id).gesture,
          );
    assert(affected.length > 0);
    for (const row of affected) {
      assert.equal(
        await binding(row.id).locator('.binding-order').getAttribute('data-multiple-commands'),
        'false',
        'deletion refreshes the remaining order indicator',
      );
    }
    if (page === 'ショートカットキー') {
      assert.deepEqual(
        after.keybindings,
        before.keybindings.filter((row) => row.id !== id),
      );
      assert.deepEqual(after.gestures, before.gestures);
    } else {
      assert.deepEqual(
        after.gestures.bindings,
        before.gestures.bindings.filter((row) => row.id !== id),
      );
      assert.deepEqual(after.keybindings, before.keybindings);
    }
    checks.push(
      `${page}: filtered direct edit/order keyboard focus, cancel, immediate delete and unrelated bindings preserved`,
    );
  }
  await select('ショートカットキー');
  await host.getByLabel('ショートカットキーのコマンドを検索').fill('');
  await host.evaluate(() => window.dock.executeCommand('appdock.settings.showHints.off'));
  await until(async () => (await snapshot()).settings.value.host.showHints === false, 'hints off');
  assert.equal(
    await binding('actions.duplicate.one').locator('.binding-row-actions button').count(),
    3,
  );
  checks.push('direct action labels remain available with hints OFF');
  fs.writeFileSync(path.join(profile, 'list-actions.json'), JSON.stringify(samples, null, 2));
  fs.writeFileSync(
    path.join(profile, 'list-icon-states.json'),
    JSON.stringify(interactions, null, 2),
  );
};
