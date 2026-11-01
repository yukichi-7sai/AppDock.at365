const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

module.exports = async ({
  host,
  app,
  page,
  directory,
  profile,
  model,
  library,
  until,
  resize,
  original,
}) => {
  const act = (command, fields = {}) =>
    host.evaluate(
      async ({ command, fields }) => {
        const m = await window.dock.pages.get();
        return window.dock.pages.act({ id: m.id, type: 'gallery', command, ...fields });
      },
      { command, fields },
    );
  const exactTarget = (name) =>
    page
      .locator('[data-gallery-folder]')
      .and(page.locator('[title="' + (name || '画像ライブラリー直下') + '"]'));
  const card = (file) =>
    page.locator('.ad-gallery-card').filter({
      has: host.getByRole('button', { name: file + 'を選択', exact: true }),
    });
  const originals = ['Lucide Icon/icon-003.svg', 'Lucide Icon/icon-004.svg'];
  await host.evaluate(async (files) => {
    const s = await window.dock.snapshot();
    for (let i = 0; i < 4; i++)
      s.settings.value.imageLibrary.groups.push({
        id: 'drag-groups-' + i,
        name: 'ドラッグ検証の長いグループ名 ' + (i + 1),
        images: files.map((file) => ({ file })),
      });
    await window.dock.saveSettings(s.settings.value, s.settings.revision);
  }, originals);
  await act('query', { value: 'icon-00' });
  await until(
    async () => (await model()).content.items.some((i) => i.title === originals[0]),
    'drag source ready',
  );
  await card(originals[0]).locator('.ad-gallery-image').click();
  await card(originals[1])
    .locator('.ad-gallery-image')
    .click({ modifiers: ['Control'] });
  await until(async () => (await model()).content.selected === 2, 'drag selection');
  assert.equal(await card(originals[0]).locator('.ad-gallery-actions button').count(), 0);
  assert.equal(await card(originals[0]).locator('.ad-gallery-tag').count(), 4);
  const labels = await card(originals[0]).locator('.ad-gallery-labels').boundingBox();
  assert(labels.height >= 66, 'expanded group labels are readable');
  const rootX = (await exactTarget('').boundingBox()).x;
  assert(
    Math.abs(rootX - (await exactTarget('Lucide Icon').boundingBox()).x) < 1,
    'root and top-level folders align',
  );
  const dragTo = async (file, element, release = true) => {
    await element.scrollIntoViewIfNeeded();
    const source = card(file).locator('.ad-gallery-image');
    await source.scrollIntoViewIfNeeded();
    const a = await source.boundingBox(),
      b = await element.boundingBox();
    await host.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await host.mouse.down();
    await host.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
    await host.getByTestId('gallery-drag-card').waitFor();
    if (release) await host.mouse.up();
  };
  await page.getByRole('button', { name: '移動先を折りたたむ', exact: true }).click();
  const gridTop = (await page.locator('.library-grid-pad').boundingBox()).y;
  await dragTo(originals[0], exactTarget('移動先'), false);
  await until(
    async () =>
      (await host.getByTestId('gallery-drag-count').innerText()).includes('2枚を「移動先」へ移動'),
    'drop intent',
  );
  await exactTarget('移動先/子').waitFor({ state: 'visible' });
  const child = await exactTarget('移動先/子').boundingBox();
  await host.mouse.move(child.x + child.width / 2, child.y + child.height / 2, { steps: 6 });
  await host.mouse.up();
  const moved = originals.map((file) => '移動先/子/' + path.basename(file));
  await until(
    () => moved.every((file) => fs.existsSync(path.join(directory, file))),
    'drop moved files',
  );
  await until(async () => !(await model()).content.busy, 'move finished');
  assert(originals.every((file) => !fs.existsSync(path.join(directory, file))));
  assert.equal((await model()).content.folder, '*');
  assert.equal((await model()).content.query, 'icon-00');
  assert.equal((await model()).content.selected, 2);
  const membership = (await library()).groups.filter((g) => g.id.startsWith('drag-groups-'));
  assert(membership.every((g) => g.images.every((ref) => moved.includes(ref.file))));
  for (const file of moved) assert(fs.readFileSync(path.join(directory, file)).equals(original));
  const status = page.locator('.library-status');
  await until(async () => (await status.innerText()).includes('移動しました'), 'move feedback');
  assert(
    Math.abs((await page.locator('.library-grid-pad').boundingBox()).y - gridTop) < 1,
    'feedback keeps layout',
  );
  const notice = await status.boundingBox(),
    content = await page.locator('.library-content').boundingBox();
  assert(
    Math.abs(notice.x + notice.width / 2 - content.x - content.width / 2) < 2,
    'feedback centered',
  );
  await page.screenshot({ path: path.join(profile, 'folder-drop-toast.png') });

  // Exercise copy feedback without reading or changing the Windows clipboard.
  await app.evaluate(({ clipboard }) => {
    global.__dropCopyOriginal = clipboard.writeText;
    global.__dropCopyCalls = [];
    clipboard.writeText = async (text) => {
      global.__dropCopyCalls.push(text);
    };
  });
  try {
    const copy = async () => {
      await card(moved[0]).click({ button: 'right' });
      const before = await page.locator('.library-scroll').evaluate((el) => ({
        top: el.scrollTop,
        grid: el.querySelector('.library-grid-pad').offsetTop,
        height: el.scrollHeight,
      }));
      await host.getByRole('menuitem', { name: 'パスをコピー', exact: true }).click();
      await until(async () => (await status.innerText()).includes('コピーしました'), 'copy toast');
      const after = await page.locator('.library-scroll').evaluate((el) => ({
        top: el.scrollTop,
        grid: el.querySelector('.library-grid-pad').offsetTop,
        height: el.scrollHeight,
      }));
      assert.deepEqual(after, before, 'copy feedback keeps layout and scroll position');
    };
    await copy();
    await status.waitFor({ state: 'hidden', timeout: 6500 });
    await copy();
    assert.equal((await app.evaluate(() => global.__dropCopyCalls)).length, 2);
  } finally {
    await app.evaluate(({ clipboard }) => {
      clipboard.writeText = global.__dropCopyOriginal;
      delete global.__dropCopyOriginal;
      delete global.__dropCopyCalls;
    });
  }
  const collision = path.join(directory, '素材/icon-003.svg');
  fs.writeFileSync(collision, original, { flag: 'wx' });
  try {
    await act('reload');
    await dragTo(moved[0], exactTarget('素材'));
    await until(async () => !!(await model()).content.error, 'collision reported');
    assert(moved.every((file) => fs.existsSync(path.join(directory, file))));
    assert(fs.readFileSync(collision).equals(original));
    assert(!fs.existsSync(path.join(directory, '素材/icon-004.svg')));
  } finally {
    assert(fs.readFileSync(collision).equals(original));
    fs.unlinkSync(collision);
  }
  await act('reload');
  await dragTo(moved[0], exactTarget(''));
  const atRoot = moved.map((file) => path.basename(file));
  await until(() => atRoot.every((file) => fs.existsSync(path.join(directory, file))), 'root drop');
  await until(async () => !(await model()).content.busy, 'root move finished');
  await dragTo(atRoot[0], exactTarget('移動先'), false);
  await host.keyboard.press('Escape');
  await host.mouse.up();
  await host.getByTestId('gallery-drag-card').waitFor({ state: 'hidden' });
  assert(
    atRoot.every((file) => fs.existsSync(path.join(directory, file))),
    'Escape leaves originals',
  );

  await act('width', { value: 120, commit: true });
  await resize(640, 800);
  await until(
    async () => (await page.getAttribute('data-narrow')) === 'true',
    'narrow drag layout',
  );
  await dragTo(
    atRoot[0],
    page.getByRole('button', { name: 'フォルダーとグループ', exact: true }),
    false,
  );
  await host.locator('.library-sidebar:popover-open').waitFor();
  const narrowTarget = await exactTarget('素材').boundingBox();
  await host.mouse.move(
    narrowTarget.x + narrowTarget.width / 2,
    narrowTarget.y + narrowTarget.height / 2,
    { steps: 6 },
  );
  await host.mouse.up();
  await until(
    () => atRoot.every((file) => fs.existsSync(path.join(directory, '素材', file))),
    'narrow folder drop',
  );
  await until(async () => !(await model()).content.busy, 'narrow move and catalogue committed');
  await resize(1360, 950);
  await until(async () => (await page.getAttribute('data-narrow')) === 'false', 'wide restored');
  await act('width', { value: 260, commit: true });
  await act('query', { value: '' });
  await until(async () => (await model()).content.total === 199, 'drag count preserved');
  return 'folder drag: selected batch, root peers, hover expansion, group/bytes retention, collision refusal, Escape and narrow drawer; overlay copy feedback never moves layout (clipboard stub)';
};
