const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { settleSettings } = require('./settings-immediate-helper.cjs');
module.exports = async ({ host, select, snapshot, until, profile, checks }) => {
  const id = 'appdock.custom.00000000-0000-0000-0000-000000000002';
  const firstId = 'appdock.custom.00000000-0000-0000-0000-000000000001';
  const row = (command) => host.locator(`[data-shortcut-command="${command}"]`);
  const customRow = (title) =>
    host
      .locator('.custom-commands-settings tbody tr')
      .filter({ has: host.getByText(title, { exact: true }) });
  const filterPositions = [];
  const checkFilterFit = async (kind) => {
    const fit = await host.locator('.command-provider-filter').evaluate((e) => {
      const rect = e.getBoundingClientRect(),
        style = getComputedStyle(e);
      const span = e.querySelector('span').getBoundingClientRect(),
        button = e.querySelector('button').getBoundingClientRect();
      const content =
        span.width +
        button.width +
        parseFloat(style.gap) +
        parseFloat(style.paddingLeft) +
        parseFloat(style.paddingRight) +
        parseFloat(style.borderLeftWidth) +
        parseFloat(style.borderRightWidth);
      const clone = e.cloneNode(true);
      clone.querySelector('strong').textContent = 'Long provider and command name '.repeat(25);
      e.parentElement.append(clone);
      const long = {
        width: clone.getBoundingClientRect().width,
        parent: e.parentElement.clientWidth,
        scrollWidth: clone.scrollWidth,
        clientWidth: clone.clientWidth,
        buttonInside:
          clone.querySelector('button').getBoundingClientRect().right <=
          clone.getBoundingClientRect().right,
        actionsInside: (() => {
          const summary = e.closest('.command-list-summary');
          return (
            summary.querySelector('.command-list-summary-actions').getBoundingClientRect().right <=
            summary.getBoundingClientRect().right + 1
          );
        })(),
      };
      clone.remove();
      return { width: rect.width, parent: e.parentElement.clientWidth, content, long };
    });
    assert(Math.abs(fit.width - fit.content) < 2, kind + ' chip fits its text and clear action');
    assert(fit.width < fit.parent - 20, kind + ' chip does not stretch across the list');
    assert(
      fit.long.width <= fit.long.parent + 1 &&
        fit.long.scrollWidth <= fit.long.clientWidth + 1 &&
        fit.long.buttonInside &&
        fit.long.actionsInside,
      kind + ' long names wrap without hiding the clear action',
    );
    filterPositions.push({ kind: 'fit-' + kind, ...fit });
  };
  const checkFilterPlacement = async (kind) => {
    await checkFilterFit(kind);
    const position = await host.locator('.command-provider-filter').evaluate((filter) => {
      const summary = filter.closest('.command-list-summary');
      const count = summary.querySelector('.command-list-summary-main > span');
      const actions = summary.querySelector('.command-list-summary-actions');
      const toolbar = summary.closest('.command-list-toolbar');
      const tools = toolbar.querySelector('.command-shortcut-tools');
      const rect = filter.getBoundingClientRect();
      const heightWithFilter = summary.getBoundingClientRect().height;
      filter.style.display = 'none';
      const heightWithoutFilter = summary.getBoundingClientRect().height;
      filter.style.removeProperty('display');
      const color = (value) => {
        const sample = document.createElement('span');
        sample.style.color = value;
        filter.append(sample);
        const resolved = getComputedStyle(sample).color;
        sample.remove();
        return resolved;
      };
      return {
        count: toolbar.querySelectorAll('.command-provider-filter').length,
        heightWithFilter,
        heightWithoutFilter,
        afterCount: !!(count.compareDocumentPosition(filter) & Node.DOCUMENT_POSITION_FOLLOWING),
        afterSearch: !tools || rect.top >= tools.getBoundingClientRect().bottom,
        inside:
          rect.right <= actions.getBoundingClientRect().left + 1 &&
          rect.left >= summary.getBoundingClientRect().left,
        sameRow:
          Math.abs(
            rect.top +
              rect.height / 2 -
              count.getBoundingClientRect().top -
              count.getBoundingClientRect().height / 2,
          ) < 1,
        color: getComputedStyle(filter).color,
        background: getComputedStyle(filter).backgroundColor,
        accent: color('var(--accent)'),
        soft: color('var(--accent-soft)'),
      };
    });
    assert.equal(position.count, 1);
    assert(
      position.afterCount && position.afterSearch && position.inside,
      JSON.stringify(position),
    );
    if (host.viewportSize().width >= 1280) assert(position.sameRow);
    assert.equal(position.color, position.accent);
    assert.equal(position.background, position.soft);
    assert(
      Math.abs(position.heightWithFilter - position.heightWithoutFilter) < 1,
      'temporary filter does not change summary height: ' + JSON.stringify(position),
    );
    const clear = host.locator('.command-provider-clear');
    await clear.focus();
    await host.keyboard.press('Shift+Tab');
    await host.keyboard.press('Tab');
    for (const state of ['focus', 'hover']) {
      if (state === 'hover') await clear.hover();
      const colors = await clear.evaluate((e) => {
        const sample = document.createElement('span');
        e.append(sample);
        sample.style.color = 'var(--accent-hover)';
        const background = getComputedStyle(sample).color;
        sample.style.color = 'var(--accent-text)';
        const foreground = getComputedStyle(sample).color;
        sample.remove();
        return {
          background,
          foreground,
          actualBackground: getComputedStyle(e).backgroundColor,
          actualForeground: getComputedStyle(e).color,
        };
      });
      assert.equal(colors.actualBackground, colors.background, state);
      assert.equal(colors.actualForeground, colors.foreground, state);
    }
    await host.mouse.move(1, 1);
    await clear.evaluate((e) => e.blur());
    filterPositions.push({ kind, ...position });
    return position;
  };
  const move = async (from, title, page) => {
    await from.getByRole('button', { name: `${title}の${page}を開く`, exact: true }).click();
    await host
      .getByRole('heading', {
        level: 1,
        name: page === 'ショートカット' ? 'ショートカットキー' : page,
        exact: true,
      })
      .waitFor();
    await until(
      async () =>
        (await host.locator('.command-provider-filter').filter({ hasText: title }).count()) === 1,
      'command target filter',
    );
    await checkFilterPlacement('command-' + page);
  };
  const samples = [];
  const spacing = [];
  const checkLinks = async (page, theme, width) => {
    const cells = host.locator('.command-settings-cell');
    const measurements = await cells.evaluateAll(
      (elements, customIds) =>
        elements.map((cell) => {
          const buttons = [...cell.querySelectorAll('button')];
          return {
            buttons: buttons.length,
            custom: customIds.includes(
              cell.closest('[data-shortcut-command]')?.dataset.shortcutCommand,
            ),
            gap: cell.getBoundingClientRect().right - buttons.at(-1).getBoundingClientRect().right,
            padding: parseFloat(getComputedStyle(cell).paddingRight),
            leftGap: buttons[0].getBoundingClientRect().left - cell.getBoundingClientRect().left,
            leftPadding: parseFloat(getComputedStyle(cell).paddingLeft),
            labels: buttons.map((button) => button.getAttribute('aria-label')),
          };
        }),
      [firstId, id],
    );
    assert(measurements.length > 0);
    for (const item of measurements) {
      assert.equal(item.buttons, page === 'カスタムコマンド' || item.custom ? 3 : 2);
      assert(item.labels.every((label) => !label.endsWith(`の${page}を開く`)));
      assert(item.gap >= item.padding - 0.5 && item.gap > 0, JSON.stringify(item));
      assert(Math.abs(item.leftGap - item.leftPadding) < 1, JSON.stringify(item));
    }
    spacing.push({ page, theme, width, measurements });
  };
  const assignmentSamples = [];
  const checkAssigned = async (from, title, page, assigned) => {
    await host.getByRole('heading', { level: 1 }).hover();
    const button = from.getByRole('button', { name: `${title}の${page}を開く`, exact: true });
    await until(
      async () => (await button.getAttribute('data-assigned')) === String(assigned),
      'assignment indicator',
    );
    assert.equal(
      await button.getAttribute('title'),
      `${page}${assigned ? '（割り当てあり）' : ''}`,
    );
    if (assigned) {
      const colors = await button.evaluate((e) => {
        const probe = document.createElement('span');
        probe.style.cssText = 'display:none;color:var(--accent);background:transparent';
        document.body.append(probe);
        const actual = getComputedStyle(e),
          expected = getComputedStyle(probe);
        const result = {
          foreground: actual.color,
          background: actual.backgroundColor,
          expectedForeground: expected.color,
          expectedBackground: expected.backgroundColor,
        };
        probe.remove();
        return result;
      });
      assert.equal(colors.foreground, colors.expectedForeground);
      assert.equal(colors.background, colors.expectedBackground);
      assignmentSamples.push({ title, page, assigned, ...colors });
    } else assert(!/accent-action/.test(await button.getAttribute('class')));
  };
  for (const theme of ['light', 'dark'])
    for (const width of [1280, 760]) {
      await host.evaluate(async (theme) => {
        const s = await window.dock.snapshot();
        await window.dock.saveSettings(
          { ...s.settings.value, host: { ...s.settings.value.host, theme } },
          s.settings.revision,
        );
      }, theme);
      await host.setViewportSize({ width, height: 1000 });
      await select('タスクトレイ');
      const tray = await host.locator('.tray-tree').evaluate((e) => ({
        border: getComputedStyle(e).borderWidth,
        padding: getComputedStyle(e).padding,
        fixed: e.querySelectorAll('.tray-fixed').length,
        text: e.textContent,
      }));
      assert.equal(tray.border, '0px');
      assert.equal(tray.padding, '0px');
      assert.equal(tray.fixed, 0);
      await host.screenshot({ path: path.join(profile, `tray-edit-${theme}-${width}.png`) });
      assert(!tray.text.includes('設定…'));
      assert(!tray.text.includes('終了'));
      const preview = host.locator('.tray-preview');
      assert(await preview.getByText('設定…', { exact: true }).count());
      assert(await preview.getByText('終了', { exact: true }).count());
      await select('Applet管理');
      assert.deepEqual(await host.locator('.applet-management thead th').allTextContents(), [
        'Applet名＋',
        'バージョン',
        '有効',
        '状態',
        '操作',
        '移動',
      ]);
      const applet = host.locator('[data-applet-id="fixture.hints"]');
      await checkAssigned(applet, 'Hint fixture', 'ショートカット', true);
      await checkAssigned(applet, 'Hint fixture', 'マウスジェスチャー', false);
      const otherApplet = host.locator('[data-applet-id="fixture.other"]');
      await checkAssigned(otherApplet, 'fixture.other', 'ショートカット', false);
      await checkAssigned(otherApplet, 'fixture.other', 'マウスジェスチャー', true);
      const emptyApplet = host.locator('[data-applet-id="fixture.hints.extra"]');
      await checkAssigned(emptyApplet, 'fixture.hints.extra', 'ショートカット', false);
      await checkAssigned(emptyApplet, 'fixture.hints.extra', 'マウスジェスチャー', false);
      await host.screenshot({
        path: path.join(profile, `applet-assignments-${theme}-${width}.png`),
      });
      assert.equal(
        await applet.locator('td').last().locator('.applet-management-links').count(),
        1,
      );
      const icons = {};
      for (const title of ['ショートカット', 'マウスジェスチャー'])
        icons[title] = await applet
          .getByRole('button', { name: `Hint fixtureの${title}を開く`, exact: true })
          .locator('svg')
          .innerHTML();
      await select('ショートカットキー');
      for (const title of [
        'ショートカットキー',
        'マウスジェスチャー',
        'タッチパッドジェスチャー',
        'カスタムコマンド',
      ]) {
        const index = host
          .locator('.settings-categories')
          .getByRole('button', { name: title, exact: true });
        const geometry = await index.evaluate((e) => {
          const r = e.getBoundingClientRect(),
            s = e.querySelector('.settings-index-icon').getBoundingClientRect();
          return { gap: s.left - r.left, padding: parseFloat(getComputedStyle(e).paddingLeft) };
        });
        assert(Math.abs(geometry.gap - geometry.padding) < 1);
        const icon = icons[title === 'ショートカットキー' ? 'ショートカット' : title];
        if (icon) assert.equal(await index.locator('svg').innerHTML(), icon);
      }
      assert.deepEqual(await host.locator('.applet-shortcut-overview th').allTextContents(), [
        'コマンド',
        '割り当て',
        '操作',
        '移動',
      ]);
      await checkLinks('ショートカット', theme, width);
      assert.equal(
        await row('fixture.hints.run').getByRole('img', { name: '外部公開コマンド' }).count(),
        1,
      );
      assert.equal(
        await row('appdock.quit').getByRole('img', { name: '外部公開コマンド' }).count(),
        0,
      );
      assert.equal(
        await row('fixture.hints.run')
          .getByRole('button', { name: 'Hint actionのカスタムコマンドを開く', exact: true })
          .count(),
        0,
      );
      await checkAssigned(row('fixture.hints.run'), 'Hint action', 'マウスジェスチャー', false);
      const geometry = await row('fixture.hints.run')
        .locator('[data-binding-id]')
        .evaluateAll((elements) =>
          elements.map((e) => {
            const a = e.querySelector('.applet-shortcut-value').getBoundingClientRect(),
              b = e.querySelector('.binding-row-actions').getBoundingClientRect();
            return { delta: Math.abs(a.top + a.height / 2 - b.top - b.height / 2) };
          }),
        );
      assert.equal(geometry.length, 2);
      assert(geometry.every((g) => g.delta < 1));
      await row('fixture.hints.run').scrollIntoViewIfNeeded();
      await host.screenshot({ path: path.join(profile, `bindings-center-${theme}-${width}.png`) });
      assert.equal(await host.locator('.gesture-menu-trigger').count(), 0);
      await row('fixture.hints.run').locator('.binding-order').first().click();
      await host.locator('.shortcut-order-dialog').waitFor();
      await host.locator('.shortcut-order-dialog').press('Escape');
      await move(row('fixture.hints.run'), 'Hint action', 'マウスジェスチャー');
      await checkLinks('マウスジェスチャー', theme, width);
      await checkAssigned(row('fixture.hints.run'), 'Hint action', 'ショートカット', true);
      assert.equal(await host.locator('[data-shortcut-command]').count(), 1);
      assert.equal(
        await row('fixture.hints.run').getByText('未割り当て', { exact: true }).count(),
        1,
      );
      await host.getByRole('button', { name: 'Hint actionの絞り込みを解除', exact: true }).click();
      assert((await host.locator('[data-shortcut-command]').count()) > 1);
      await checkAssigned(row('missing.command'), 'missing.command', 'ショートカット', true);
      await select('カスタムコマンド');
      await checkLinks('カスタムコマンド', theme, width);
      const actionAlignment = await host
        .locator('.custom-commands-settings .settings-list-actions')
        .evaluateAll((elements) =>
          elements.map((e) => {
            const cell = e.closest('td');
            return {
              gap:
                e.querySelector('button').getBoundingClientRect().left -
                cell.getBoundingClientRect().left,
              padding: parseFloat(getComputedStyle(cell).paddingLeft),
            };
          }),
        );
      assert(actionAlignment.length > 0);
      assert(actionAlignment.every(({ gap, padding }) => Math.abs(gap - padding) < 1));
      await checkAssigned(customRow('Custom 1'), 'Custom 1', 'ショートカット', true);
      await checkAssigned(customRow('Custom 1'), 'Custom 1', 'マウスジェスチャー', false);
      await checkAssigned(customRow('Custom 2'), 'Custom 2', 'ショートカット', false);
      await checkAssigned(customRow('Custom 2'), 'Custom 2', 'マウスジェスチャー', true);
      assert.deepEqual(await host.locator('.custom-commands-settings thead th').allTextContents(), [
        '名前＋',
        '種類',
        '提供元',
        '有効',
        '操作',
        '移動',
      ]);
      assert.equal(
        await customRow('Custom 1').getByRole('img', { name: '外部公開コマンド' }).count(),
        0,
      );
      assert.equal(
        await customRow('Custom 2').getByRole('img', { name: '外部公開コマンド' }).count(),
        1,
      );
      assert.equal(
        await host
          .locator('.custom-commands-settings .settings-list-actions-heading')
          .evaluate((e) => getComputedStyle(e).textAlign),
        'left',
      );
      await move(customRow('Custom 2'), 'Custom 2', 'ショートカット');
      assert.equal(await host.locator('[data-shortcut-command]').count(), 1);
      assert.equal(await row(id).count(), 1);
      await move(row(id), 'Custom 2', 'マウスジェスチャー');
      assert.equal(await host.locator('[data-shortcut-command]').count(), 1);
      assert.equal(await row(id).count(), 1);
      await move(row(id), 'Custom 2', 'タッチパッドジェスチャー');
      assert.equal(await row(id).count(), 1);
      await move(row(id), 'Custom 2', 'カスタムコマンド');
      assert.equal(await host.locator('.custom-commands-settings tbody tr').count(), 1);
      await host.getByRole('switch', { name: 'Custom 2を有効にする' }).click();
      await settleSettings(host);
      let saved = (await snapshot()).settings.value.customCommands.items;
      assert.equal(saved[0].enabled, true);
      assert.equal(saved[1].enabled, false);
      await host.getByRole('switch', { name: 'Custom 2を有効にする' }).click();
      await settleSettings(host);
      await host.getByRole('button', { name: 'Custom 2を編集', exact: true }).click();
      const dialog = host.getByRole('dialog');
      await dialog.waitFor();
      assert.equal(
        await dialog.getByRole('textbox', { name: '名前', exact: true }).inputValue(),
        'Custom 2',
      );
      await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
      await host.getByRole('button', { name: 'Custom 2の絞り込みを解除', exact: true }).click();
      assert.equal(await host.locator('.custom-commands-settings tbody tr').count(), 2);
      await host.screenshot({
        path: path.join(profile, `command-navigation-${theme}-${width}.png`),
      });
      samples.push({ theme, width, tray, geometry });
      checks.push(
        `tray-index-publication-command-navigation-center-filtered-toggle-${theme}-${width}`,
      );
    }
  await select('ショートカットキー');
  await move(row(id), 'Custom 2', 'マウスジェスチャー');
  await select('マウスジェスチャー');
  assert(
    (await host.locator('[data-shortcut-command]').count()) > 1,
    'normal index selection clears command target',
  );
  checks.push('index-navigation-clears-command-target-without-saving-or-executing');
  await select('カスタムコマンド');
  const updateAssignments = (patch) =>
    host.evaluate(async (patch) => {
      const s = await window.dock.snapshot(),
        next = structuredClone(s.settings.value);
      if (patch.add)
        next.keybindings.push({
          id: 'nav.custom2.key',
          command: patch.add,
          key: 'Ctrl+Alt+F22',
          enabled: false,
          when: { scope: 'app', appletIds: [] },
        });
      if (patch.remove)
        next.keybindings = next.keybindings.filter((b) => !patch.remove.includes(b.id));
      if (patch.removeGestures)
        next.gestures.bindings = next.gestures.bindings.filter(
          (b) => b.command !== patch.removeGestures,
        );
      if (patch.accent) next.host.accentColor = patch.accent;
      await window.dock.saveSettings(next, s.settings.revision);
    }, patch);
  await updateAssignments({ add: id });
  await checkAssigned(customRow('Custom 2'), 'Custom 2', 'ショートカット', true);
  await checkAssigned(customRow('Custom 2'), 'Custom 2', 'マウスジェスチャー', true);
  await updateAssignments({ remove: ['nav.custom1.one'] });
  await checkAssigned(customRow('Custom 1'), 'Custom 1', 'ショートカット', true);
  await updateAssignments({ remove: ['nav.custom1.two'], removeGestures: id });
  await checkAssigned(customRow('Custom 1'), 'Custom 1', 'ショートカット', false);
  await checkAssigned(customRow('Custom 2'), 'Custom 2', 'マウスジェスチャー', false);
  await updateAssignments({ accent: 'alice-blue' });
  await checkAssigned(customRow('Custom 2'), 'Custom 2', 'ショートカット', true);
  checks.push(
    'assignment-colors-live-add-remove-duplicates-disabled-missing-exact-id-and-alice-palette',
  );
  await select('Applet管理');
  const applet = host.locator('[data-applet-id="fixture.hints"]');
  await checkAssigned(applet, 'Hint fixture', 'ショートカット', true);
  await host.evaluate(async () => {
    const s = await window.dock.snapshot();
    const next = structuredClone(s.settings.value);
    next.extensions['fixture.hints'].enabled = false;
    next.gestures.bindings.push({
      id: 'nav.owner.gesture',
      command: 'fixture.hints.run',
      gesture: 'move-left',
      enabled: false,
      when: { scope: 'app', appletIds: [], processes: [] },
    });
    await window.dock.saveSettings(next, s.settings.revision);
  });
  await checkAssigned(applet, 'Hint fixture', 'マウスジェスチャー', true);
  await checkAssigned(applet, 'Hint fixture', 'ショートカット', true);
  await updateAssignments({ remove: ['nav.owner'] });
  await checkAssigned(applet, 'Hint fixture', 'ショートカット', true);
  await updateAssignments({ remove: ['nav.global'], removeGestures: 'fixture.hints.run' });
  await checkAssigned(applet, 'Hint fixture', 'ショートカット', false);
  await checkAssigned(applet, 'Hint fixture', 'マウスジェスチャー', false);
  const otherApplet = host.locator('[data-applet-id="fixture.other"]');
  await checkAssigned(otherApplet, 'fixture.other', 'マウスジェスチャー', true);
  await otherApplet
    .getByRole('button', { name: 'fixture.otherのマウスジェスチャーを開く', exact: true })
    .click();
  await host.getByRole('heading', { level: 1, name: 'マウスジェスチャー', exact: true }).waitFor();
  await until(
    async () => (await host.locator('[data-shortcut-command="fixture.other.run"]').count()) === 1,
    'owner-filtered gesture',
  );
  assert.equal(await host.locator('[data-shortcut-command]').count(), 1);
  await checkFilterPlacement('applet-マウスジェスチャー');
  await host.getByRole('button', { name: 'fixture.otherの絞り込みを解除', exact: true }).click();
  await until(
    async () =>
      (await host.locator('.command-provider-filter').count()) === 0 &&
      (await host.locator('[data-shortcut-command]').count()) > 1,
    'cleared owner filter',
  );
  await select('Applet管理');
  await otherApplet
    .getByRole('button', { name: 'fixture.otherのショートカットを開く', exact: true })
    .click();
  await host.getByRole('heading', { level: 1, name: 'ショートカットキー', exact: true }).waitFor();
  await until(
    async () => (await host.locator('.command-provider-filter').count()) === 1,
    'shortcut owner filter',
  );
  await checkFilterPlacement('applet-ショートカット');
  assert.equal((await snapshot()).settings.value.extensions['fixture.other'].enabled, false);
  checks.push(
    'applet-owner-exact-aggregation-stopped-disabled-live-duplicates-filter-without-activation',
  );
  fs.writeFileSync(path.join(profile, 'command-navigation.json'), JSON.stringify(samples, null, 2));
  fs.writeFileSync(
    path.join(profile, 'filter-positions.json'),
    JSON.stringify(filterPositions, null, 2),
  );
  fs.writeFileSync(path.join(profile, 'navigation-spacing.json'), JSON.stringify(spacing, null, 2));
  fs.writeFileSync(
    path.join(profile, 'assignment-colors.json'),
    JSON.stringify(assignmentSamples, null, 2),
  );
};
