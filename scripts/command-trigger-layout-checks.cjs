const assert = require('node:assert/strict');
const path = require('node:path');
const { settleSettings } = require('./settings-immediate-helper.cjs');
module.exports = async ({ host, command, row, checks, profile }) => {
  assert.deepEqual(await host.locator('.command-triggers-editor thead th').allTextContents(), [
    'コマンド',
    'トリガー',
    '',
    'いつ・どこで',
    '',
  ]);
  const sample = row('shortcuts', 'same-id');
  assert.match(await sample.locator('.binding-condition-cell').innerText(), /AppDock全体/);
  assert.doesNotMatch(
    await sample.locator('.binding-value-cell').innerText(),
    /AppDock全体|キージェスチャー/,
  );
  assert.equal(await sample.locator('.binding-value-cell .binding-row-actions button').count(), 0);
  assert.equal(
    await sample.locator('.binding-condition-cell .binding-row-actions button').count(),
    0,
  );
  assert.equal(await sample.locator('.binding-trigger-actions-cell .binding-order').count(), 1);
  assert.equal(await sample.locator('.binding-assignment-actions-cell button').count(), 2);
  assert.equal(
    await sample.locator('td').last().getAttribute('class'),
    'binding-assignment-actions-cell',
  );
  assert.equal(
    await host.getByRole('columnheader', { name: 'トリガーの設定', exact: true }).count(),
    1,
  );
  assert.equal(
    await host.getByRole('columnheader', { name: '割り当ての操作', exact: true }).count(),
    1,
  );
  assert.equal(
    await command('fixture.triggers.new').locator('.binding-add-options button').count(),
    3,
  );
  assert.deepEqual(
    await command('fixture.triggers.new')
      .locator('.binding-add-options button')
      .evaluateAll((buttons) => buttons.map((button) => button.title)),
    [
      'キートリガーの割り当てを追加',
      'マウストリガーの割り当てを追加',
      'タッチパッドトリガーの割り当てを追加',
    ],
  );
  const rail = await command('fixture.triggers.one').evaluate((element) => {
    const summary = element.querySelector('.binding-command-summary');
    const bounds = summary.getBoundingClientRect();
    const heading = summary.querySelector('.applet-shortcut-command').getBoundingClientRect();
    const id = summary.querySelector('.command-id').getBoundingClientRect();
    return {
      right: bounds.right,
      top: bounds.top,
      metadataRight: Math.max(heading.right, id.right),
      buttons: [...summary.querySelectorAll('.binding-add-options button')].map((button) => {
        const { left, right, top, bottom, width, height } = button.getBoundingClientRect();
        return { left, right, top, bottom, width, height };
      }),
    };
  });
  assert.equal(rail.buttons.length, 3);
  for (const [index, button] of rail.buttons.entries()) {
    assert.equal(button.width, 32);
    assert.equal(button.height, 32);
    assert(Math.abs(button.right - rail.right) < 1);
    assert(button.left > rail.metadataRight);
    if (index) assert.equal(button.top - rail.buttons[index - 1].bottom, 4);
    else assert(Math.abs(button.top - rail.top) < 1);
  }
  assert.equal(
    await command('fixture.triggers.one').getByRole('img', { name: '外部非公開コマンド' }).count(),
    1,
  );
  assert.equal(
    await command('fixture.triggers.two').getByRole('img', { name: '外部非公開コマンド' }).count(),
    0,
  );
  assert.equal(await host.locator('.command-publication').count(), 0);
  const icons = await command('fixture.triggers.one')
    .locator('.binding-trigger-icon svg')
    .evaluateAll((elements) =>
      elements.map((icon) => ({
        width: icon.getBoundingClientRect().width,
        height: icon.getBoundingClientRect().height,
        title: icon.parentElement.title,
      })),
    );
  assert.equal(icons.length, 4);
  assert(icons.every((icon) => icon.width >= 16 && icon.height >= 16 && !!icon.title));
  checks.push(
    'five columns separate trigger settings and binding actions; blank action headers retain accessible names / named add buttons / private-only lock / kind icons',
  );
  const condition = sample.locator('.binding-condition-edit');
  const alignment = await condition.evaluate((button) => {
    const range = document.createRange();
    range.selectNodeContents(button);
    return {
      textLeft: range.getBoundingClientRect().left,
      buttonLeft: button.getBoundingClientRect().left,
      conditionWidth: button.closest('td').getBoundingClientRect().width,
      gestureWidth: button
        .closest('tr')
        .querySelector('.binding-value-cell')
        .getBoundingClientRect().width,
    };
  });
  assert(Math.abs(alignment.textLeft - alignment.buttonLeft) < 1, JSON.stringify(alignment));
  assert(alignment.conditionWidth > alignment.gestureWidth, JSON.stringify(alignment));
  const spacing = await command('fixture.triggers.long')
    .locator('tr')
    .evaluateAll((rows) =>
      rows.map((row) => ({
        height: row.getBoundingClientRect().height,
        cells: [
          ...row.querySelectorAll(
            '.binding-value-cell, .binding-condition-cell, .binding-trigger-actions-cell, .binding-assignment-actions-cell',
          ),
        ].map((cell) => ({
          top: parseFloat(getComputedStyle(cell).paddingTop),
          bottom: parseFloat(getComputedStyle(cell).paddingBottom),
        })),
      })),
    );
  assert.equal(spacing.length, 24);
  for (const [index, value] of spacing.entries()) {
    assert(value.height < 48, JSON.stringify({ index, ...value }));
    for (const cell of value.cells) {
      assert.equal(cell.top, index === 0 ? 8 : 2);
      assert.equal(cell.bottom, index === spacing.length - 1 ? 8 : 2);
    }
  }
  checks.push(
    'condition text starts at left edge / narrower gesture and wider condition / compact internal rows preserve group outer padding and 32px targets',
  );
  const addRail = command('fixture.triggers.one').locator('.binding-add-options');
  const addAppearance = () =>
    addRail.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        opacity: getComputedStyle(element).opacity,
        events: getComputedStyle(element).pointerEvents,
        left: bounds.left,
        top: bounds.top,
        buttons: [...element.querySelectorAll('button')].map((button) => ({
          background: getComputedStyle(button).backgroundColor,
          border: getComputedStyle(button).borderTopColor,
        })),
      };
    });
  for (const theme of ['dark', 'light']) {
    await host.evaluate(async (theme) => {
      const snapshot = await window.dock.snapshot();
      await window.dock.saveSettings(
        {
          ...snapshot.settings.value,
          host: { ...snapshot.settings.value.host, theme },
        },
        snapshot.settings.revision,
      );
    }, theme);
    await settleSettings(host);
    await command('fixture.triggers.one').locator('.command-title').hover();
    await host.mouse.move(0, 0);
    await host.evaluate(() => document.activeElement?.blur());
    const idleAdd = await addAppearance();
    assert.equal(idleAdd.opacity, '0');
    assert.equal(idleAdd.events, 'none');
    await command('fixture.triggers.one').locator('.command-title').hover();
    const shownAdd = await addAppearance();
    assert.equal(shownAdd.opacity, '1');
    assert.equal(shownAdd.events, 'auto');
    assert.equal(shownAdd.left, idleAdd.left);
    assert.equal(shownAdd.top, idleAdd.top);
    assert(
      shownAdd.buttons.every(
        (button) =>
          button.background === 'rgba(0, 0, 0, 0)' && button.border === 'rgba(0, 0, 0, 0)',
      ),
    );
    await row('gestures', 'same-id').locator('.binding-value-cell').hover();
    assert.equal(
      (await addAppearance()).opacity,
      '1',
      'every assignment belongs to the same command hover region',
    );
    await command('fixture.triggers.two').locator('.command-title').hover();
    assert.equal(
      (await addAppearance()).opacity,
      '0',
      'hovering another command hides the first rail',
    );
    await host.getByTestId('command-provider:fixture.triggers.one').focus();
    await host.keyboard.press('Tab');
    const firstAdd = host.getByTestId('binding-add:fixture.triggers.one:shortcuts');
    assert(await firstAdd.evaluate((button) => button === document.activeElement));
    assert.equal((await addAppearance()).opacity, '1');
    assert.notEqual((await addAppearance()).buttons[0].background, 'rgba(0, 0, 0, 0)');
    await firstAdd.press('Enter');
    await host
      .getByTestId('settings-dialog')
      .getByRole('heading', { name: 'Trigger one', exact: true })
      .waitFor();
    await host
      .getByTestId('settings-dialog')
      .getByRole('button', { name: 'キャンセル', exact: true })
      .click();
    assert(await firstAdd.evaluate((button) => button === document.activeElement));
  }
  checks.push(
    'add icons hidden while idle / command-wide hover reveals transparent buttons without layout movement / another command hides them / keyboard Tab and Enter work and cancel restores focus in both themes',
  );
  const actions = sample.locator('.binding-assignment-actions-cell .binding-row-actions');
  const appearance = () =>
    actions.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const cell = element.closest('td');
      return {
        opacity: getComputedStyle(element).opacity,
        events: getComputedStyle(element).pointerEvents,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        cellRight: cell.getBoundingClientRect().right,
        paddingRight: parseFloat(getComputedStyle(cell).paddingRight),
      };
    });
  await sample.locator('.binding-condition-cell').hover();
  await host.mouse.move(0, 0);
  await host.evaluate(() => document.activeElement?.blur());
  const idle = await appearance();
  assert.equal(idle.opacity, '0');
  assert.equal(idle.events, 'none');
  await sample.locator('.binding-condition-cell').hover();
  const hovered = await appearance();
  assert.equal(hovered.opacity, '1');
  assert.equal(hovered.events, 'auto');
  assert.equal(hovered.left, idle.left);
  assert.equal(hovered.top, idle.top);
  assert(Math.abs(hovered.cellRight - hovered.paddingRight - hovered.right) < 2);
  const gear = sample.locator('.binding-order');
  const gearBounds = await gear.boundingBox();
  const conditionBounds = await condition.boundingBox();
  assert(
    conditionBounds.x - gearBounds.x - gearBounds.width >= 16,
    'trigger gear is separated from the condition',
  );
  await condition.focus();
  await host.keyboard.press('Shift+Tab');
  assert(await gear.evaluate((element) => element === document.activeElement));
  await host.keyboard.press('Tab');
  assert(await condition.evaluate((element) => element === document.activeElement));
  await condition.click();
  await host
    .getByTestId('settings-dialog')
    .getByRole('heading', { name: 'Trigger one', exact: true })
    .waitFor();
  await host
    .getByTestId('settings-dialog')
    .getByRole('button', { name: 'キャンセル', exact: true })
    .click();
  assert(await condition.evaluate((button) => button === document.activeElement));
  await host.mouse.move(0, 0);
  await condition.press('Tab');
  assert(
    await sample
      .locator('.applet-shortcut-edit')
      .evaluate((button) => button === document.activeElement),
  );
  assert.equal((await appearance()).opacity, '1', 'keyboard focus shows actions without hover');
  await condition.focus();
  await condition.press('Enter');
  await host
    .getByTestId('settings-dialog')
    .getByRole('heading', { name: 'Trigger one', exact: true })
    .waitFor();
  await host
    .getByTestId('settings-dialog')
    .getByRole('button', { name: 'キャンセル', exact: true })
    .click();
  for (const scope of ['pages', 'app']) {
    await condition.click();
    await host.getByTestId('settings-dialog').getByTestId(`binding-scope:${scope}`).click();
    await host
      .getByTestId('settings-dialog')
      .getByRole('button', { name: '適用', exact: true })
      .click();
    await settleSettings(host);
    assert.equal(
      await host.evaluate(
        async () =>
          (await window.dock.snapshot()).settings.value.keybindings.find(
            (binding) => binding.id === 'same-id',
          ).when.scope,
      ),
      scope,
    );
  }
  checks.push(
    'click/Enter on condition opens editing and restores focus / row actions hide only while idle / hover and keyboard focus reveal them without layout movement',
  );
  const kindButton = host.getByTestId('command-trigger-filter:shortcuts');
  assert(
    await kindButton.evaluate((button) => {
      const summary = button.closest('.command-list-summary');
      return (
        summary.firstElementChild.contains(button) &&
        !button.closest('.command-shortcut-tools') &&
        !button.textContent.trim() &&
        !!button.getAttribute('aria-label')
      );
    }),
  );
  await row('shortcuts', 'same-id').locator('.binding-input-filter').click();
  assert(
    await kindButton.evaluate((button) => {
      const summary = button.closest('.command-list-summary');
      return (
        button.getBoundingClientRect().left <
        summary.querySelector('.command-provider-filter').getBoundingClientRect().left
      );
    }),
  );
  await host.getByRole('button', { name: '絞り込みを解除', exact: true }).click();
  checks.push('icon kind filters lead the temporary-filter row with accessible names');
  for (const [kind, id, input, name] of [
    ['shortcuts', 'same-id', 'Ctrl+F8', 'キージェスチャー'],
    ['gestures', 'same-id', '移動: 上', 'マウスジェスチャー'],
    ['touchpad-gestures', 'touchpad-second', '3本指: タップ', 'タッチパッドジェスチャー'],
  ]) {
    const badge = row(kind, id).locator('.binding-input-filter');
    const svg = await badge.locator('svg').innerHTML();
    await badge.click();
    const chip = host.getByTestId('command-provider-filter');
    assert.equal((await chip.innerText()).trim(), input);
    assert.equal(await chip.locator('svg').first().innerHTML(), svg);
    assert.equal(
      await chip.getByRole('img', { name: `トリガー: ${name} · ${input}`, exact: true }).count(),
      1,
    );
    assert.equal(
      await chip.locator('span[title]').first().getAttribute('title'),
      `トリガー: ${name} · ${input}`,
    );
    if (kind === 'gestures') {
      await command('fixture.triggers.one').locator('.command-title').hover();
      await host.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      assert.equal((await addAppearance()).opacity, '1');
      await host.screenshot({ path: path.join(profile, 'command-trigger-hover.png') });
      await host.mouse.move(0, 0);
      await host.evaluate(() => document.activeElement?.blur());
      await host.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      assert.equal((await addAppearance()).opacity, '0');
      await host.screenshot({ path: path.join(profile, 'command-trigger-idle.png') });
    }
    await chip.getByTestId('command-provider-filter-clear').click();
    assert(await badge.evaluate((button) => button === document.activeElement));
  }
  checks.push(
    'temporary input filter reuses the matching keyboard/mouse/touchpad symbol and input text / full tooltip and accessible name / clear restores focus',
  );
  const summary = host.getByTestId('binding-command-summary:fixture.triggers.long');
  const measure = () =>
    summary.evaluate((element) => {
      const cell = element.parentElement;
      const body = element.closest('.settings-body');
      const toolbar = body.querySelector('.command-list-toolbar');
      const rect = element.getBoundingClientRect();
      const bounds = cell.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        cellTop: bounds.top,
        cellBottom: bounds.bottom,
        toolbarBottom: toolbar.getBoundingClientRect().bottom,
        padding: parseFloat(getComputedStyle(cell).paddingBottom),
        transform: element.style.transform,
        position: getComputedStyle(element).position,
        inset: getComputedStyle(element).top,
        ancestors: (() => {
          const values = [];
          for (let parent = element.parentElement; parent; parent = parent.parentElement) {
            const style = getComputedStyle(parent);
            values.push({
              className: parent.className,
              overflowX: style.overflowX,
              overflowY: style.overflowY,
              height: parent.getBoundingClientRect().height,
              contain: style.contain,
            });
            if (parent === body) break;
          }
          return values;
        })(),
      };
    });
  const position = async (edge) => {
    await summary.evaluate((element, edge) => {
      const body = element.closest('.settings-body');
      const targetTop =
        body.querySelector('.command-list-toolbar').getBoundingClientRect().bottom + 8;
      const cell = element.parentElement.getBoundingClientRect();
      body.scrollTop +=
        edge === 'middle'
          ? cell.top - (targetTop - 250)
          : cell.bottom - (targetTop + element.offsetHeight / 2);
    }, edge);
    await host.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
  };
  for (const { width, theme } of [
    { width: 1280, theme: 'light' },
    { width: 700, theme: 'light' },
    { width: 700, theme: 'dark' },
    { width: 1280, theme: 'dark' },
  ]) {
    await host.evaluate(async (theme) => {
      const snapshot = await window.dock.snapshot();
      await window.dock.saveSettings(
        { ...snapshot.settings.value, host: { ...snapshot.settings.value.host, theme } },
        snapshot.settings.revision,
      );
    }, theme);
    await settleSettings(host);
    await host.setViewportSize({ width, height: 760 });
    await position('middle');
    let value = await measure();
    assert.equal(value.position, 'sticky');
    assert.equal(value.transform, '', 'native sticky does not write a JS transform');
    assert(Math.abs(value.top - value.toolbarBottom - 8) <= 2, JSON.stringify({ width, ...value }));
    assert(value.top >= value.cellTop && value.bottom <= value.cellBottom + 1);
    const immediate = await summary.evaluate((element) => {
      const body = element.closest('.settings-body');
      return [16, 40, -20, 80, -40].map((delta) => {
        body.scrollTop += delta;
        return {
          top: element.getBoundingClientRect().top,
          target: body.querySelector('.command-list-toolbar').getBoundingClientRect().bottom + 8,
          transform: element.style.transform,
        };
      });
    });
    assert(
      immediate.every(
        (sample) => Math.abs(sample.top - sample.target) <= 2 && sample.transform === '',
      ),
      JSON.stringify(immediate),
    );
    if (width === 1280) {
      const fit = await host.locator('.settings-body').evaluate((element) => {
        const parents = [];
        for (let parent = element.querySelector('table'); parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent);
          parents.push({
            className: parent.className,
            width: parent.getBoundingClientRect().width,
            client: parent.clientWidth,
            scroll: parent.scrollWidth,
            minWidth: style.minWidth,
            padding: style.padding,
            border: style.borderWidth,
            boxSizing: style.boxSizing,
          });
          if (parent === element) break;
        }
        return { client: element.clientWidth, scroll: element.scrollWidth, parents };
      });
      assert(fit.scroll <= fit.client + 1, JSON.stringify(fit));
      const add = host.getByTestId('binding-add:fixture.triggers.long:gestures');
      await command('fixture.triggers.long').locator('.command-title').hover();
      await add.click();
      await host
        .getByTestId('settings-dialog')
        .getByRole('heading', { name: 'Trigger long', exact: true })
        .waitFor();
      await host
        .getByTestId('settings-dialog')
        .getByRole('button', { name: 'キャンセル', exact: true })
        .click();
      assert(await add.evaluate((button) => button === document.activeElement));
    }
    const list = host.locator('.command-triggers-editor .shortcut-command-list');
    const body = host.locator('.settings-body');
    if (width === 700) {
      const fixed = host.locator(
        '.settings-page-heading, .settings-page-toolbar, .command-list-toolbar',
      );
      const fixedBefore = await fixed.evaluateAll((elements) =>
        elements.map((element) => ({
          left: element.getBoundingClientRect().left,
          width: element.getBoundingClientRect().width,
        })),
      );
      const before = await measure();
      const moved = await body.evaluate((element) => {
        const before = element.scrollLeft;
        element.scrollLeft += 64;
        return element.scrollLeft - before;
      });
      await host.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      const after = await measure();
      assert(moved > 0 && Math.abs(after.left - before.left + moved) < 2);
      assert(Math.abs(after.top - before.top) < 2, 'horizontal scroll preserves vertical follow');
      const fixedAfter = await fixed.evaluateAll((elements) =>
        elements.map((element) => ({
          left: element.getBoundingClientRect().left,
          width: element.getBoundingClientRect().width,
        })),
      );
      await host.screenshot({ path: path.join(profile, `native-scroll-700-${theme}.png`) });
      assert(
        fixedAfter.every(
          (value, index) =>
            Math.abs(value.left - fixedBefore[index].left) < 1 &&
            Math.abs(value.width - fixedBefore[index].width) < 1,
        ),
        JSON.stringify({
          fixedBefore,
          fixedAfter,
          layout: await fixed.evaluateAll((elements) =>
            elements.map((element) => {
              const parents = [];
              for (let parent = element; parent; parent = parent.parentElement) {
                const style = getComputedStyle(parent);
                parents.push({
                  className: parent.className,
                  width: parent.getBoundingClientRect().width,
                  scrollWidth: parent.scrollWidth,
                  position: style.position,
                  left: style.left,
                  overflowX: style.overflowX,
                  overflowY: style.overflowY,
                  grid: style.gridTemplateColumns,
                });
                if (parent.classList.contains('settings-body')) break;
              }
              return parents;
            }),
          ),
        }),
      );
      assert.equal(
        await list.evaluate((element) => getComputedStyle(element).overflowX),
        'visible',
      );
      assert.equal(await list.evaluate((element) => element.scrollLeft), 0);
      await command('fixture.triggers.long').locator('.command-title').hover();
      const preserved = await body.evaluate((element) => ({
        top: element.scrollTop,
        left: element.scrollLeft,
      }));
      const add = host.getByTestId('binding-add:fixture.triggers.long:gestures');
      await add.click();
      await host
        .getByTestId('settings-dialog')
        .getByRole('button', { name: 'キャンセル', exact: true })
        .click();
      const restored = await body.evaluate((element) => ({
        top: element.scrollTop,
        left: element.scrollLeft,
      }));
      assert.deepEqual(restored, preserved, 'closing the dialog restores both page scroll axes');
      assert(await add.evaluate((button) => button === document.activeElement));
      const bar = host.getByRole('region', { name: 'コマンド一覧を横にスクロール', exact: true });
      await bar.waitFor({ state: 'visible' });
      assert(
        Math.abs(
          (await bar.evaluate((element) => element.scrollLeft)) -
            (await body.evaluate((element) => element.scrollLeft)),
        ) <= 1,
      );
      await bar.focus();
      await bar.press('End');
      await host.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      assert(
        await body.evaluate(
          (element) =>
            Math.abs(element.scrollLeft - (element.scrollWidth - element.clientWidth)) <= 1,
        ),
      );
      await bar.press('Home');
      await host.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      assert.equal(await body.evaluate((element) => element.scrollLeft), 0);
      assert(
        await body.evaluate((element) => element.offsetHeight - element.clientHeight <= 1),
        'the body does not add a second horizontal scrollbar',
      );
      await body.evaluate((element) => {
        element.scrollLeft = 0;
      });
    }
    await position('bottom');
    value = await measure();
    assert(
      Math.abs(value.bottom - (value.cellBottom - value.padding)) <= 2,
      JSON.stringify({ width, ...value }),
    );
    assert(value.top < value.toolbarBottom + 8, 'cell bottom limits the follow position');
  }
  await host.setViewportSize({ width: 1280, height: 840 });
  await host.locator('.settings-body').evaluate((element) => {
    element.scrollTop = 0;
  });
  await host.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  assert.equal((await measure()).transform, '');
  checks.push(
    'native sticky command summary follows immediately without JS transforms / stops at its own cell bottom / shared page horizontal scrolling preserves headings and filters / keyboard bottom scrollbar / resize and natural position',
  );
  await host.setViewportSize({ width: 700, height: 760 });
  const search = host.getByRole('searchbox', { name: 'トリガーのコマンドを検索', exact: true });
  const bar = host.getByRole('region', { name: 'コマンド一覧を横にスクロール', exact: true });
  await bar.focus();
  await bar.press('End');
  await search.fill('no-command-matches-this-filter');
  await host.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  assert.equal(await host.locator('.command-triggers-editor table').count(), 0);
  assert(
    await host
      .locator('.settings-body')
      .evaluate(
        (element) => element.scrollLeft === 0 && element.scrollWidth <= element.clientWidth + 1,
      ),
  );
  assert.equal(await bar.isVisible(), false);
  await search.fill('');
  await bar.waitFor({ state: 'visible' });
  await host.getByRole('button', { name: 'JSON', exact: true }).click();
  await host.locator('.settings-panel-json textarea').waitFor();
  assert.equal(await host.locator('.settings-page-shared-scroll').count(), 0);
  assert.equal(await host.locator('.command-list-page-canvas').count(), 0);
  assert.equal(await bar.isVisible(), false);
  await host.getByTestId('command-trigger-tab:commands').click();
  await host.locator('.command-triggers-editor').waitFor();
  assert.equal(await host.locator('.settings-page-shared-scroll').count(), 1);
  assert.equal(await host.locator('.command-list-page-canvas').count(), 1);
  await host.setViewportSize({ width: 1280, height: 840 });
  await host.evaluate(async () => {
    const snapshot = await window.dock.snapshot();
    await window.dock.saveSettings(
      { ...snapshot.settings.value, host: { ...snapshot.settings.value.host, theme: 'light' } },
      snapshot.settings.revision,
    );
  });
  await settleSettings(host);
  await host.locator('.settings-body').evaluate((element) => {
    element.scrollTop = 0;
    element.scrollLeft = 0;
  });
  checks.push(
    'empty filter removes horizontal overflow / JSON mode keeps its original frame / form restores native shared scrolling',
  );
};
