const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async function labelChecks(context) {
  let { host, rail } = context;
  const { checks, until, saved, openRibbonSettings, restart, profile } = context;
  const button = (id) => rail.locator(`[data-ribbon-id="${id}"]`);
  const toggle = () => button('ribbon-display-mode');
  const choice = (page) =>
    page
      .getByTestId('ribbon-icon-only')
      .getByRole('switch', { name: 'リボンにアイコンのみを表示する', exact: true });
  const checked = async (page) => (await choice(page).getAttribute('aria-checked')) === 'true';
  const setChoice = async (page, value) => {
    if ((await checked(page)) !== value) await choice(page).click();
  };
  const label = async (id, visible) =>
    until(
      async () => (await button(id).locator('.rail-label').isVisible()) === visible,
      `${id} label ${visible}`,
    );
  await toggle().click();
  await until(
    () =>
      rail
        .locator('aside')
        .getAttribute('data-display-mode')
        .then((m) => m === 'expanded'),
    'expanded',
  );
  await label('ribbon-display-mode', true);
  const initialName = await toggle().getAttribute('aria-label');
  await toggle().click();
  assert.equal(await toggle().getAttribute('aria-label'), initialName);
  await toggle().click();
  let page = await openRibbonSettings();
  const edit = async (id) => {
    await page
      .locator(`[data-ribbon-setting="${id}"]`)
      .getByRole('button', { name: /を編集$/ })
      .click();
  };
  const apply = () => page.getByRole('button', { name: '適用', exact: true }).click();
  await edit('ribbon-display-mode');
  await page.getByLabel('ボタン名', { exact: true }).fill('Mode fixture');
  await setChoice(page, true);
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click();
  await label('ribbon-display-mode', true);
  assert.equal(await toggle().getAttribute('aria-label'), initialName);
  await edit('ribbon-display-mode');
  assert(!(await checked(page)));
  await page.getByLabel('ボタン名', { exact: true }).fill('Mode fixture');
  await setChoice(page, true);
  await apply();
  await saved((r) => r.itemOverrides['ribbon-display-mode']?.iconOnly === true);
  await label('ribbon-display-mode', false);
  assert.equal(await toggle().getAttribute('aria-label'), 'Mode fixture');
  assert.match(await toggle().getAttribute('title'), /Mode fixture/);
  await toggle().click();
  await toggle().click();
  await label('ribbon-display-mode', false);
  await edit('ribbon-display-mode');
  assert(await checked(page));
  await setChoice(page, false);
  await apply();
  await label('ribbon-display-mode', true);
  assert.equal(await toggle().locator('.rail-label').innerText(), 'Mode fixture');
  checks.push(
    'mode button keeps its configured name in both modes; cancel/apply, icon-only on/off, tooltip and accessible name',
  );

  for (const [id, target] of [
    ['logs', 'item'],
    ['button:icon', 'command'],
    ['group:colored', 'group'],
  ]) {
    await edit(id);
    await setChoice(page, true);
    await page
      .getByRole('dialog')
      .screenshot({ path: path.join(profile, `${target}-icon-only-field.png`) });
    await apply();
    await saved((r) =>
      target === 'item'
        ? r.itemOverrides.logs?.iconOnly === true
        : target === 'command'
          ? r.buttons.find((b) => b.id === id)?.iconOnly === true
          : r.groups.find((g) => g.id === id)?.iconOnly === true,
    );
    await label(id, false);
    assert(await button(id).getAttribute('aria-label'));
  }
  await button('group:colored').click();
  await label('image-library', true);
  await edit('image-library');
  await setChoice(page, true);
  await apply();
  await label('image-library', false);
  await edit('ribbon-display-mode');
  await setChoice(page, true);
  await apply();
  await label('ribbon-display-mode', false);
  const heldWidth = await rail.addStyleTag({
    content: '.activity-rail { min-width: 200px !important; }',
  });
  await rail.evaluate(
    (ids) => {
      const samples = [];
      const shifts = [];
      const origins = [];
      const positions = Object.fromEntries(
        [...ids, 'settings', 'notifications'].map((id) => {
          const element = document.querySelector(`[data-ribbon-id="${id}"] > .ribbon-icon`);
          const rect = element.getBoundingClientRect();
          const root = document.querySelector('.activity-rail').getBoundingClientRect();
          return [id, { x: rect.x - root.x, y: rect.y - root.y }];
        }),
      );
      const sample = () => {
        const root = document.querySelector('.activity-rail').getBoundingClientRect();
        origins.push({
          x: root.x,
          y: root.y,
          scrollX,
          mode: document.querySelector('.activity-rail').dataset.displayMode,
          held: window.__ribbonLabelTrace?.held ?? true,
        });
        for (const id of ids) {
          const element = document.querySelector(`[data-ribbon-id="${id}"] .rail-label`);
          if (element && getComputedStyle(element).display !== 'none')
            samples.push({
              id,
              mode: document.querySelector('.activity-rail').dataset.displayMode,
              text: element.textContent,
            });
        }
        for (const [id, expected] of Object.entries(positions)) {
          const element = document.querySelector(`[data-ribbon-id="${id}"] > .ribbon-icon`);
          if (!element) continue;
          const rect = element.getBoundingClientRect();
          const root = document.querySelector('.activity-rail').getBoundingClientRect();
          if (
            Math.abs(rect.x - root.x - expected.x) > 0.25 ||
            Math.abs(rect.y - root.y - expected.y) > 0.25
          )
            shifts.push({
              id,
              x: rect.x,
              y: rect.y,
              rootX: root.x,
              rootY: root.y,
              scrollX,
              expected,
            });
        }
      };
      const observer = new MutationObserver(sample);
      observer.observe(document.querySelector('.activity-rail'), {
        subtree: true,
        childList: true,
        attributes: true,
      });
      const trace = (window.__ribbonLabelTrace = {
        samples,
        shifts,
        positions,
        origins,
        held: true,
        observer,
        sample,
        frame: 0,
      });
      const frame = () => {
        sample();
        trace.frame = requestAnimationFrame(frame);
      };
      trace.frame = requestAnimationFrame(frame);
      sample();
    },
    ['ribbon-display-mode', 'logs', 'button:icon', 'group:colored', 'image-library'],
  );
  for (let index = 0; index < 16; index++) {
    if (index === 8) {
      await heldWidth.evaluate((element) => element.remove());
      await rail.evaluate(() => {
        window.__ribbonLabelTrace.held = false;
      });
    }
    const before = await rail.locator('aside').getAttribute('data-display-mode');
    await toggle().click();
    await until(
      async () => (await rail.locator('aside').getAttribute('data-display-mode')) !== before,
      'mode transition',
    );
    await rail.evaluate(() => window.__ribbonLabelTrace.sample());
    assert.equal(
      await button('settings').locator('.rail-label').count(),
      1,
      'ordinary labels stay mounted until the viewport hides them',
    );
  }
  const trace = await rail.evaluate(() => {
    const trace = window.__ribbonLabelTrace;
    trace.observer.disconnect();
    cancelAnimationFrame(trace.frame);
    return {
      flashes: trace.samples,
      shifts: trace.shifts,
      positions: trace.positions,
      origins: trace.origins,
    };
  });
  require('node:fs').writeFileSync(
    path.join(profile, 'transition-trace.json'),
    JSON.stringify(trace, null, 2),
  );
  assert.deepEqual(
    trace.flashes,
    [],
    'individual icon-only labels must never reappear while the viewport is still wide',
  );
  assert.deepEqual(
    trace.shifts,
    [],
    'icons retain their positions during model and viewport transitions',
  );
  assert(
    trace.origins
      .filter((origin) => !origin.held)
      .every(
        (origin) =>
          Math.abs(origin.x) < 0.25 && Math.abs(origin.y) < 0.25 && Math.abs(origin.scrollX) < 0.25,
      ),
    'normal viewport transitions keep the whole ribbon anchored',
  );
  await edit('ribbon-display-mode');
  await setChoice(page, false);
  await apply();
  checks.push(
    'sixteen real transitions with held/normal viewport preserve icon positions and ordinary mounted labels, while never exposing individually hidden labels',
  );
  await edit('group:colored');
  await page.getByLabel('展開方法', { exact: true }).selectOption('temporary');
  await apply();
  await until(
    async () => (await button('group:colored').getAttribute('aria-haspopup')) === 'dialog',
    'temporary group rendered',
  );
  await button('group:colored').click();
  const popup = await until(async () => {
    for (const candidate of host.context().pages()) {
      if (!candidate.isClosed() && (await candidate.locator('.ribbon-flyout').count()))
        return candidate;
    }
  }, 'group popup');
  await popup.locator('[data-ribbon-id="image-library"]').waitFor();
  assert.equal(await popup.locator('[data-ribbon-id="image-library"] .rail-label').count(), 0);
  assert.equal(await popup.locator('[data-ribbon-parent="group:colored"] .rail-label').count(), 0);
  await popup.locator('[data-ribbon-parent="group:colored"]').click();
  checks.push(
    'normal/command/group settings save independently; persistent child and temporary popup parent/child honor icon-only',
  );

  ({ host, rail } = await restart());
  page = await openRibbonSettings();
  await label('ribbon-display-mode', true);
  for (const id of ['logs', 'button:icon', 'group:colored']) {
    await label(id, false);
    await edit(id);
    assert(await checked(page));
    await setChoice(page, false);
    await apply();
    await label(id, true);
  }
  await toggle().click();
  await label('logs', false);
  await toggle().click();
  await label('logs', true);
  await rail.screenshot({ path: path.join(profile, 'expanded-labels.png') });
  checks.push(
    'real restart restores saved choices and expanded mode; clearing each kind restores labels; compact mode still hides all labels',
  );
};
