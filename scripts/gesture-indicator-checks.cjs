const assert = require('node:assert/strict');
const path = require('node:path');
const { settleSettings } = require('./settings-immediate-helper.cjs');

module.exports = async ({ page, host, profile, checks }) => {
  const snapshot = () => host.evaluate(() => window.dock.snapshot());
  const save = () => settleSettings(page);
  const before = structuredClone((await snapshot()).settings.value.gestures);
  const options = page.locator('.gesture-settings-section');
  if ((await options.getAttribute('open')) === null) await options.locator('summary').click();
  const position = options.getByLabel('表示位置', { exact: true });
  const design = options.getByLabel('デザイン', { exact: true });
  const opacity = options.getByLabel('不透明度', { exact: true });
  const preview = options.locator('[data-testid="gesture-indicator-preview"]');
  assert.equal(
    await preview.evaluate(
      (element) =>
        element.closest('.settings-field').querySelector('.settings-field-group').textContent,
    ),
    '待機表示',
  );
  assert.equal(
    await preview.evaluate(
      (element) =>
        element.closest('.settings-field').querySelector('.settings-field-label strong')
          .textContent,
    ),
    'プレビュー',
  );
  assert.equal(
    await preview.evaluate((element) =>
      element.closest('.settings-field').classList.contains('settings-field-wide'),
    ),
    false,
  );
  const designs = ['compact', 'pill', 'ring', 'classic'];
  assert.deepEqual(await design.locator('option').allTextContents(), [
    'コンパクトカード',
    'スリムピル',
    'リング',
    'クラシック',
  ]);
  assert.deepEqual(
    await design.locator('option').evaluateAll((items) => items.map((el) => el.value)),
    designs,
  );
  assert.equal(await design.inputValue(), 'compact');
  await position.selectOption('gesture-start');
  await opacity.fill('0.65');
  await opacity.press('Enter');
  await save();
  const checkPreview = async (style) => {
    assert.equal(await preview.getAttribute('data-style'), style);
    assert.equal(await preview.getAttribute('data-hidden'), 'false');
    assert.equal(
      await preview.locator('.gesture-preview-caption').textContent(),
      'ひとつ上のフォルダーへ',
    );
    assert.equal(await preview.locator('.gesture-preview-process').textContent(), 'explorer.exe');
    const rendered = await preview.evaluate((stage) => {
      const indicator = stage.querySelector('.gesture-preview-indicator');
      const backdrop = stage.querySelector('.gesture-preview-ring-label') || indicator;
      const bounds = indicator.getBoundingClientRect();
      const viewport = stage.getBoundingClientRect();
      return {
        foregroundOpacity: Number(getComputedStyle(indicator).opacity),
        backgroundOpacity: Number(getComputedStyle(backdrop, '::before').opacity),
        arrows: stage.querySelectorAll('.gesture-preview-arrows svg').length,
        fits:
          bounds.left >= viewport.left - 1 &&
          bounds.right <= viewport.right + 1 &&
          bounds.top >= viewport.top - 1 &&
          bounds.bottom <= viewport.bottom + 1,
      };
    });
    assert.equal(rendered.foregroundOpacity, style === 'classic' ? 0.65 : 1);
    if (style !== 'classic') assert.equal(rendered.backgroundOpacity, 0.65);
    assert.equal(rendered.arrows, style === 'classic' ? 0 : 2);
    assert(rendered.fits, `${style} preview fits its visible stage`);
  };
  for (const indicatorStyle of designs) {
    await design.selectOption(indicatorStyle);
    await save();
    assert.equal((await snapshot()).settings.value.gestures.indicatorStyle, indicatorStyle);
    await checkPreview(indicatorStyle);
    await position.selectOption('none');
    await save();
    assert(await design.isDisabled());
    assert(await opacity.isDisabled());
    assert.equal(await preview.getAttribute('data-hidden'), 'true');
    assert.equal(await preview.locator('.gesture-preview-indicator').count(), 0);
    const hidden = (await snapshot()).settings.value.gestures;
    assert.equal(hidden.indicatorStyle, indicatorStyle);
    assert.equal(hidden.indicatorOpacity, 0.65);
    await position.selectOption('window-center');
    await save();
    assert(await design.isEnabled());
    assert(await opacity.isEnabled());
    assert.equal(await design.inputValue(), indicatorStyle);
    await checkPreview(indicatorStyle);
  }
  checks.push(
    'four localized indicator choices save / live sample titles and vector arrows / modern background-only opacity / classic whole opacity / each hidden design retains its settings',
  );
  for (const theme of ['dark', 'light']) {
    await host.evaluate(async (theme) => {
      const state = await window.dock.snapshot();
      state.settings.value.host.theme = theme;
      await window.dock.saveSettings(state.settings.value, state.settings.revision);
    }, theme);
    await page.waitForFunction((theme) => document.documentElement.dataset.theme === theme, theme);
    assert.equal((await snapshot()).settings.value.host.theme, theme);
    for (const width of [1280, 900, 700]) {
      await page.setViewportSize({ width, height: 900 });
      for (const indicatorStyle of designs) {
        await design.selectOption(indicatorStyle);
        await save();
        await checkPreview(indicatorStyle);
        assert(await options.evaluate((el) => el.scrollWidth <= el.clientWidth));
        assert(await page.locator('main').evaluate((el) => el.scrollWidth <= el.clientWidth));
        await preview.scrollIntoViewIfNeeded();
        if (width === 700 || indicatorStyle === 'classic') {
          await page.screenshot({
            path: path.join(profile, `${theme}-${width}-${indicatorStyle}-gesture-indicator.png`),
            fullPage: true,
          });
        }
      }
    }
  }
  checks.push(
    'actual host theme settings propagate to the preview / all four designs fit dark and light at 1280, 900 and 700 pixels',
  );
  await design.selectOption('ring');
  await position.selectOption('none');
  await save();
  const saved = (await snapshot()).settings.value.gestures;
  assert.deepEqual(saved, {
    ...before,
    indicatorStyle: 'ring',
    indicatorPosition: 'none',
    indicatorOpacity: 0.65,
  });
  checks.push(
    'only intended display settings changed; bindings and recognition settings retained for process-restart assertion',
  );
};
