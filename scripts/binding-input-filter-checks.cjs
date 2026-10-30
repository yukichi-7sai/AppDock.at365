const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { settleSettings } = require('./settings-immediate-helper.cjs');

module.exports = async ({ host, select, snapshot, until, profile, checks }) => {
  const original = structuredClone((await snapshot()).settings.value);
  const save = async (value) => {
    await host.evaluate(async (value) => {
      const current = await window.dock.snapshot();
      await window.dock.saveSettings(value, current.settings.revision);
    }, value);
    await settleSettings(host);
  };
  const fixture = structuredClone(original);
  const assignments = [
    ['input.a', 'fixture.hints.run', false],
    ['input.b', 'fixture.other.run', false],
    ['input.duplicate', 'fixture.hints.run', false],
    ['input.long', 'missing.command', true],
    ['input.long.duplicate', 'missing.command', true],
  ];
  fixture.keybindings = assignments.map(([id, command, other]) => ({
    id,
    command,
    key: other ? 'F10' : 'F1',
    enabled: false,
    when: { scope: 'app', appletIds: [], processes: [] },
  }));
  fixture.gestures.bindings = assignments.map(([id, command, other]) => ({
    id,
    command,
    gesture: other ? 'move-right' : 'move-up',
    enabled: false,
    when: { scope: 'app', appletIds: [], processes: [] },
  }));
  fixture.touchpadGestures.bindings = assignments.map(([id, command, other]) => ({
    id,
    command,
    gesture: other ? 'four.tap' : 'three.tap',
    enabled: false,
    when: { scope: 'app', appletIds: [], processes: [] },
  }));
  const badge = (id) => host.locator(`[data-binding-id="${id}"] .binding-input-filter`);
  const commands = () =>
    host
      .locator('[data-shortcut-command]')
      .evaluateAll((rows) => rows.map((r) => r.dataset.shortcutCommand).sort());
  const expected = ['fixture.hints.run', 'fixture.other.run'];
  const chip = host.locator('.command-provider-filter');
  for (const [page, destination, otherPage, label] of [
    ['ショートカットキー', 'ショートカット', 'マウスジェスチャー', 'F1'],
    ['マウスジェスチャー', 'マウスジェスチャー', 'ショートカットキー', '移動: 上'],
    ['タッチパッドジェスチャー', 'タッチパッドジェスチャー', 'ショートカットキー', '3本指: タップ'],
  ]) {
    await save(fixture);
    const openTarget = async () => {
      if (page === 'タッチパッドジェスチャー') {
        await select('ショートカットキー');
        await host
          .locator('[data-shortcut-command="fixture.other.run"]')
          .getByRole('button', { name: /のタッチパッドジェスチャーを開く$/ })
          .click();
      } else {
        await select('Applet管理');
        await host
          .locator('[data-applet-id="fixture.other"]')
          .getByRole('button', { name: `fixture.otherの${destination}を開く`, exact: true })
          .click();
      }
    };
    await openTarget();
    await host.getByRole('heading', { level: 1, name: page, exact: true }).waitFor();
    await until(async () => (await commands()).join() === 'fixture.other.run', 'provider target');
    const before = (await snapshot()).settings;
    const search = host.getByLabel(
      page === 'ショートカットキー'
        ? 'ショートカットキーのコマンドを検索'
        : 'ジェスチャーのコマンドを検索',
    );
    const status = host.getByLabel(
      page === 'ショートカットキー' ? 'ショートカットキーの絞り込み' : 'ジェスチャーの絞り込み',
    );
    await search.fill('fixture.other');
    await status.selectOption('assigned');
    await badge('input.b').focus();
    await host.keyboard.press('Enter');
    await until(
      async () => (await commands()).join() === expected.join(),
      'exact input across providers',
    );
    assert.equal(await search.inputValue(), '');
    assert.equal(await status.inputValue(), 'assigned');
    assert((await chip.textContent()).includes(label));
    assert.equal(await chip.count(), 1);
    assert(
      await chip.evaluate((e) => {
        const count = e
          .closest('.command-list-summary')
          .querySelector('.command-list-summary-count');
        return !!count && !!(e.compareDocumentPosition(count) & Node.DOCUMENT_POSITION_FOLLOWING);
      }),
      'input filter precedes the trailing result count',
    );
    assert.equal(await badge('input.a').getAttribute('data-multiple-commands'), 'true');
    assert.equal(await badge('input.b').getAttribute('aria-pressed'), 'true');
    await badge('input.a').click();
    assert.deepEqual(await commands(), expected);
    await host.screenshot({ path: path.join(profile, `input-filter-${destination}.png`) });
    await search.fill('fixture.other');
    assert.deepEqual(await commands(), ['fixture.other.run']);
    await badge('input.b').focus();
    await host.keyboard.press('Space');
    await until(
      async () => (await commands()).join() === expected.join(),
      'space resets text search',
    );
    const summaryHeight = await host
      .locator('.command-list-summary')
      .evaluate((e) => e.getBoundingClientRect().height);
    fs.writeFileSync(
      path.join(profile, `summary-before-clear-${destination}.json`),
      JSON.stringify(
        await host.locator('.command-list-summary').evaluate((e) => {
          const frame = e.closest('.settings-page-layout'),
            main = e.querySelector('.command-list-summary-main');
          return {
            width: e.getBoundingClientRect().width,
            height: e.getBoundingClientRect().height,
            viewport: innerWidth,
            frameWidth: frame.getBoundingClientRect().width,
            frameName: getComputedStyle(frame).containerName,
            frameType: getComputedStyle(frame).containerType,
            mainDisplay: getComputedStyle(main).display,
            rows: getComputedStyle(main).gridTemplateRows,
          };
        }),
        null,
        2,
      ),
    );
    await chip.getByRole('button').click();
    await until(
      async () => (await commands()).length > 2 && (await chip.count()) === 0,
      'input chip clear',
    );
    assert.equal(
      await host.locator('.command-list-summary').evaluate((e) => e.getBoundingClientRect().height),
      summaryHeight,
      'clearing the input filter keeps the summary height',
    );
    assert(await badge('input.b').evaluate((e) => e === document.activeElement));
    assert.equal(
      await badge('input.long').getAttribute('data-multiple-commands'),
      'false',
      'two bindings on one command stay neutral',
    );
    await badge('input.long').click();
    assert.deepEqual(await commands(), ['missing.command'], 'F10/right does not include F1/up');
    await host.getByRole('button', { name: '絞り込みを解除', exact: true }).click();
    await until(async () => (await chip.count()) === 0, 'clear all');
    assert.deepEqual(
      (await snapshot()).settings,
      before,
      'filtering never saves settings or activates Applets',
    );

    await select(otherPage);
    await host
      .locator('[data-shortcut-command="fixture.hints.run"]')
      .getByRole('button', { name: `Hint actionの${destination}を開く`, exact: true })
      .click();
    await host.getByRole('heading', { level: 1, name: page, exact: true }).waitFor();
    await until(async () => (await commands()).join() === 'fixture.hints.run', 'command target');
    await badge('input.a').click();
    await until(
      async () => (await commands()).join() === expected.join(),
      'input replaces command target',
    );
    assert.deepEqual((await snapshot()).settings, before);
    // A newly requested provider target takes precedence over the previous local input filter.
    await openTarget();
    await until(
      async () => (await commands()).join() === 'fixture.other.run',
      'new provider replaces input',
    );
    await badge('input.b').click();
    await until(async () => (await commands()).join() === expected.join(), 'input selected again');
    const changed = structuredClone(fixture);
    const rows =
      page === 'ショートカットキー'
        ? changed.keybindings
        : page === 'タッチパッドジェスチャー'
          ? changed.touchpadGestures.bindings
          : changed.gestures.bindings;
    const edited = rows.find((r) => r.id === 'input.b');
    if (page === 'ショートカットキー') edited.key = 'F10';
    else edited.gesture = page === 'タッチパッドジェスチャー' ? 'four.tap' : 'move-right';
    await save(changed);
    await until(
      async () => (await commands()).join() === 'fixture.hints.run',
      'external reassignment updates exact filter',
    );
    assert.equal(await badge('input.a').getAttribute('data-multiple-commands'), 'false');
    if (page === 'ショートカットキー')
      changed.keybindings = rows.filter((r) => r.command !== 'fixture.hints.run');
    else if (page === 'タッチパッドジェスチャー')
      changed.touchpadGestures.bindings = rows.filter((r) => r.command !== 'fixture.hints.run');
    else changed.gestures.bindings = rows.filter((r) => r.command !== 'fixture.hints.run');
    await save(changed);
    await until(
      async () => (await commands()).length === 0,
      'empty filter after external deletion',
    );
    assert((await chip.textContent()).includes(label));
    await chip.getByRole('button').click();
    assert(
      await search.evaluate((e) => e === document.activeElement),
      'removed trigger falls back to search',
    );
    checks.push(
      `${page}: exact input badge filter, provider/command switching, Enter/Space, clear/focus, no persistence, duplicates and live edits/empty results`,
    );
  }
  const orderFixture = structuredClone(fixture);
  orderFixture.gestures.bindings = [
    'key:F1',
    'wheel-down',
    'move-up-down',
    'click-left',
    'move-up',
    'click-middle',
    'wheel-up',
    'move-right-up',
    'move-left',
    'move-up',
  ].map((gesture, index) => ({
    id: `display-order.${index}`,
    command: 'fixture.hints.run',
    gesture,
    enabled: false,
    when: { scope: 'app', appletIds: [], processes: [] },
  }));
  await save(orderFixture);
  await host.setViewportSize({ width: 1600, height: 1000 });
  await select('マウスジェスチャー');
  const orderBefore = (await snapshot()).settings;
  const assigned = host.locator('[data-shortcut-command="fixture.hints.run"]');
  assert.deepEqual(
    await assigned
      .locator('[data-binding-id]')
      .evaluateAll((rows) => rows.map((row) => row.dataset.bindingId)),
    [4, 9, 8, 2, 7, 3, 5, 6, 1, 0].map((index) => `display-order.${index}`),
  );
  assert.deepEqual(
    (await snapshot()).settings,
    orderBefore,
    'display order does not save or reorder execution',
  );
  await assigned.screenshot({ path: path.join(profile, 'mouse-assignment-display-order.png') });
  checks.push(
    'mouse assignment display: one-step, two-step, click, wheel, key; same-input order and saved settings retained',
  );
  orderFixture.touchpadGestures.enabled = false;
  orderFixture.touchpadGestures.bindings = [
    'four.right',
    'three.left',
    'four.tap',
    'three.down',
    'four.up',
    'three.tap',
    'four.left',
    'three.right',
    'four.down',
    'three.up',
    'three.tap',
  ].map((gesture, index) => ({
    id: `touchpad-display-order.${index}`,
    command: 'fixture.hints.run',
    gesture,
    enabled: false,
    when: { scope: 'app', appletIds: [], processes: [] },
  }));
  await save(orderFixture);
  await select('タッチパッドジェスチャー');
  const touchpadBefore = (await snapshot()).settings;
  assert.deepEqual(
    await assigned
      .locator('[data-binding-id]')
      .evaluateAll((rows) => rows.map((row) => row.dataset.bindingId)),
    [5, 10, 9, 3, 1, 7, 2, 4, 8, 6, 0].map((index) => `touchpad-display-order.${index}`),
  );
  assert.deepEqual(
    (await snapshot()).settings,
    touchpadBefore,
    'touchpad display order preserves saved settings',
  );
  await assigned.screenshot({ path: path.join(profile, 'touchpad-assignment-display-order.png') });
  checks.push(
    'touchpad assignment display: three/four fingers, tap/up/down/left/right; same-input order and saved settings retained',
  );
  await save(original);
  await select('ショートカットキー');
};
