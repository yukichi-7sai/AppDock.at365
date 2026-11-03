const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async ({ host, open, saved, row, checks, profile }) => {
  const baseline = await saved();
  await open();
  const list = host.getByTestId('command-triggers-list');
  const search = list.getByRole('searchbox');
  const category = list.getByRole('combobox', { name: 'カテゴリで絞り込み', exact: true });
  const status = list.getByRole('combobox', { name: 'トリガーの絞り込み', exact: true });
  const clear = list.getByRole('button', { name: '絞り込みを解除', exact: true });
  const chip = (kind) => list.locator(`[data-filter-kind="${kind}"]`);
  const provider = (id) => host.getByTestId(`command-provider:${id}`);
  const input = (kind, id) => row(kind, id).locator('.binding-input-filter');
  const commands = () =>
    list
      .locator('[data-shortcut-command]')
      .evaluateAll((elements) => elements.map((element) => element.dataset.shortcutCommand).sort());
  const one = 'fixture.triggers.one';
  const other = 'fixture.other.one';
  const both = [other, one];
  assert.equal(await provider('appdock.noop').locator('[data-icon="home"]').count(), 1);
  assert.equal(await provider(one).locator('[data-icon="clock"]').count(), 1);
  assert.equal(await provider(other).locator('[data-icon="extensions"]').count(), 1);
  checks.push(
    'table provider badges share the Applet icon and host/unspecified fallbacks with the active filter',
  );
  await search.fill('fixture');
  await category.selectOption('category:カテゴリ検証');
  await status.selectOption('assigned');
  await host.getByTestId('command-trigger-filter:touchpad-gestures').click();
  await input('shortcuts', 'filter-key-one').press('Enter');
  assert.deepEqual(await commands(), both);
  await provider(one).press('Space');
  assert.deepEqual(await commands(), [one]);
  assert.equal(await chip('provider').count(), 1);
  assert.equal(await chip('input').count(), 1);
  assert.equal(await chip('provider').locator('[data-icon="clock"]').count(), 1);
  assert.equal((await chip('provider').innerText()).trim(), 'Trigger fixture');
  await chip('input').getByRole('button').click();
  assert(
    await input('shortcuts', 'filter-key-one').evaluate(
      (element) => element === document.activeElement,
    ),
  );
  assert.equal(await chip('provider').count(), 1);
  await input('shortcuts', 'filter-key-one').click();
  await input('gestures', 'filter-mouse-one').click();
  assert.equal(await chip('input').count(), 1);
  assert((await chip('input').innerText()).includes('移動: 上'));
  assert.equal(await chip('provider').count(), 1);
  assert.equal(await search.inputValue(), 'fixture');
  assert.equal(await category.inputValue(), 'category:カテゴリ検証');
  assert.equal(await status.inputValue(), 'assigned');
  await host.screenshot({ path: path.join(profile, 'combined-filters-normal.png') });
  assert.equal(
    await host.getByTestId('command-trigger-filter:touchpad-gestures').getAttribute('aria-pressed'),
    'false',
  );
  await host.getByTestId('command-trigger-filter:touchpad-gestures').click();
  await input('touchpad-gestures', 'filter-touch-one').click();
  assert.equal(await chip('input').count(), 1);
  assert((await chip('input').innerText()).includes('4本指'));
  await chip('provider').getByRole('button').click();
  assert(await provider(one).evaluate((element) => element === document.activeElement));
  assert.deepEqual(await commands(), both);
  assert.equal(await chip('input').count(), 1);
  await provider(other).click();
  await provider(other).press('Enter');
  assert.deepEqual(await commands(), [other]);
  assert.equal(await chip('provider').count(), 1);
  assert.equal(await chip('provider').locator('[data-icon="extensions"]').count(), 1);
  checks.push(
    'provider and all three input kinds combine, replace only their own slot and restore separate focus targets while search/category/status/kinds survive',
  );

  await search.fill('no-matching-command');
  assert.deepEqual(await commands(), []);
  assert.equal(await list.getByTestId('command-provider-filter').count(), 2);
  await chip('input').getByRole('button').click();
  assert(await search.evaluate((element) => element === document.activeElement));
  assert.equal(await chip('provider').count(), 1);
  assert.equal(await search.inputValue(), 'no-matching-command');
  await search.fill('fixture');
  await input('shortcuts', 'other-input').click();
  assert.deepEqual(await commands(), [other]);
  assert.deepEqual(
    await saved(),
    baseline,
    'all filter operations leave settings and disabled Applets unchanged',
  );

  const measurements = [];
  const viewport = host.viewportSize();
  // Viewport dimensions are logical pixels after OS DPI scaling; do not add CSS zoom.
  for (const [theme, width, height] of [
    ['dark', 1720, 1000],
    ['light', 900, 620],
  ]) {
    await host.evaluate(async (theme) => {
      const current = await window.dock.snapshot();
      current.settings.value.host.theme = theme;
      await window.dock.saveSettings(current.settings.value, current.settings.revision);
    }, theme);
    await host.setViewportSize({ width, height });
    await chip('provider').scrollIntoViewIfNeeded();
    for (const kind of ['provider', 'input'])
      await chip(kind).getByRole('button').click({ trial: true });
    measurements.push({
      theme,
      width,
      height,
      chips: await list.getByTestId('command-provider-filter').evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          const close = element.querySelector('button').getBoundingClientRect();
          const icon = element.querySelector('svg').getBoundingClientRect();
          return {
            kind: element.dataset.filterKind,
            height: rect.height,
            closeWidth: close.width,
            closeHeight: close.height,
            iconCenter: icon.y + icon.height / 2,
            closeCenter: close.y + close.height / 2,
          };
        }),
      ),
    });
    await host.screenshot({ path: path.join(profile, `combined-filters-${theme}.png`) });
    await provider(other).scrollIntoViewIfNeeded();
    await host.screenshot({ path: path.join(profile, `table-provider-${theme}.png`) });
  }
  fs.writeFileSync(
    path.join(profile, 'combined-filter-layout.json'),
    JSON.stringify(measurements, null, 2),
  );
  await host.evaluate(async (value) => {
    const current = await window.dock.snapshot();
    await window.dock.saveSettings(value, current.settings.revision);
  }, baseline);
  if (viewport) await host.setViewportSize(viewport);
  await clear.click();
  assert.equal(await list.getByTestId('command-provider-filter').count(), 0);
  assert.equal(await search.inputValue(), '');
  assert.equal(await category.inputValue(), 'all');
  assert.equal(await status.inputValue(), 'all');
  assert.deepEqual(await saved(), baseline);
  checks.push(
    'empty intersections retain independent chips; long provider names and clears remain usable at logical 900x620 and 1720x1000 in light/dark themes; clear all restores defaults',
  );
  await open('applets');
  await host
    .locator('[data-applet-id="fixture.triggers"]')
    .getByRole('button', { name: /のコマンドトリガーを開く$/ })
    .click();
  await list.waitFor();
  await chip('provider').waitFor();
  await search.fill('fixture');
  await input('shortcuts', 'filter-key-one').click();
  assert.deepEqual(await commands(), [one]);
  await provider(one).click();
  await chip('provider').getByRole('button').click();
  await host.waitForFunction(() => !document.querySelector('[data-filter-kind="provider"]'));
  assert.equal(await chip('input').count(), 1);
  assert.equal(await search.inputValue(), 'fixture');
  assert.deepEqual(await commands(), both);
  await clear.click();
  assert.deepEqual(await saved(), baseline);
  checks.push(
    'Applet management navigation targets can be replaced and cleared without losing the input or search filter',
  );
};
