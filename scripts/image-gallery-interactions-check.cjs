const assert = require('node:assert/strict');
const path = require('node:path');

exports.checkGalleryInteractions = async ({
  page,
  model,
  action,
  imageSnapshot,
  until,
  profile,
  theme,
}) => {
  await action('group', { groupId: 'all' });
  await action('query', { value: '' });
  await action('width', { value: 260, commit: true });
  await page.getByRole('button', { name: 'グループを追加', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '画像グループを追加', exact: true });
  await dialog.getByLabel('画像グループ名').fill('ドラッグ検証');
  await dialog.getByRole('button', { name: '追加', exact: true }).click();
  await until(async () => !(await dialog.count()), 'group dialog closed');
  await action('group', { groupId: 'all' });
  const cards = page.locator('[data-image-id]');
  const count = async () => (await model()).content.selected;
  const target = page.getByTestId('library-group-target').filter({ hasText: 'ドラッグ検証' });
  const members = async () =>
    (await imageSnapshot()).groups.find((g) => g.name === 'ドラッグ検証').images;
  const box = async (index) => cards.nth(index).boundingBox();
  const range = async (first, last, additive = false) => {
    const a = await box(first),
      b = await box(last);
    if (additive) await page.keyboard.down('Control');
    await page.mouse.move(a.x - 2, a.y + 3);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width - 3, b.y + 70, { steps: 8 });
    await page.mouse.up();
    if (additive) await page.keyboard.up('Control');
  };
  await range(0, 1);
  await until(async () => (await count()) === 2, 'background rectangle selects two cards');
  await range(2, 2, true);
  await until(async () => (await count()) === 3, 'Ctrl rectangle adds a third card');
  await range(0, 1);
  await until(async () => (await count()) === 2, 'rectangle replaces previous selection');
  const covered = await page.evaluate(() => {
    const scroller = document.querySelector('.library-scroll');
    const check = document.querySelector('.ad-gallery-check');
    const r = check.getBoundingClientRect();
    const search = document.querySelector('.library-search').getBoundingClientRect();
    scroller.scrollTop += r.top + r.height / 2 - search.top - search.height / 2;
    return { x: r.left + r.width / 2, y: search.top + search.height / 2 };
  });
  await until(
    () =>
      page.evaluate(
        ({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.library-filter-panel'),
        covered,
      ),
    'sticky panel covers checkbox',
  );
  await page.mouse.click(covered.x, covered.y);
  assert.equal(await count(), 2, 'covered checkbox cannot intercept filter click');
  assert(
    await page.evaluate(() => {
      const viewport = document.querySelector('.library-scroll').getBoundingClientRect();
      return !!document
        .elementFromPoint(viewport.left + 30, viewport.top + 0.5)
        ?.closest('.library-filter-panel');
    }),
    'no gallery is exposed above the sticky search field',
  );
  await page.screenshot({ path: path.join(profile, 'sticky-coverage.png') });
  await page.locator('.library-scroll').evaluate((el) => {
    el.scrollTop = 0;
  });
  for (const region of ['.library-sidebar', '.library-selection', '.library-layout']) {
    const r = await page.locator(region).boundingBox();
    const side = await page.locator('.library-sidebar').boundingBox();
    const x = region === '.library-layout' ? side.x + side.width + 8 : r.x + r.width - 4;
    await page.mouse.click(x, r.y + r.height - 6);
    await until(async () => (await count()) === 0, `${region} background clears selection`);
    await range(0, 1);
    await until(async () => (await count()) === 2, 'restore range selection');
  }
  await page.getByRole('searchbox', { name: 'ファイル名で検索' }).click();
  assert.equal(await count(), 2, 'search focus retains selection');
  const focus = await page.locator('.library-search').evaluate((el) => ({
    outer: getComputedStyle(el).outlineStyle,
    inset: getComputedStyle(el).outlineOffset,
    input: getComputedStyle(el.querySelector('input')).outlineStyle,
  }));
  assert.equal(focus.outer, 'solid');
  assert(parseFloat(focus.inset) < 0);
  assert.equal(focus.input, 'none');
  for (const region of ['.library-sidebar', '.library-status']) {
    await action('clear');
    const start = await page.locator(region).boundingBox();
    const end = await box(1);
    const first = await box(0);
    await page.mouse.move(
      region === '.library-sidebar' ? start.x + start.width - 4 : first.x - 2,
      region === '.library-sidebar' ? first.y + 3 : start.y + start.height - 2,
    );
    await page.mouse.down();
    await page.mouse.move(end.x + end.width - 3, end.y + 70, { steps: 8 });
    await page.mouse.up();
    await until(async () => (await count()) === 2, `${region} starts rectangle selection`);
  }
  let a = await box(0);
  await page.mouse.click(a.x + 4, a.y + 4);
  await until(async () => (await count()) === 1, 'checkbox surrounding hit area toggles selection');
  assert.equal(await page.getByRole('dialog').count(), 0);
  await page.mouse.click(a.x + 4, a.y + 4);
  await until(async () => (await count()) === 2, 'surrounding hit area can reselect');
  const drag = async (index, expectedCount) => {
    const source = await cards.nth(index).locator('.ad-gallery-image').boundingBox();
    const destination = await target.boundingBox();
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      destination.x + destination.width / 2,
      destination.y + destination.height / 2,
      { steps: 12 },
    );
    await until(
      async () =>
        (await page.getByTestId('gallery-drag-count').textContent()) === `${expectedCount}枚`,
      'drag count',
    );
    assert.equal(await target.getAttribute('data-gallery-drop'), 'true');
    const ghost = page.getByTestId('gallery-drag-card');
    assert((await ghost.boundingBox()).width >= 180);
    assert.equal(await ghost.evaluate((el) => getComputedStyle(el).pointerEvents), 'none');
    assert.equal(await ghost.getAttribute('data-multiple'), String(expectedCount > 1));
    await page.mouse.up();
    await until(
      async () => !(await page.getByTestId('gallery-drag-count').count()),
      'drag completed',
    );
    assert.equal(await page.getByRole('dialog').count(), 0, 'drag release does not open preview');
  };
  await drag(0, 2);
  await until(async () => (await members()).length === 2, 'selected group drop');
  await drag(0, 2);
  await until(
    async () => (await model()).content.message.includes('0枚'),
    'duplicate drop is a no-op',
  );
  await drag(2, 1);
  await until(async () => (await members()).length === 3, 'unselected drag adds only one');
  await page.getByRole('button', { name: /すべて選択/ }).click();
  const total = (await model()).content.total;
  assert((await model()).content.items.length < total);
  await drag(0, total);
  await until(
    async () => (await members()).length === total,
    'drop includes unrendered selected images',
  );
  await target.click();
  await until(async () => (await model()).content.group !== 'all', 'normal group opened');
  const originalOrder = await members();
  await range(0, 1);
  await until(async () => (await count()) === 2, 'select reorder block');
  const dragFrom = await cards.first().locator('.ad-gallery-image').boundingBox();
  const dragTo = await box(3);
  await page.mouse.move(dragFrom.x + dragFrom.width / 2, dragFrom.y + dragFrom.height / 2);
  await page.mouse.down();
  await page.mouse.move(dragTo.x + dragTo.width - 10, dragTo.y + 60, { steps: 12 });
  await until(
    async () => await page.getByTestId('gallery-insertion').count(),
    'reorder insertion line',
  );
  await page.screenshot({ path: path.join(profile, 'drag-reorder.png') });
  await page.mouse.up();
  const reordered = [
    originalOrder[2],
    originalOrder[3],
    originalOrder[0],
    originalOrder[1],
    ...originalOrder.slice(4),
  ];
  await until(
    async () => JSON.stringify(await members()) === JSON.stringify(reordered),
    'multiple images reordered',
  );
  assert.equal(await count(), 2, 'drag release retains selection');
  assert.match((await model()).content.message, /順番を保存/);
  // A later membership add must not disturb the saved order.
  await drag(2, 2);
  assert.deepEqual(await members(), reordered);
  const menuTrigger = page.getByRole('button', { name: 'ドラッグ検証の操作', exact: true });
  const addGroupButton = page.getByRole('button', { name: 'グループを追加', exact: true });
  const beforePopup = await addGroupButton.boundingBox();
  await menuTrigger.click();
  const menu = page.getByRole('menu', { name: 'ドラッグ検証の操作', exact: true });
  await menu.waitFor();
  await page.screenshot({ path: path.join(profile, 'group-popup.png') });
  assert.deepEqual(
    await addGroupButton.boundingBox(),
    beforePopup,
    'popup does not move surrounding groups',
  );
  await page.getByRole('searchbox', { name: 'ファイル名で検索' }).click();
  await until(async () => !(await menu.count()), 'outside click dismisses group popup');
  await menuTrigger.click();
  await page.keyboard.press('Escape');
  await until(async () => !(await menu.count()), 'Escape dismisses group popup');
  assert(await menuTrigger.evaluate((el) => document.activeElement === el));
  await menuTrigger.press('Enter');
  await page.keyboard.press('End');
  assert(
    await menu
      .getByRole('menuitem', { name: 'グループを削除', exact: true })
      .evaluate((el) => document.activeElement === el),
  );
  await page.keyboard.press('Home');
  await menu.getByRole('menuitem', { name: '画像を並べ替え', exact: true }).click();
  const orderDialog = page.getByRole('dialog', { name: '画像を並べ替え', exact: true });
  const firstHandle = orderDialog.locator('.shortcut-order-handle').first();
  const handleId = await firstHandle.getAttribute('data-testid');
  await orderDialog
    .locator('.shortcut-order-command strong')
    .first()
    .dragTo(orderDialog.locator('[data-order-id]').nth(2));
  assert(await orderDialog.getByTestId(handleId).evaluate((el) => document.activeElement === el));
  await orderDialog.getByTestId(handleId).press('ArrowUp');
  await orderDialog.getByTestId('settings-dialog-confirm').click();
  const keyboardOrder = [reordered[1], reordered[0], ...reordered.slice(2)];
  await until(
    async () => JSON.stringify(await members()) === JSON.stringify(keyboardOrder),
    'keyboard image order saved',
  );
  await until(async () => !(await orderDialog.count()), 'order dialog closed');
  await action('group', { groupId: 'all' });
  assert.equal((await model()).content.message, '', 'group changes dismiss success feedback');
  await action('select-all');
  const beforeCancel = await count();
  const sidebar = page.getByRole('complementary', { name: '画像グループ' });
  await sidebar.evaluate((el) => {
    el.style.maxHeight = '170px';
  });
  const side = await sidebar.boundingBox();
  const source = await cards.first().locator('.ad-gallery-image').boundingBox();
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(side.x + side.width / 2, side.y + side.height - 3, { steps: 8 });
  await until(
    async () => await sidebar.evaluate((el) => el.scrollTop > 40),
    'group sidebar autoscroll',
  );
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await sidebar.evaluate((el) => {
    el.style.maxHeight = '';
    el.scrollTop = 0;
  });
  assert.equal((await members()).length, total, 'cancelled drag keeps group membership');
  a = await box(0);
  await page.mouse.move(a.x - 2, a.y + 3);
  await page.mouse.down();
  await page.mouse.move(a.x + 50, a.y + 70, { steps: 5 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  assert.equal(await count(), beforeCancel, 'Escape cancels the range');

  const slider = page.getByRole('slider', { name: '画像サイズ' });
  for (const [edge, expected] of [
    ['left', 120],
    ['right', 360],
  ]) {
    const r = await slider.boundingBox();
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await page.mouse.down();
    await page.mouse.move(edge === 'left' ? r.x - 25 : r.x + r.width + 25, r.y + r.height / 2, {
      steps: 8,
    });
    await page.mouse.up();
    await until(
      async () => (await model()).content.cardWidth === expected,
      `pointer slider ${edge}`,
    );
  }
  await action('width', { value: 120, commit: true });
  await action('clear');
  const scroll = page.locator('.library-scroll');
  await scroll.evaluate((e) => {
    e.scrollTop = 0;
  });
  a = await box(0);
  const viewport = await scroll.boundingBox();
  const rangeSidebar = await sidebar.boundingBox();
  await page.mouse.move(rangeSidebar.x + rangeSidebar.width - 4, a.y + 3);
  await page.mouse.down();
  await page.mouse.move(viewport.x + viewport.width - 24, viewport.y + viewport.height - 4, {
    steps: 8,
  });
  await until(async () => await scroll.evaluate((e) => e.scrollTop > 200), 'range autoscroll');
  await until(async () => (await model()).content.remaining === 0, 'range loads the next page');
  await until(
    async () => scroll.evaluate((e) => e.scrollHeight - e.scrollTop - e.clientHeight < 2),
    'range reaches end',
  );
  await page.mouse.up();
  await until(
    async () => (await count()) === total,
    'panel range retains all offscreen selections',
  );
  await scroll.evaluate((e) => {
    e.scrollTop = 0;
  });
  for (const value of ['light', 'dark']) {
    await theme(value);
    const image = cards.first().locator('.ad-gallery-image');
    await image.hover();
    assert.equal(await image.evaluate((e) => getComputedStyle(e).filter), 'none');
    await page.screenshot({ path: path.join(profile, `interactions-${value}.png`) });
  }
  return 'sticky coverage, outside/Escape/keyboard popup dismissal, text drag, feedback dismissal, background clear/range across panels, group block/keyboard reorder, retained membership order, autoscroll/pagination, slider endpoints and light/dark display';
};
