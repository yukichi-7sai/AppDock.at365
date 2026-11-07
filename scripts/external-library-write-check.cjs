const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launch, until } = require('./page-test-host.cjs');
const { libraryText } = require('../out/main/shared/library-text');

module.exports = async function checkExternalWrites({
  session,
  profile,
  portable,
  external,
  source,
  errors,
}) {
  let page = session.main;
  let currentMedia = 'image';
  const t = (key) => libraryText(currentMedia, key);
  const root = `@external:${source.id}`;
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
    currentMedia = media;
    await page.evaluate(
      (media) => window.dock.executeCommand(`appdock.${media}-library.open`),
      media,
    );
    await page.locator(`.library-page[data-media="${media}"]`).waitFor();
    await action('folder', { folder: root + '/*' });
  };
  const openDialog = async (kind, key, fields = {}) => {
    await page.evaluate(
      async ({ kind, fields }) => {
        const m = await window.dock.pages.get();
        void window.dock.pages
          .act({ id: m.id, type: 'gallery', command: 'dialog', kind, ...fields })
          .catch(() => {});
      },
      { kind, fields },
    );
    const dialog = page.getByRole('dialog', { name: t(key), exact: true });
    await dialog.waitFor();
    return dialog;
  };
  const apply = async (dialog, label = t('images.apply')) => {
    await dialog.getByRole('button', { name: label, exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
  };
  const accessDialog = async () => {
    await page
      .locator(`[data-gallery-root="${root}"]`)
      .locator('..')
      .getByRole('button', { name: /の操作/ })
      .click();
    await page.getByRole('menuitem', { name: t('library.sources.edit'), exact: true }).click();
    return page.getByRole('dialog', { name: t('library.sources.edit'), exact: true });
  };
  await open('image');
  let dialog = await accessDialog();
  await dialog.getByLabel(t('library.sources.access'), { exact: true }).selectOption('read-write');
  await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
  assert.equal((await model()).content.sources[0].access, 'read-only');
  dialog = await accessDialog();
  await dialog.getByLabel(t('library.sources.access'), { exact: true }).selectOption('read-write');
  await page.screenshot({ path: path.join(profile, 'source-access-light.png') });
  await apply(dialog, 'OK');
  await until(async () => (await model()).content.canWrite, 'write mode enabled');
  assert.equal((await model()).content.sources[0].id, source.id);
  await session.close();
  session = await launch(profile, portable);
  page = session.main;
  page.on('pageerror', (error) => errors.push(String(error)));
  await open('image');
  await until(async () => (await model()).content.canWrite, 'write mode survives restart');
  const imported = path.join(profile, 'imported.svg');
  fs.writeFileSync(imported, fs.readFileSync(path.join(external, 'sample.svg')));
  await session.app.evaluate(
    ({ dialog, shell }, { imported, external, profile }) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [imported] });
      shell.trashItem = async (file) => {
        const fs = process.getBuiltinModule('node:fs/promises');
        const path = process.getBuiltinModule('node:path');
        if (!file.startsWith(external + path.sep)) throw Error('Outside isolated external root');
        const trash = path.join(profile, 'recycled');
        await fs.mkdir(trash, { recursive: true });
        await fs.rename(file, path.join(trash, path.basename(file)));
      };
    },
    { imported, external, profile },
  );
  await action('add');
  assert(fs.existsSync(path.join(external, 'imported.svg')));
  dialog = await openDialog('folder-create', 'images.createFolder');
  const folderInput = dialog.getByLabel(t('images.folderPath'), { exact: true });
  assert.equal(await folderInput.inputValue(), '', 'root path is a user-facing relative path');
  await folderInput.fill('created');
  await apply(dialog);
  await until(() => fs.existsSync(path.join(external, 'created')), 'external directory created');
  await action('folder', { folder: root + '/*' });
  const select = async (name) => {
    await until(
      async () => (await model()).content.items.some((item) => item.title === name),
      `visible ${name}`,
    );
    const item = (await model()).content.items.find((item) => item.title === name);
    await action('select-target', { imageId: item.id });
  };
  await select('imported.svg');
  dialog = await openDialog('rename-images', 'images.renameImages');
  await dialog.getByRole('textbox').first().fill('renamed');
  await apply(dialog);
  assert(fs.existsSync(path.join(external, 'renamed.svg')));
  dialog = await openDialog('folder-move', 'images.moveImages');
  await dialog.getByLabel(t('images.destination'), { exact: true }).selectOption(root + '/created');
  await apply(dialog);
  assert(fs.existsSync(path.join(external, 'created/renamed.svg')));
  dialog = await openDialog('folder-rename', 'images.renameFolder');
  await dialog.getByLabel(t('images.folderPath'), { exact: true }).fill('renamed-folder');
  await apply(dialog);
  assert(fs.existsSync(path.join(external, 'renamed-folder/renamed.svg')));
  await select('renamed-folder/renamed.svg');
  dialog = await openDialog('delete-image', 'images.deleteImages');
  await apply(dialog, t('common.delete'));
  assert(fs.existsSync(path.join(profile, 'recycled/renamed.svg')));
  dialog = await openDialog('folder-delete', 'images.deleteFolder');
  await apply(dialog);
  assert(!fs.existsSync(path.join(external, 'renamed-folder')));
  await open('text');
  dialog = await openDialog('text-create', 'texts.create');
  await dialog.getByLabel(t('texts.filename'), { exact: true }).fill('created');
  await dialog.getByLabel(t('texts.body'), { exact: true }).fill('before');
  await apply(dialog);
  await select('created.txt');
  dialog = await openDialog('text-edit', 'texts.edit');
  await dialog.getByLabel(t('texts.body'), { exact: true }).fill('after');
  await apply(dialog);
  assert.equal(fs.readFileSync(path.join(external, 'created.txt'), 'utf8'), 'after');
  dialog = await openDialog('delete-image', 'images.deleteImages');
  await apply(dialog, t('common.delete'));
  await open('sound');
  assert.equal((await model()).content.canWrite, true, 'source access is shared by media');
  await session.resize(900, 620);
  await session.save({ host: { theme: 'dark' } });
  // Open the same trusted dialog while narrow navigation is collapsed.
  dialog = await openDialog('source-edit', 'library.sources.edit');
  await page.screenshot({ path: path.join(profile, 'source-access-narrow-dark.png') });
  await dialog.getByLabel(t('library.sources.access'), { exact: true }).selectOption('read-only');
  await apply(dialog, 'OK');
  for (const media of ['image', 'sound', 'text']) {
    await open(media);
    assert.equal((await model()).content.canWrite, false);
    assert.equal((await model()).content.sources[0].id, source.id);
  }
  await session.resize(1720, 1000);
  await session.save({ host: { theme: 'light' } });
  return { session, page };
};
