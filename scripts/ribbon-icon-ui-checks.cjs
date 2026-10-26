const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

/** Exercises the shipped controls with real settings, assets, modal layers and restart. */
module.exports = async function iconChecks(context) {
  let { app, host, rail } = context;
  const { profile, checks, until, saved, openRibbonSettings, restart } = context;
  const images = path.join(profile, 'data/assets/images');
  fs.mkdirSync(images, { recursive: true });
  const png = await app.evaluate(({ nativeImage }) =>
    nativeImage
      .createFromBitmap(Buffer.alloc(32 * 32 * 4, 180), { width: 32, height: 32 })
      .toPNG()
      .toString('base64'),
  );
  const filename = 'fixture-image-with-a-long-name.png';
  const file = path.join(images, filename);
  fs.writeFileSync(file, Buffer.from(png, 'base64'));
  const originalHash = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  await until(
    async () =>
      (await host.evaluate(() => window.dock.imageLibrary.snapshot())).images.some(
        (image) => image.ref.file === filename && image.available,
      ),
    'registered image indexed',
  );
  let page = await openRibbonSettings();
  const edit = async (name = 'Color fixture', title = 'リボングループを編集') => {
    await page.getByRole('button', { name: `${name}を編集`, exact: true }).click();
    return host.getByRole('dialog', { name: title, exact: true });
  };
  const mode = (dialog, name) =>
    dialog
      .locator('.ribbon-icon-modes label')
      .filter({ hasText: new RegExp(`^${name}$`) })
      .click();
  const selectImage = async (dialog, label, confirm = true) => {
    await dialog.getByRole('button', { name: label, exact: true }).click();
    const picker = host.getByRole('dialog', { name: '画像を選択', exact: true });
    assert.equal(await picker.getByRole('button', { name: '画像を外す', exact: true }).count(), 0);
    await picker
      .locator('.ad-gallery-card')
      .filter({ hasText: filename })
      .locator('.ad-gallery-image')
      .click();
    await picker
      .getByRole('button', { name: confirm ? '画像を使う' : 'キャンセル', exact: true })
      .click();
    await picker.waitFor({ state: 'hidden' });
  };
  let dialog = await edit();
  assert(await dialog.getByRole('radio', { name: '既定のアイコン', exact: true }).isChecked());
  assert.equal(await dialog.locator('.registered-image-input').count(), 0);
  assert.equal(await dialog.locator('.ribbon-builtin-icons button').count(), 40);
  assert.equal(
    await dialog
      .getByRole('button', { name: 'フォルダー', exact: true })
      .getAttribute('aria-pressed'),
    'true',
  );
  await mode(dialog, '画像');
  const emptySelect = dialog.getByRole('button', {
    name: 'グループのアイコンの画像を選択',
    exact: true,
  });
  assert.equal(await emptySelect.innerText(), '');
  assert.equal(await emptySelect.getAttribute('title'), '画像を選択');
  assert.equal(await emptySelect.getAttribute('class'), 'registered-image-input-preview');
  assert.equal(await emptySelect.locator('.registered-image-empty').count(), 1);
  assert.equal(await dialog.locator('.registered-image-input button').count(), 2);
  assert(
    await dialog
      .getByRole('button', { name: 'グループのアイコンの画像を外す', exact: true })
      .isDisabled(),
  );
  await emptySelect.focus();
  await emptySelect.press('Enter');
  let picker = host.getByRole('dialog', { name: '画像を選択', exact: true });
  assert(await picker.getByRole('button', { name: '画像を使う', exact: true }).isDisabled());
  await picker.getByRole('button', { name: 'キャンセル', exact: true }).click();
  await until(
    async () => emptySelect.evaluate((e) => document.activeElement === e),
    'picker focus restored',
  );
  await selectImage(dialog, 'グループのアイコンの画像を選択', false);
  assert.equal(await dialog.locator('.registered-image-input img').count(), 0);
  await selectImage(dialog, 'グループのアイコンの画像を選択');
  await dialog.locator('.registered-image-input img').waitFor();
  assert(!(await dialog.locator('.registered-image-input').innerText()).includes(filename));
  const change = dialog.getByRole('button', {
    name: 'グループのアイコンの画像を変更',
    exact: true,
  });
  assert.equal(await change.innerText(), '');
  assert.equal(await change.getAttribute('title'), '画像を変更');
  assert.equal(await change.locator('img').count(), 1);
  await change.focus();
  await change.press('Space');
  picker = host.getByRole('dialog', { name: '画像を選択', exact: true });
  await picker.waitFor();
  await picker.getByRole('button', { name: 'キャンセル', exact: true }).click();
  await until(() => change.evaluate((e) => document.activeElement === e), 'preview focus restored');
  assert.equal((await saved((r) => r.groups[0])).image, undefined);
  checks.push(
    'existing builtin source; preview is the sole image chooser (click/Enter/Space); two controls only, names/tooltips, no filename, empty selection guard and nested cancel/focus',
  );

  await mode(dialog, '既定のアイコン');
  await dialog.getByRole('button', { name: 'メール', exact: true }).click();
  await mode(dialog, '画像');
  await dialog.locator('.registered-image-input img').waitFor();
  await mode(dialog, '既定のアイコン');
  assert.equal(
    await dialog.getByRole('button', { name: 'メール', exact: true }).getAttribute('aria-pressed'),
    'true',
  );
  await dialog.getByRole('radio', { name: '既定のアイコン', exact: true }).focus();
  await host.keyboard.press('ArrowLeft');
  assert(await dialog.getByRole('radio', { name: '画像', exact: true }).isChecked());
  await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
  assert.equal((await saved((r) => r.groups[0])).icon, 'folder');
  assert.equal((await saved((r) => r.groups[0])).image, undefined);
  dialog = await edit();
  await mode(dialog, '画像');
  await selectImage(dialog, 'グループのアイコンの画像を選択');
  await dialog.getByRole('button', { name: '適用', exact: true }).click();
  await saved((r) => r.groups[0].image?.file === filename);
  await rail.locator('[data-ribbon-id="group:colored"] img').waitFor();
  checks.push(
    'both source drafts survive switching and keyboard selection; parent cancel discards changes; apply renders image',
  );

  for (const theme of ['light', 'dark']) {
    await host.evaluate(async (theme) => {
      const s = await window.dock.snapshot();
      await window.dock.saveSettings(
        { ...s.settings.value, host: { ...s.settings.value.host, theme } },
        s.settings.revision,
      );
    }, theme);
    for (const width of [1120, 760]) {
      await app.evaluate(
        ({ BrowserWindow }, width) =>
          BrowserWindow.getAllWindows()
            .find((w) => w.webContents.getURL().startsWith('appdock://host/'))
            .setSize(width, 850),
        width,
      );
      dialog = await edit();
      await until(
        async () => (await host.locator('html').getAttribute('data-theme')) === theme,
        'theme',
      );
      assert(await dialog.getByRole('radio', { name: '画像', exact: true }).isChecked());
      let panelHeight, dialogHeight;
      for (const source of ['画像', '既定のアイコン']) {
        await mode(dialog, source);
        if (source === '画像') {
          const preview = dialog.locator('.registered-image-input img');
          await preview.waitFor();
          await until(
            () => preview.evaluate((image) => image.complete && image.naturalWidth > 0),
            'preview image decoded',
          );
        }
        const layout = await dialog.getByTestId('ribbon-icon-picker').evaluate((element) => ({
          overflow: element.scrollWidth > element.clientWidth,
          height: element.querySelector('.ribbon-icon-content').getBoundingClientRect().height,
        }));
        assert.equal(layout.overflow, false);
        panelHeight ??= layout.height;
        dialogHeight ??= (await dialog.boundingBox()).height;
        assert.equal(layout.height, panelHeight);
        assert.equal((await dialog.boundingBox()).height, dialogHeight);
        if (source === '既定のアイコン') {
          const strip = dialog.getByTestId('ribbon-builtin-icons');
          const row = await strip.evaluate((element) => ({
            scrolls: element.scrollWidth > element.clientWidth,
            rows: new Set([...element.children].map((button) => button.getBoundingClientRect().top))
              .size,
            overflowY: getComputedStyle(element).overflowY,
          }));
          assert.equal(row.rows, 1);
          assert(row.scrolls);
          assert.equal(row.overflowY, 'hidden');
          await dialog.getByRole('button', { name: 'ヘルプ', exact: true }).focus();
          assert(await strip.evaluate((element) => element.scrollLeft > 0));
        }
        await dialog.screenshot({
          path: path.join(
            profile,
            `icon-${theme}-${width}-${source === '画像' ? 'image' : 'builtin'}.png`,
          ),
        });
      }
      await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    }
  }
  checks.push(
    'light/dark and 1120/760 widths keep one scrolling row, keyboard focus visible and equal panel/dialog heights across image/builtin sources',
  );

  dialog = await edit();
  await dialog.getByRole('button', { name: 'グループのアイコンの画像を外す', exact: true }).click();
  assert.equal(await dialog.locator('.registered-image-input img').count(), 0);
  await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
  assert.equal((await saved((r) => r.groups[0])).image.file, filename);
  dialog = await edit();
  await mode(dialog, '既定のアイコン');
  await dialog.getByRole('button', { name: 'メール', exact: true }).click();
  await dialog.getByRole('button', { name: '適用', exact: true }).click();
  await saved((r) => r.groups[0].icon === 'mail' && !r.groups[0].image);
  await until(
    async () => (await rail.locator('[data-ribbon-id="group:colored"] img').count()) === 0,
    'builtin rendered',
  );
  dialog = await edit();
  assert(await dialog.getByRole('radio', { name: '既定のアイコン', exact: true }).isChecked());
  await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
  checks.push(
    'remove can be cancelled; builtin apply clears active image reference and reopens in builtin mode',
  );

  dialog = await edit('Icon command', 'コマンドボタンを編集');
  await mode(dialog, '画像');
  await selectImage(dialog, 'ボタンのアイコンの画像を選択');
  await dialog.getByRole('button', { name: '適用', exact: true }).click();
  await saved((r) => r.buttons[0].image?.file === filename);
  await rail.locator('[data-ribbon-id="button:icon"] img').waitFor();
  await page
    .locator('[data-ribbon-setting="image-library"]')
    .getByRole('button', { name: /を編集$/ })
    .click();
  dialog = host.getByRole('dialog', { name: 'リボンボタンを編集', exact: true });
  await dialog.waitFor();
  assert.equal(await dialog.locator('.ribbon-icon-modes').count(), 1);
  await mode(dialog, '画像');
  await selectImage(dialog, 'ボタンのアイコンの画像を選択');
  await dialog.getByRole('button', { name: '適用', exact: true }).click();
  await saved((r) => r.itemOverrides?.['image-library']?.image?.file === filename);
  await page
    .locator('[data-ribbon-setting="image-library"]')
    .getByRole('button', { name: /を編集$/ })
    .click();
  dialog = host.getByRole('dialog', { name: 'リボンボタンを編集', exact: true });
  await dialog.getByRole('button', { name: 'ボタンのアイコンの画像を外す', exact: true }).click();
  await dialog.getByRole('button', { name: '適用', exact: true }).click();
  await saved((r) => !r.itemOverrides?.['image-library']?.image);
  checks.push(
    'command editor shares source controls; ordinary ribbon item shares image input and persists removal',
  );

  const overrides = [
    ['ribbon-display-mode', 'star', '星'],
    ['page:fixture.ribbon-icons:main', 'calendar', 'カレンダー'],
    ['applet:fixture.ribbon-icons:main', 'music', '音楽'],
  ];
  await rail.locator('[data-ribbon-id="applet:fixture.ribbon-icons:main"] img').waitFor();
  const getItem = async (id) =>
    (await rail.evaluate(() => window.appdockShell.get())).items.find((item) => item.id === id);
  const actions = new Map();
  for (const [id, icon, name] of overrides) {
    const editors = () =>
      id === 'ribbon-display-mode'
        ? ['compact', 'expanded'].map((mode) => dialog.getByTestId(`ribbon-mode-icon-${mode}`))
        : [dialog];
    const savedIcon = (r) =>
      id === 'ribbon-display-mode'
        ? ['compact', 'expanded'].every(
            (mode) => r.itemOverrides?.[id]?.displayModeIcons?.[mode]?.icon === icon,
          )
        : r.itemOverrides?.[id]?.icon === icon;
    actions.set(id, (await getItem(id)).actionId);
    await page
      .locator(`[data-ribbon-setting="${id}"]`)
      .getByRole('button', { name: /を編集$/ })
      .click();
    dialog = host.getByRole('dialog', { name: 'リボンボタンを編集', exact: true });
    if (id.startsWith('applet:')) {
      if (!(await dialog.getByRole('radio', { name: '画像', exact: true }).isChecked())) {
        fs.writeFileSync(
          path.join(profile, 'inherited-image-diagnostic.json'),
          JSON.stringify(
            await host.evaluate(async () => {
              const s = await window.dock.snapshot();
              const a = s.extensions.find((a) => a.id === 'fixture.ribbon-icons');
              return {
                definitions: a?.settings,
                contribution: a?.ribbonItems,
                values: s.settings.value.extensions['fixture.ribbon-icons'],
              };
            }),
            null,
            2,
          ),
        );
      }
      assert(await dialog.getByRole('radio', { name: '画像', exact: true }).isChecked());
      await dialog.getByRole('button', { name: '適用', exact: true }).click();
      assert.equal((await saved((r) => r.itemOverrides[id])).image, undefined);
      await page
        .locator(`[data-ribbon-setting="${id}"]`)
        .getByRole('button', { name: /を編集$/ })
        .click();
      dialog = host.getByRole('dialog', { name: 'リボンボタンを編集', exact: true });
    }
    assert.equal(await dialog.getByText('リボンの画像', { exact: true }).count(), 0);
    for (const editor of editors()) {
      await mode(editor, '既定のアイコン');
      await editor.getByRole('button', { name, exact: true }).click();
    }
    await dialog.getByRole('button', { name: '適用', exact: true }).click();
    await saved(savedIcon);
    await until(async () => (await getItem(id)).icon.name === icon, 'override rendered');
    assert.equal((await getItem(id)).icon.assetId, undefined);
    assert.equal((await getItem(id)).actionId, actions.get(id));
    await page
      .locator(`[data-ribbon-setting="${id}"]`)
      .getByRole('button', { name: /を編集$/ })
      .click();
    dialog = host.getByRole('dialog', { name: 'リボンボタンを編集', exact: true });
    for (const editor of editors()) {
      assert.equal(
        await editor.getByRole('button', { name, exact: true }).getAttribute('aria-pressed'),
        'true',
      );
      await editor.getByRole('button', { name: 'ハート', exact: true }).click();
    }
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await saved(savedIcon);
  }
  const beforeMode = await rail
    .evaluate(() => window.appdockShell.get())
    .then((model) => model.displayMode);
  await rail.locator('[data-ribbon-id="ribbon-display-mode"]').click();
  await until(
    async () => (await rail.evaluate(() => window.appdockShell.get())).displayMode !== beforeMode,
    'mode toggled',
  );
  await until(
    async () => (await getItem('ribbon-display-mode')).icon.name === 'star',
    'custom icon survives mode switch',
  );
  checks.push(
    'mode button, Applet page and declared Applet button share builtin picker; custom icons override inherited images, preserve action ids and support cancel/reopen',
  );

  await page.getByRole('button', { name: '＋ グループ', exact: true }).first().click();
  dialog = host.getByRole('dialog', { name: 'リボングループを追加', exact: true });
  assert(await dialog.getByRole('radio', { name: '画像', exact: true }).isChecked());
  await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
  ({ app, host, rail } = await restart());
  for (const [id, icon] of overrides) {
    await until(async () => (await getItem(id))?.icon.name === icon, 'override restored');
  }
  assert.equal((await saved((r) => r.groups[0])).icon, 'mail');
  assert.equal((await saved((r) => r.groups[0])).image, null);
  await rail.locator('[data-ribbon-id="button:icon"] img').waitFor();
  page = await openRibbonSettings();
  dialog = await edit('Icon command', 'コマンドボタンを編集');
  assert(await dialog.getByRole('radio', { name: '画像', exact: true }).isChecked());
  await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
  assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'), originalHash);
  checks.push(
    'new group starts with image; real restart preserves sources; all operations preserve original image bytes',
  );
  await require('./ribbon-reset-mode-ui-checks.cjs')({ ...context, app, host, rail });
  assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'), originalHash);
};
