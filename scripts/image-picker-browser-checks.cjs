const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');

module.exports = async ({ host, app, picker, profile, until, checks }) => {
  const directory = path.join(profile, 'data/assets/images');
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12 12 3 21 12 12 21Z"/></svg>';
  fs.mkdirSync(path.join(directory, 'Picker Icons/Nested'), { recursive: true });
  for (let i = 0; i < 150; i++)
    fs.writeFileSync(
      path.join(directory, `Picker Icons/icon-${String(i).padStart(3, '0')}.svg`),
      svg,
    );
  fs.writeFileSync(path.join(directory, 'Picker Icons/Nested/child.svg'), svg);
  const refs = [
    'Picker Icons/icon-003.svg',
    'Picker Icons/icon-001.svg',
    'Picker Icons/Nested/child.svg',
  ].map((file) => ({ file }));
  await host.evaluate(async (refs) => {
    await window.dock.imageLibrary.edit({
      kind: 'add',
      group: { id: 'picker-lucide-a', name: 'Lucide: Arrows', images: refs },
    });
    await window.dock.imageLibrary.edit({
      kind: 'add',
      group: { id: 'picker-lucide-b', name: 'Lucide: Shapes', images: [refs[0]] },
    });
  }, refs);
  await until(
    async () =>
      (await host.evaluate(() => window.dock.imageLibrary.snapshot())).images.length >= 155,
    'picker SVG fixtures indexed',
  );
  await picker.getByRole('button', { name: '再取得', exact: true }).click();
  const view = () => host.evaluate(() => window.dock.imageLibrary.galleryView());
  const search = picker.getByRole('searchbox');
  const navigation = picker.locator('.library-sidebar');
  const folder = (name) => navigation.locator(`[data-gallery-folder="${name}"]`);
  const cards = picker.locator('.ad-gallery-card');
  const frame = async () => ({
    modal: await picker.boundingBox(),
    footer: await picker.locator('footer').boundingBox(),
  });
  const original = await frame();
  await search.fill('no-such-picker-image');
  await until(() => cards.count().then((count) => count === 0), 'empty picker');
  const empty = await frame();
  assert(Math.abs(original.modal.height - empty.modal.height) < 1);
  assert(Math.abs(original.footer.y - empty.footer.y) < 1, 'empty search keeps footer fixed');
  assert.equal(await picker.getByTestId('image-picker-filename').innerText(), 'sample.png');
  assert(
    await picker.getByTestId('settings-dialog-confirm').isEnabled(),
    'filtered selection remains usable',
  );
  await search.press('Escape');
  assert(await picker.isVisible(), 'search Escape clears without cancelling');
  await folder('Picker Icons').click();
  const rootX = await folder('').evaluate((node) => node.getBoundingClientRect().left);
  const topX = await folder('Picker Icons').evaluate((node) => node.getBoundingClientRect().left);
  assert(Math.abs(rootX - topX) < 1, 'root and direct folders are siblings');
  await navigation.locator('[data-gallery-group="group:picker-lucide-a"]').click();
  await until(() => cards.count().then((count) => count === 3), 'folder and group intersection');
  assert.deepEqual(
    await cards.evaluateAll((nodes) => nodes.map((node) => node.title)),
    refs.map((ref) => ref.file),
  );
  await search.fill('001');
  await until(
    () => cards.count().then((count) => count === 1),
    'search intersects group and folder',
  );
  await cards.first().locator('.ad-gallery-image').click();
  assert.equal(await picker.getByTestId('image-picker-filename').innerText(), refs[1].file);
  assert.equal(
    await host.evaluate(
      async () =>
        (await window.dock.snapshot()).settings.value.extensions['at365.profile'].settings.avatar,
    ),
    undefined,
  );
  await search.fill('no-such-picker-image');
  assert.equal(await picker.getByTestId('image-picker-filename').innerText(), refs[1].file);
  await search.press('Escape');
  await picker.getByTitle('グループの絞り込みを解除', { exact: true }).click();
  await until(() => cards.count().then((count) => count >= 64), 'initial picker chunk');
  const slider = picker.getByRole('slider', { name: '画像サイズ' });
  await slider.press('Home');
  await until(async () => (await view()).cardWidth === 40, '40px picker cards persisted');
  await until(
    () => cards.count().then((count) => count > 64),
    'small picker fills viewport automatically',
  );
  const imageWidth = await cards
    .first()
    .locator('.ad-gallery-image img')
    .evaluate((node) => node.clientWidth);
  assert(imageWidth >= 23 && imageWidth <= 26, 'icon fits about 24px: ' + imageWidth);
  const scroll = picker.locator('.image-picker-scroll');
  await scroll.hover();
  await host.mouse.wheel(0, 6000);
  await until(
    () => cards.count().then((count) => count === 151),
    'wheel loads all remaining images',
  );
  assert.equal(await picker.getByTestId('image-picker-filename').innerText(), refs[1].file);
  await picker.screenshot({ path: path.join(profile, 'picker-compact.png') });
  await picker.getByRole('separator', { name: 'フォルダー・グループエリアの幅' }).press('Home');
  await picker
    .getByRole('separator', { name: 'フォルダー・グループエリアの幅' })
    .press('ArrowRight');
  await until(async () => (await view()).layout.sidebarWidth === 168, 'picker sidebar width saved');
  await navigation.locator('.library-prefix-toggle').filter({ hasText: 'Lucide' }).click();
  await navigation.getByRole('button', { name: 'Picker Iconsを折りたたむ', exact: true }).click();
  await until(async () => {
    const saved = (await view()).layout;
    return (
      saved.collapsedGroups.includes('Lucide') && saved.collapsedFolders.includes('Picker Icons')
    );
  }, 'picker collapsed indexes saved');
  const device = JSON.parse(
    fs.readFileSync(
      require('./test-settings.cjs').file(
        profile,
        `settings-${require('node:os').hostname()}.json`,
      ),
    ),
  );
  assert.equal(
    device.uiState.gallery.library?.layout,
    undefined,
    'picker layout does not alter library layout',
  );
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().startsWith('appdock://host/'))
      .setMinimumSize(320, 480),
  );
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().startsWith('appdock://host/'))
      .setSize(540, 850),
  );
  const opener = picker.getByRole('button', { name: 'フォルダーとグループ', exact: true });
  await opener.waitFor();
  await opener.click();
  await navigation.locator(':scope:popover-open').waitFor();
  await navigation.getByRole('button', { name: 'データフォルダ', exact: true }).press('Escape');
  await until(
    () => opener.evaluate((node) => node === document.activeElement),
    'drawer Escape returns focus',
  );
  assert(await picker.isVisible(), 'drawer Escape does not cancel picker');
  await opener.click();
  await navigation.getByRole('button', { name: 'データフォルダ', exact: true }).click();
  await until(
    () => navigation.evaluate((node) => !node.matches(':popover-open')),
    'folder navigation closes drawer',
  );
  assert(
    await picker.evaluate((node) => node.scrollWidth <= node.clientWidth),
    'narrow picker fits',
  );
  await picker.screenshot({ path: path.join(profile, 'picker-navigation-narrow.png') });
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().startsWith('appdock://host/'))
      .setSize(1360, 950),
  );
  await until(
    () =>
      picker
        .locator('.image-picker-browser')
        .getAttribute('data-narrow')
        .then((value) => value === 'false'),
    'wide picker restored',
  );
  await slider.press('End');
  for (let i = 0; i < 30; i++) await slider.press('ArrowLeft');
  await until(async () => (await view()).cardWidth === 240, 'normal picker size restored');
  await folder('Picker Icons').click();
  await search.fill('icon-000');
  const registered = path.join(profile, 'picker-registered.svg');
  fs.writeFileSync(registered, svg.replace('M3 12 12 3 21 12 12 21Z', 'M2 2 22 2 22 22 2 22Z'));
  await app.evaluate((_, file) => {
    global.__imageLibraryFiles = [file];
  }, registered);
  await picker.getByTestId('settings-dialog-secondary').click();
  await until(
    () =>
      picker
        .getByTestId('image-picker-filename')
        .innerText()
        .then((value) => value === 'picker-registered.svg'),
    'registered image selected',
  );
  assert.equal(await search.inputValue(), '');
  assert.equal(
    await navigation
      .getByRole('button', { name: 'データフォルダ', exact: true })
      .getAttribute('aria-current'),
    'page',
  );
  await cards.filter({ hasText: 'picker-registered.svg' }).waitFor();
  await picker.screenshot({ path: path.join(profile, 'picker-ready.png') });
  for (const theme of ['dark', 'light']) {
    await host.evaluate(async (theme) => {
      const state = await window.dock.snapshot();
      state.settings.value.host.theme = theme;
      await window.dock.saveSettings(state.settings.value, state.settings.revision);
    }, theme);
    await until(
      () =>
        host
          .locator('html')
          .getAttribute('data-theme')
          .then((value) => value === theme),
      'SVG preview theme',
    );
    await until(
      () =>
        picker
          .locator('.image-picker-selected-preview img')
          .evaluate((image) => image.complete && image.naturalWidth > 0),
      'SVG footer preview decoded',
    );
    await picker
      .locator('.image-picker-summary')
      .screenshot({ path: path.join(profile, `picker-selected-svg-${theme}.png`) });
  }
  checks.push(
    'picker folder/group/search intersection and saved order; fixed footer/selection, 24px icons, automatic paging, independent layout persistence and narrow drawer focus',
  );
};
