const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async ({ page, dialog, profile, name, stack = false }) => {
  const originalViewport = page.viewportSize();
  const title = await dialog.getByLabel('名前', { exact: true }).inputValue();
  for (const viewport of [
    { width: 1320, height: 1050 },
    { width: 900, height: 640 },
    { width: 520, height: 640 },
    { width: 360, height: 650 },
  ]) {
    await page.setViewportSize(viewport);
    const commonSwitch = dialog.getByTestId('custom-command-section:common');
    const narrow = await commonSwitch.isVisible();
    if (narrow) {
      await commonSwitch.click();
      assert(await dialog.locator('.custom-command-action').isHidden());
      assert.equal(await dialog.getByLabel('名前', { exact: true }).inputValue(), title);
      await dialog.getByTestId('custom-command-section:action').click();
      assert(await dialog.locator('.custom-command-common').isHidden());
    }
    const layout = await dialog.evaluate((element) => {
      const body = element.querySelector('.settings-dialog-body');
      const action = element.querySelector('.custom-command-action');
      const common = element.querySelector('.custom-command-common');
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        bodyOverflow: getComputedStyle(body).overflowY,
        bodyHeight: body.clientHeight,
        bodyScroll: body.scrollHeight,
        left: bounds.left,
        right: bounds.right,
        bottom: bounds.bottom,
        height: bounds.height,
        pageBottom: innerHeight - parseFloat(style.getPropertyValue('--dialog-page-bottom')),
        footer: element.querySelector('footer').getBoundingClientRect().bottom,
        headerBorder: getComputedStyle(element.querySelector('header')).borderBottomWidth,
        footerBorder: getComputedStyle(element.querySelector('footer')).borderTopWidth,
        commonBorder: getComputedStyle(common).borderRightWidth,
        actionHeight: action.clientHeight,
        actionOverflow: getComputedStyle(action).overflowY,
        actionHorizontalOverflow: action.scrollWidth > action.clientWidth + 1,
        listHeight: element.querySelector('.stack-entry-list')?.clientHeight,
        conditionHeight: element.querySelector('.stack-condition-panel')?.clientHeight,
        listOverflow:
          element.querySelector('.stack-entry-list') &&
          getComputedStyle(element.querySelector('.stack-entry-list')).overflowY,
        conditionOverflow:
          element.querySelector('.stack-condition-panel') &&
          getComputedStyle(element.querySelector('.stack-condition-panel')).overflowY,
      };
    });
    assert.equal(layout.bodyOverflow, 'hidden');
    assert(layout.bodyScroll <= layout.bodyHeight + 1, JSON.stringify(layout));
    assert(
      layout.left >= 0 && layout.right <= viewport.width && layout.bottom <= layout.pageBottom + 1,
    );
    assert(layout.footer <= viewport.height - 8);
    assert(parseFloat(layout.headerBorder) > 0 && parseFloat(layout.footerBorder) > 0);
    if (!narrow) assert(parseFloat(layout.commonBorder) > 0);
    assert(layout.actionHeight > 130 && !layout.actionHorizontalOverflow, JSON.stringify(layout));
    if (stack) {
      assert.equal(layout.actionOverflow, viewport.width <= 520 ? 'auto' : 'hidden');
      if (viewport.width <= 520) {
        assert.equal(layout.listOverflow, 'visible');
        assert.equal(layout.conditionOverflow, 'visible');
      }
      assert(layout.listHeight > 35 && layout.conditionHeight > 65, JSON.stringify(layout));
    } else assert.equal(layout.actionOverflow, 'auto');
    if (viewport.height > 900) assert(layout.height > 850 && layout.height <= 900);
    await dialog.locator('.custom-command-action').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await dialog.getByTestId('settings-dialog-cancel').focus();
    assert(
      await dialog
        .getByTestId('settings-dialog-cancel')
        .evaluate((element) => element === document.activeElement),
    );
    await page.screenshot({ path: path.join(profile, `${name}-${viewport.width}.png`) });
  }
  await page.setViewportSize(originalViewport);
};
