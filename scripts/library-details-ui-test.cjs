const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launch, until, hash } = require('./page-test-host.cjs');
const { wave } = require('./sound-library-fixture.cjs');
const root = path.resolve(__dirname, '..');
const portable = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
const profile = fs.mkdtempSync(path.join(root, '.artifacts/library-details-ui-'));
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.closeToTray = false;
settings.host.soundEnabled = false;
settings.host.showHints = false;
settings.globalShortcutCommands = [];
settings.gestures.enabled = false;
const groups = [
  '最初のグループ',
  '省略された <b>グループ</b>',
  ...Array.from({ length: 22 }, (_, i) => `長い所属グループ ${i + 1}：${'分類名'.repeat(12)}`),
];
const originals = [];
for (const [media, folder, extension] of [
  ['image', 'images', 'svg'],
  ['sound', 'sounds', 'wav'],
  ['text', 'texts', 'txt'],
]) {
  const directory = path.join(profile, 'data/assets', folder);
  fs.mkdirSync(directory, { recursive: true });
  const refs = [1, 2, 3].map((n) => {
    const target = path.join(directory, `sample${n}.${extension}`);
    const value =
      media === 'image'
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="${n * 24}" height="${n * 12}"><rect width="10" height="10"/></svg>${' '.repeat(n === 3 ? 1024 * 1024 : n * 1000)}`
        : media === 'sound'
          ? wave(n * 1000)
          : n === 1
            ? ''
            : `文字数と容量の表示\n${'本文'.repeat(n * 500)}`;
    fs.writeFileSync(target, value);
    originals.push({ target, hash: hash(target) });
    return { file: path.basename(target) };
  });
  const key = media === 'image' ? 'images' : 'files';
  settings[`${media}Library`] = {
    groups: groups.map((name, i) => ({ id: `g${i}`, name, [key]: i === 0 ? refs : [refs[0]] })),
  };
}
fs.writeFileSync(require('./test-settings.cjs').file(profile), JSON.stringify(settings));
let session, page;
const checks = [],
  errors = [];
const model = () => page.evaluate(() => window.dock.pages.get());
const action = (command, fields) =>
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
  await page.locator(`.library-page[data-media="${media}"] .ad-gallery-card`).first().waitFor();
  await until(async () => (await model())?.content.items.length === 3, 'three assets');
};
const list = async () => {
  await page.getByRole('button', { name: 'リスト', exact: true }).click();
  await page.locator('.ad-gallery[data-view="list"]').waitFor();
};
const first = () => page.locator('.ad-gallery-card').first();
const popup = () => page.locator('.ad-gallery-group-popover:popover-open');
async function aligned() {
  const columns = await page.locator('.ad-gallery-card').evaluateAll((rows) =>
    rows.map((row) =>
      Object.fromEntries(
        ['format', 'measurement', 'size'].map((key) => {
          const r = row.querySelector(`.ad-gallery-meta-${key}`).getBoundingClientRect();
          return [key, { left: r.left, right: r.right }];
        }),
      ),
    ),
  );
  for (const row of columns.slice(1))
    for (const key of ['format', 'measurement', 'size']) {
      assert(Math.abs(row[key].left - columns[0][key].left) < 1, `${key} starts consistently`);
      assert(Math.abs(row[key].right - columns[0][key].right) < 1, `${key} ends consistently`);
    }
}
(async () => {
  try {
    session = await launch(profile, portable);
    page = session.main;
    page.on('pageerror', (error) => errors.push(String(error)));
    await session.resize(1720, 1000);
    for (const media of ['image', 'sound', 'text']) {
      await open(media);
      await action('width', { value: 280, commit: true });
      await until(
        async () => (await page.locator('.ad-gallery').getAttribute('data-card-size')) === 'true',
        'wide cards',
      );
      if (media !== 'image') {
        await until(
          async () =>
            (await first().locator('.ad-gallery-card-size').innerText()).includes(
              media === 'text' ? '0 B' : 'KB',
            ),
          'card capacity',
        );
        const heights = await page.locator('.ad-gallery-card').evaluateAll((cards) =>
          cards.map((card) => {
            const size = card.querySelector('.ad-gallery-card-size');
            const before = card.getBoundingClientRect().height;
            size.style.display = 'none';
            const without = card.getBoundingClientRect().height;
            size.style.removeProperty('display');
            return { before, without, after: card.getBoundingClientRect().height };
          }),
        );
        for (const h of heights) {
          assert(Math.abs(h.before - h.without) < 1);
          assert(Math.abs(h.before - h.after) < 1);
        }
        await page.screenshot({ path: path.join(profile, `${media}-cards.png`) });
        await action('width', { value: 160, commit: true });
        await until(
          async () => first().locator('.ad-gallery-card-size').isHidden(),
          'small cards omit capacity',
        );
      }
      await list();
      await until(
        async () => (await first().locator('.ad-gallery-meta-measurement').innerText()) !== '—',
        'measurements loaded',
      );
      await aligned();
      if (media === 'image') {
        assert.equal(await first().locator('.ad-gallery-meta-measurement').innerText(), '24 × 12');
        assert.match(
          await page
            .locator('.ad-gallery-card')
            .last()
            .locator('.ad-gallery-meta-size')
            .innerText(),
          /MB/,
        );
      }
      if (media === 'text')
        assert.equal(await first().locator('.ad-gallery-meta-size').innerText(), '0 B');
      await page.screenshot({ path: path.join(profile, `${media}-list.png`) });
      const label = first().locator('.ad-gallery-group-hint');
      await label.locator('.ad-gallery-tag').last().hover();
      await popup().waitFor();
      assert.deepEqual(await popup().locator('li').allTextContents(), groups);
      assert.equal(await popup().locator('b').count(), 0, 'group names remain plain text');
      assert.equal(await label.getAttribute('title'), '', 'native tooltip suppressed');
      await page.keyboard.press('Escape');
      await popup().waitFor({ state: 'hidden' });
      checks.push(`${media}: metadata, aligned columns and all memberships from the omitted label`);
    }
    await open('image');
    const label = first().locator('.ad-gallery-group-hint');
    await label.locator('.ad-gallery-tag').first().hover();
    await popup().waitFor();
    await popup().locator('li').first().hover();
    assert(await popup().isVisible(), 'pointer may enter help');
    assert(
      await popup().evaluate((p) => p.scrollHeight > p.clientHeight),
      'long memberships scroll',
    );
    await popup().evaluate((p) => {
      p.scrollTop = p.scrollHeight;
    });
    await until(async () => popup().evaluate((p) => p.scrollTop > 0), 'help scrolled');
    assert(await popup().isVisible(), 'internal scrolling retains help');
    await page.screenshot({ path: path.join(profile, 'group-help-light.png') });
    await page.keyboard.press('Escape');
    await popup().waitFor({ state: 'hidden' });
    await label.focus();
    await popup().waitFor();
    const selection = (await model()).content.selected;
    await page.keyboard.press('Enter');
    await until(
      async () => popup().evaluate((p) => document.activeElement === p),
      'keyboard reads help',
    );
    assert.equal((await model()).content.selected, selection);
    await page.keyboard.press('Escape');
    await popup().waitFor({ state: 'hidden' });
    assert(
      await label.evaluate((p) => document.activeElement === p),
      'Escape restores group label focus',
    );
    await label.click();
    await popup().waitFor();
    await page.getByRole('searchbox').click();
    await popup().waitFor({ state: 'hidden' });
    await label.hover();
    await popup().waitFor();
    const thumb = await first().locator('.ad-gallery-image').boundingBox();
    await page.mouse.move(thumb.x + 10, thumb.y + 10);
    await page.mouse.down();
    await page.mouse.move(thumb.x + 30, thumb.y + 40, { steps: 8 });
    await page.getByTestId('gallery-drag-card').waitFor();
    await popup().waitFor({ state: 'hidden' });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    checks.push(
      'help supports pointer transfer, long scrolling, keyboard/Escape, outside click and drag suppression',
    );
    await session.save({ host: { theme: 'dark' } });
    await session.resize(900, 620);
    await aligned();
    await label.hover();
    await popup().waitFor();
    assert(
      await popup().evaluate((p) => {
        const r = p.getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
      }),
    );
    assert(
      await page.locator('.library-content').evaluate((p) => p.scrollWidth <= p.clientWidth + 1),
    );
    await page.screenshot({ path: path.join(profile, 'group-help-narrow-dark.png') });
    const oldHelp = await popup().getAttribute('id');
    await popup().locator('strong').hover();
    await open('sound');
    assert.equal(await page.locator(`#${oldHelp}`).count(), 0, 'old help is disposed');
    assert.equal(await popup().count(), 0, 'navigation removes the old help');
    await list();
    await page.screenshot({ path: path.join(profile, 'sound-narrow-dark.png') });
    for (const original of originals) assert.equal(hash(original.target), original.hash);
    assert.deepEqual(errors, []);
    checks.push(
      '900px dark layout stays within the window; navigation disposes help and asset bytes remain unchanged',
    );
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify(
        { ok: true, portable, sha256: portable ? hash(portable) : undefined, checks, errors },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ ok: true, profile, checks }));
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
  }
})();
