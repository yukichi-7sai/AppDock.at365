const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launch, until, hash } = require('./page-test-host.cjs');
const { wave } = require('./sound-library-fixture.cjs');
const root = path.resolve(__dirname, '..');
const portable = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
const profile = fs.mkdtempSync(path.join(root, '.artifacts/library-view-ui-'));
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.closeToTray = false;
settings.host.soundEnabled = false;
settings.globalShortcutCommands = [];
settings.gestures.enabled = false;
const sources = [];
for (const [media, folder, extension] of [
  ['image', 'images', 'svg'],
  ['sound', 'sounds', 'wav'],
  ['text', 'texts', 'txt'],
]) {
  const directory = path.join(profile, 'data/assets', folder);
  fs.mkdirSync(directory, { recursive: true });
  const refs = [10, 2, 1].map((n, i) => {
    const file = `sample${n}.${extension}`,
      target = path.join(directory, file);
    const bytes =
      media === 'image'
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="${n + 3}"/></svg>${' '.repeat(i * 10)}`
        : media === 'sound'
          ? wave((i + 1) * 1000)
          : `本文 ${n}\nリスト表示の抜粋`;
    fs.writeFileSync(target, bytes);
    fs.utimesSync(target, new Date(2026, 0, i + 1), new Date(2026, 0, i + 1));
    sources.push({ target, hash: hash(target) });
    return { file };
  });
  const key = media === 'image' ? 'images' : 'files';
  settings[`${media}Library`] = {
    groups: [
      { id: 'main', name: '選択グループ', [key]: refs },
      { id: 'keep', name: '残すグループ', [key]: [refs[0]] },
    ],
  };
}
fs.writeFileSync(require('./test-settings.cjs').file(profile), JSON.stringify(settings));
const checks = [],
  errors = [];
let session, page;
const model = () => page.evaluate(() => window.dock.pages.get());
const open = async (media) => {
  await page.evaluate(
    (media) => window.dock.executeCommand(`appdock.${media}-library.open`),
    media,
  );
  await until(async () => (await model())?.kind === `${media}-library`, 'library opened');
  await until(
    async () => (await page.locator('.library-page').getAttribute('data-media')) === media,
    'library rendered',
  );
  await page.locator('.ad-gallery').waitFor();
};
const action = (command, fields = {}) =>
  page.evaluate(
    async ({ command, fields }) => {
      const m = await window.dock.pages.get();
      return window.dock.pages.act({ id: m.id, type: 'gallery', command, ...fields });
    },
    { command, fields },
  );
const renderedTitles = () => page.locator('.ad-gallery-title').allTextContents();
const waitView = (mode, sort) =>
  until(async () => {
    const c = (await model()).content;
    return (
      c.view.mode === mode &&
      (!sort || c.view.sort === sort) &&
      (await page.locator('.ad-gallery').getAttribute('data-view')) === mode
    );
  }, 'view rendered');
const groupImages = async (media) =>
  (await page.evaluate(() => window.dock.snapshot())).settings.value[`${media}Library`].groups;
async function start() {
  session = await launch(profile, portable);
  page = session.main;
  page.on('pageerror', (e) => errors.push(String(e)));
  await session.app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().startsWith('appdock://host/'),
    );
    w.setMinimumSize(320, 480);
    w.setSize(1380, 900);
    w.show();
    w.focus();
  });
}
(async () => {
  try {
    await start();
    for (const media of ['image', 'sound', 'text']) {
      await open(media);
      assert.equal((await model()).content.view.mode, 'cards', 'media view starts independently');
      const group = (await model()).content.groups.find((g) => g.title === '選択グループ');
      await action('group', { groupId: group.id });
      await page.getByRole('button', { name: 'すべて選択', exact: true }).click();
      await until(async () => (await model()).content.selected === 3, 'all selected');
      const before = await groupImages(media);
      await page.getByRole('button', { name: 'リスト', exact: true }).click();
      await waitView('list');
      assert.equal((await model()).content.selected, 3);
      await page.getByLabel('並び順', { exact: true }).selectOption('name');
      await waitView('list', 'name');
      await until(
        async () => /sample1\./.test((await renderedTitles())[0]),
        'natural name order rendered',
      );
      assert.match((await renderedTitles())[1], /sample2\./);
      await page.getByRole('button', { name: '昇順', exact: true }).click();
      await until(
        async () => /sample10\./.test((await renderedTitles())[0]),
        'descending order rendered',
      );
      await page.getByLabel('並び順', { exact: true }).selectOption('modified');
      await waitView('list', 'modified');
      await until(
        async () => /sample1\./.test((await renderedTitles())[0]),
        'file modified time order',
      );
      assert.deepEqual(await groupImages(media), before, 'sorting never writes group order');
      await page.getByRole('button', { name: 'カード', exact: true }).click();
      await waitView('cards');
      assert.equal((await model()).content.selected, 3);
      await page.getByRole('button', { name: 'リスト', exact: true }).click();
      await waitView('list');
      await page.getByRole('button', { name: '選択を解除', exact: true }).click();
      await until(async () => (await model()).content.selected === 0, 'selection cleared');
      await page.locator('.ad-gallery-title').first().click();
      await until(async () => (await model()).content.selected === 1, 'row body selects');
      if (media === 'text') {
        await page.keyboard.press('Enter');
        const preview = page.getByRole('dialog');
        await preview.waitFor();
        assert.match(await preview.innerText(), /本文/);
        await page.keyboard.press('Escape');
        await preview.waitFor({ state: 'hidden' });
        await page.getByLabel('並び順', { exact: true }).selectOption('manual');
        await waitView('list', 'manual');
        await until(
          async () => /sample10\./.test((await renderedTitles())[0]),
          'saved order restored',
        );
        await page.getByRole('button', { name: '選択を解除', exact: true }).click();
        await until(
          async () => (await page.locator('.ad-gallery-check:checked').count()) === 0,
          'selection clear rendered',
        );
        const rows = page.locator('.ad-gallery-card');
        const from = await rows.first().locator('.ad-gallery-image').boundingBox();
        const to = await rows.last().boundingBox();
        await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
        await page.mouse.down();
        await page.mouse.move(to.x + to.width / 2, to.y + to.height - 5, { steps: 10 });
        const line = page.getByTestId('gallery-insertion');
        await line.waitFor();
        const lineBox = await line.boundingBox();
        assert(lineBox.width > lineBox.height, 'list insertion marks the row boundary');
        await page.mouse.up();
        await until(
          async () => (await groupImages('text'))[0].files.at(-1).file === 'sample10.txt',
          'list reorder saved',
        );
        await page.getByLabel('並び順', { exact: true }).selectOption('modified');
        await waitView('list', 'modified');
        checks.push('manual list drag orders rows vertically and keeps other memberships');
      }
      await page.screenshot({ path: path.join(profile, `${media}-list.png`) });
      checks.push(
        `${media}: list/card selection, row activation, natural/modified sorting, original order`,
      );
    }
    await open('image');
    await action('group', {
      groupId: (await model()).content.groups.find((g) => g.title === '選択グループ').id,
    });
    const search = page.getByRole('searchbox', { name: 'ファイル名で検索', exact: true });
    await search.focus();
    const cards = page.locator('.ad-gallery-card');
    const first = await cards.first().boundingBox(),
      second = await cards.nth(1).boundingBox();
    await page.mouse.move(first.x - 3, first.y + 2);
    await page.mouse.down();
    await page.mouse.move(second.x + second.width - 4, second.y + second.height - 2, { steps: 10 });
    await page.mouse.up();
    await until(async () => (await model()).content.selected === 2, 'list marquee');
    await until(
      async () => (await page.locator('.ad-gallery-check:checked').count()) === 2,
      'marquee selection rendered',
    );
    await page.keyboard.press('Delete');
    const deletion = page.getByRole('dialog', { name: '画像を削除', exact: true });
    await deletion.waitFor();
    await deletion.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await deletion.waitFor({ state: 'hidden' });
    assert.equal((await model()).content.selected, 2);
    await page.locator('.ad-gallery-check').first().focus();
    await page.keyboard.press('Delete');
    await deletion.waitFor();
    await deletion.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await deletion.waitFor({ state: 'hidden' });
    await search.focus();
    await page.keyboard.press('Delete');
    assert.equal(await page.getByRole('dialog').count(), 0);
    checks.push(
      'list marquee Delete opens confirmation without a card click; search retains text editing',
    );
    await page.getByRole('button', { name: 'すべて選択', exact: true }).click();
    await until(async () => (await model()).content.selected === 3, 'three selected for drop');
    const source = await cards.first().locator('.ad-gallery-image').boundingBox();
    await page.mouse.move(source.x + 16, source.y + 16);
    await page.mouse.down();
    await page.mouse.move(source.x + 35, source.y + 24, { steps: 4 });
    const target = page.locator('.library-remove-drop');
    await target.waitFor({ state: 'visible' });
    assert.match(await target.innerText(), /3件.*選択グループ/);
    assert.equal(
      await page.getByTestId('gallery-insertion').count(),
      0,
      'sorted view has no manual insertion',
    );
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await target.waitFor({ state: 'hidden' });
    assert.equal((await groupImages('image'))[0].images.length, 3, 'Escape cancels removal');
    await page.mouse.move(source.x + 16, source.y + 16);
    await page.mouse.down();
    await page.mouse.move(source.x + 35, source.y + 24, { steps: 4 });
    await target.waitFor({ state: 'visible' });
    const destination = await target.boundingBox();
    await page.mouse.move(
      destination.x + destination.width / 2,
      destination.y + destination.height / 2,
      { steps: 10 },
    );
    await until(
      async () => (await target.getAttribute('data-gallery-drop')) === 'true',
      'remove target highlighted',
    );
    await page.screenshot({ path: path.join(profile, 'group-remove-drop.png') });
    await page.mouse.up();
    await until(
      async () => (await groupImages('image'))[0].images.length === 0,
      'drop removes membership',
    );
    assert.equal((await groupImages('image'))[1].images.length, 1);
    for (const source of sources)
      assert.equal(hash(source.target), source.hash, 'original file retained');
    checks.push(
      'drop cancellation, all selected memberships removed, other group and bytes retained',
    );
    await open('sound');
    await page.getByRole('button', { name: 'このグループから外す', exact: true }).click();
    await until(
      async () => (await groupImages('sound'))[0].files.length === 2,
      'toolbar uses same removal',
    );
    await session.save({ host: { theme: 'dark' } });
    await session.resize(620, 740);
    await page.screenshot({ path: path.join(profile, 'sound-list-narrow-dark.png') });
    const overflow = await page
      .locator('.library-content')
      .evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    assert.equal(overflow, false, 'narrow list has no clipped horizontal controls');
    const savedViews = {};
    for (const media of ['image', 'sound', 'text']) {
      await open(media);
      savedViews[media] = (await model()).content.view;
    }
    await session.close();
    session = undefined;
    await start();
    for (const media of ['image', 'sound', 'text']) {
      await open(media);
      assert.deepEqual((await model()).content.view, savedViews[media]);
    }
    checks.push(
      'toolbar removal, narrow dark layout and actual process restart retain each media view',
    );
    assert.deepEqual(errors, []);
    await session.close();
    session = undefined;
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify(
        { ok: true, checks, errors, exe: portable, sha256: portable && hash(portable) },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ ok: true, profile, checks }));
  } catch (error) {
    await page?.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify({ ok: false, error: String(error.stack || error), checks, errors }, null, 2),
    );
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (session)
      await session.close().catch((error) => {
        console.error(error);
        process.exitCode = 1;
      });
  }
})();
