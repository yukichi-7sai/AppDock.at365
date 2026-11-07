const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launch, until, hash } = require('./page-test-host.cjs');
const { wave } = require('./sound-library-fixture.cjs');
const { hostText } = require('../out/main/shared/i18n');
const portable = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
const profile = fs.mkdtempSync(path.resolve(__dirname, '../.artifacts/external-library-ui-'));
const share = process.argv[3] && path.resolve(process.argv[3]);
const external = share
  ? fs.mkdtempSync(path.join(share, 'appdock-external-ui-'))
  : path.join(profile, 'external');
fs.mkdirSync(path.join(external, 'nested'), { recursive: true });
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="24" height="24" fill="red"/></svg>';
fs.writeFileSync(path.join(external, 'sample.svg'), svg);
fs.writeFileSync(path.join(external, 'nested/child.svg'), svg);
fs.writeFileSync(path.join(external, 'sample.wav'), wave(250));
fs.writeFileSync(path.join(external, 'sample.txt'), 'External searchable body 外部本文検索');
const originals = ['sample.svg', 'nested/child.svg', 'sample.wav', 'sample.txt'].map((file) => ({
  file,
  hash: hash(path.join(external, file)),
}));
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
Object.assign(settings.host, { closeToTray: false, soundEnabled: false });
Object.assign(settings.updates, {
  checkHostOnStartup: false,
  checkHostOnAboutOpen: false,
  checkAppletsOnStartup: false,
});
settings.globalShortcutCommands = [];
settings.gestures.enabled = false;
settings.imageLibrary = { groups: [{ id: 'keep', name: 'External group', images: [] }] };
fs.writeFileSync(require('./test-settings.cjs').file(profile), JSON.stringify(settings));
let session, page;
const errors = [],
  checks = [];
const model = () => page.evaluate(() => window.dock.pages.get());
const action = (command, fields = {}) =>
  page.evaluate(
    async ({ command, fields }) => {
      const m = await window.dock.pages.get();
      return window.dock.pages.act({ id: m.id, type: 'gallery', command, ...fields });
    },
    { command, fields },
  );
const open = async (media) => {
  await page.evaluate(
    (media) => window.dock.executeCommand(`appdock.${media}-library.open`),
    media,
  );
  await page.locator(`.library-page[data-media="${media}"]`).waitFor();
};
const button = (key) => page.getByRole('button', { name: hostText(key), exact: true }).first();
async function run() {
  session = await launch(profile, portable);
  page = session.main;
  page.on('pageerror', (e) => errors.push(String(e)));
  await session.resize(1720, 1000);
  const display = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    devicePixelRatio,
  }));
  const zoomFactor = await session.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((window) => window.webContents.getURL().startsWith('appdock://host/index.html'))
      .webContents.getZoomFactor(),
  );
  await open('image');
  await page.getByRole('button', { name: /外部フォルダを追加/ }).click();
  let dialog = page.getByRole('dialog', { name: hostText('library.sources.add'), exact: true });
  await dialog
    .getByRole('textbox', { name: hostText('library.sources.path'), exact: true })
    .fill(external);
  await dialog
    .getByRole('textbox', { name: hostText('library.sources.name'), exact: true })
    .fill('External fixture');
  await dialog.getByRole('button', { name: 'OK', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await until(async () => (await model()).content.sources[0]?.available, 'external indexed');
  assert.equal((await model()).content.total, 0, 'data root never includes external files');
  const dataRoot = () =>
    page
      .locator('.library-sidebar')
      .getByRole('button', { name: hostText('images.allFolders'), exact: true });
  const dataToggle = (scope, expanded) =>
    scope.getByRole('button', {
      name: hostText(expanded ? 'images.collapseItem' : 'images.expandItem', {
        name: hostText('images.allFolders'),
      }),
      exact: true,
    });
  await page.keyboard.press('Tab');
  await dataRoot().focus();
  await page.screenshot({ path: path.join(profile, 'data-root-focus.png') });
  await dataToggle(page, true).press('Enter');
  await until(
    async () => (await model()).content.layout.collapsedFolders.includes('*'),
    'data root collapse saved',
  );
  assert.equal(await page.locator('[data-gallery-folder=""]').count(), 0);
  assert.equal(
    (await model()).content.folder,
    '*',
    'collapse does not change the folder or destination',
  );
  await page.getByRole('button', { name: /External fixture 読み取り専用/ }).click();
  await until(async () => (await model()).content.total === 2, 'external subtree');
  await page.locator('.ad-gallery-card').first().waitFor();
  assert.equal((await model()).content.canWrite, false);
  assert.equal((await model()).content.sources[0].available, true);
  // External edits must arrive through native notifications with assistance left OFF.
  fs.writeFileSync(path.join(external, 'watch-arrival.svg'), svg);
  await until(async () => (await model()).content.total === 3, 'native external arrival');
  fs.unlinkSync(path.join(external, 'watch-arrival.svg'));
  await until(async () => (await model()).content.total === 2, 'native external deletion');
  checks.push('native change notifications with assistance OFF');
  for (const key of [
    'images.addImages',
    'imageGeneration.open',
    'images.importSet',
    'images.createFolder',
  ])
    await until(() => button(key).isDisabled(), key + ' disabled');
  await button('images.selectAll').click();
  await until(async () => (await model()).content.selected === 2, 'select external files');
  assert(await button('images.delete').isDisabled());
  await button('images.addToGroup').click();
  dialog = page.getByRole('dialog', { name: hostText('images.addToGroup'), exact: true });
  await dialog.getByRole('button', { name: hostText('common.apply'), exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(
    (await page.evaluate(() => window.dock.snapshot())).settings.value.imageLibrary.groups[0].images
      .length,
    2,
  );
  const rejected = await action('dialog', { kind: 'delete-image' }).then(
    () => false,
    () => true,
  );
  assert(rejected, 'backend rejects a forged write action');
  checks.push(
    'real dialog registration, root isolation, read-only controls/backend, shared group edits',
  );
  const source = (await model()).content.sources[0];
  const externalToggle = () =>
    page.getByRole('button', {
      name: hostText('images.collapseItem', { name: 'External fixture' }),
      exact: true,
    });
  await page.getByRole('button', { name: /External fixture 読み取り専用/ }).focus();
  await page.keyboard.press('Shift+Tab');
  await page.screenshot({ path: path.join(profile, 'external-toggle-focus.png') });
  await externalToggle().press('Enter');
  await until(
    async () => (await model()).content.layout.collapsedFolders.includes(`@external:${source.id}`),
    'external collapse',
  );
  assert.equal((await model()).content.total, 2);
  assert.equal((await model()).content.selected, 2, 'collapse preserves selection');
  await page
    .getByRole('button', {
      name: hostText('images.expandItem', { name: 'External fixture' }),
      exact: true,
    })
    .press('Enter');
  checks.push('both roots collapse by keyboard while preserving the selected folder and assets');
  await page.evaluate(() => {
    window.externalPickResult = undefined;
    void window.dock.imageLibrary.pick().then((result) => {
      window.externalPickResult = result;
    });
  });
  const picker = page.getByRole('dialog', {
    name: hostText('settings.registeredImagePicker.select'),
    exact: true,
  });
  await dataToggle(picker, true).waitFor();
  await dataToggle(picker, true).press('Enter');
  assert.equal(
    await picker.locator('[data-gallery-folder=""]').count(),
    0,
    'picker root collapse is independent of the management page',
  );
  await picker.getByRole('button', { name: /External fixture 読み取り専用/ }).click();
  await until(
    () =>
      picker
        .getByRole('button', {
          name: hostText('settings.registeredImagePicker.register'),
          exact: true,
        })
        .isDisabled(),
    'picker registration disabled for external root',
  );
  await picker.getByRole('button', { name: 'sample.svgを選択', exact: true }).click();
  await picker
    .getByRole('button', { name: hostText('settings.registeredImagePicker.use'), exact: true })
    .click();
  await picker.waitFor({ state: 'hidden' });
  const picked = await page.evaluate(() => window.externalPickResult);
  assert.match(picked.image.file, /^@assigned\//);
  assert.equal(
    hash(path.join(profile, 'data/assets/assigned-images', picked.image.file.slice(10))),
    originals[0].hash,
  );
  checks.push('external image picker selection retains a verified internal settings copy');
  await page.screenshot({ path: path.join(profile, 'image-external.png') });
  await session.save({ host: { theme: 'dark' } });
  await session.resize(900, 620);
  const navigation = page.locator('.library-navigation-button');
  if (await navigation.isVisible()) await navigation.click();
  await page.keyboard.press('Tab');
  await page.getByRole('button', { name: /External fixture 読み取り専用/ }).focus();
  await page.screenshot({ path: path.join(profile, 'root-focus-narrow-dark.png') });
  await page.keyboard.press('Escape');
  await session.resize(1720, 1000);
  await session.save({ host: { theme: 'light' } });
  const childFolder = page.locator(`[data-gallery-folder="@external:${source.id}/nested"]`);
  await childFolder.click();
  await page.keyboard.press('Tab');
  await childFolder.focus();
  await page.screenshot({ path: path.join(profile, 'child-folder-focus.png') });
  await action('folder', { folder: `@external:${source.id}` });
  await until(async () => (await model()).content.total === 1, 'direct children');
  for (const media of ['sound', 'text']) {
    await open(media);
    await page.getByRole('button', { name: /External fixture 読み取り専用/ }).click();
    await until(async () => (await model()).content.total === 1, 'media-filtered root');
    assert.equal((await model()).content.canWrite, false);
    await button('images.selectAll').click();
    await until(async () => (await model()).content.selected === 1, 'media selection');
    assert(await button('images.delete').isDisabled());
    if (media === 'text') {
      const search = page.getByRole('searchbox');
      await search.fill('外部本文検索');
      await until(
        async () => (await model()).content.total === 1 && !(await model()).content.indexing,
        'external body search',
      );
      assert(await button('texts.edit').isDisabled());
    }
  }
  checks.push(
    'sound/text sources shared, direct-child scope, text body search, write controls disabled',
  );
  ({ session, page } = await require('./external-library-write-check.cjs')({
    session,
    profile,
    portable,
    external,
    source,
    errors,
  }));
  checks.push(
    'access cancel/save/restart, external import/rename/move/folders/text editing, shared revocation',
    share
      ? 'UNC image/sound/text real permanent deletion, warning and cancel preserve original'
      : 'local image/sound/text recycle adapter, confirmation and cancel preserve original',
  );
  await session.close();
  session = undefined;
  session = await launch(profile, portable);
  page = session.main;
  await open('image');
  await dataToggle(page, false).waitFor();
  assert.equal(
    await page.locator('[data-gallery-folder=""]').count(),
    0,
    'data root collapse survives restart',
  );
  await page.getByRole('button', { name: /External fixture 読み取り専用/ }).click();
  await until(async () => (await model()).content.total === 2, 'registration survives restart');
  assert.equal(
    (await page.evaluate(() => window.dock.snapshot())).settings.value.imageLibrary.groups[0].images
      .length,
    2,
  );
  const rootButton = page.getByRole('button', { name: /External fixture 読み取り専用/ });
  await rootButton
    .locator('..')
    .getByRole('button', { name: /の操作/ })
    .click();
  await page
    .getByRole('menuitem', { name: hostText('library.sources.remove'), exact: true })
    .click();
  dialog = page.getByRole('dialog', { name: hostText('library.sources.remove'), exact: true });
  await dialog.getByRole('button', { name: 'OK', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await until(async () => (await model()).content.sources.length === 0, 'unregistered');
  for (const original of originals)
    assert.equal(hash(path.join(external, original.file)), original.hash);
  assert.deepEqual(fs.readdirSync(external).sort(), [
    'nested',
    'sample.svg',
    'sample.txt',
    'sample.wav',
  ]);
  assert.deepEqual(errors, []);
  checks.push('restart persistence, registration-only removal, unchanged original files');
  fs.writeFileSync(
    path.join(profile, 'result.json'),
    JSON.stringify(
      {
        ok: true,
        portable,
        external,
        sha256: portable ? hash(portable) : undefined,
        display,
        zoomFactor,
        checks,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ ok: true, profile, checks }));
}
// Dialog-opening page actions stay pending until closed; UI clicks dispatch without awaiting them.
(async () => {
  try {
    await run();
  } catch (error) {
    fs.writeFileSync(
      path.join(profile, 'failure.json'),
      JSON.stringify({ error: String(error.stack ?? error), checks, errors }, null, 2),
    );
    await page?.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
    console.error(error);
    console.log(JSON.stringify({ profile, checks }));
    process.exitCode = 1;
  } finally {
    await session?.close();
    if (share && !process.exitCode) {
      // Only the exact newly created fixture is removed; no recursive share deletion.
      assert.equal(path.dirname(external).toLowerCase(), share.toLowerCase());
      assert(path.basename(external).startsWith('appdock-external-ui-'));
      for (const file of ['sample.svg', 'sample.wav', 'sample.txt', 'nested/child.svg'])
        fs.unlinkSync(path.join(external, file));
      fs.rmdirSync(path.join(external, 'nested'));
      fs.rmdirSync(external);
    }
  }
})();
