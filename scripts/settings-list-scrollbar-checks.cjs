const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
module.exports = async ({ host, select, until, profile, checks }) => {
  const samples = [];
  for (const theme of ['light', 'dark'])
    for (const [width, height] of [
      [1280, 900],
      [760, 900],
      [760, 640],
    ]) {
      await host.evaluate(async (theme) => {
        const s = await window.dock.snapshot();
        await window.dock.saveSettings(
          { ...s.settings.value, host: { ...s.settings.value.host, theme } },
          s.settings.revision,
        );
      }, theme);
      await host.setViewportSize({ width, height });
      for (const page of ['ショートカット', 'マウスジェスチャー']) {
        await select(page);
        const list = host.locator('.shortcut-command-list');
        await list.waitFor();
        await list.scrollIntoViewIfNeeded();
        await list.evaluate((e) => {
          const body = e.closest('.settings-body');
          const bottom = e.getBoundingClientRect().bottom;
          const visibleBottom = body.getBoundingClientRect().bottom;
          if (bottom > visibleBottom) body.scrollTop += bottom - visibleBottom + 20;
        });
        const sample = await list.evaluate((e) => {
          const r = e.getBoundingClientRect(),
            body = e.closest('.settings-body').getBoundingClientRect();
          return {
            top: r.top,
            bottom: r.bottom,
            bodyBottom: body.bottom,
            clientWidth: e.clientWidth,
            scrollWidth: e.scrollWidth,
            clientHeight: e.clientHeight,
            scrollHeight: e.scrollHeight,
            offsetHeight: e.offsetHeight,
            overflowX: getComputedStyle(e).overflowX,
            overflowY: getComputedStyle(e).overflowY,
            scrollbarHeight: getComputedStyle(e, '::-webkit-scrollbar').height,
            ancestors: [
              e.parentElement,
              e.closest('.command-shortcuts'),
              e.closest('.settings-form'),
              e.closest('.settings-body'),
            ].map((p) => ({
              className: p.className,
              rect: p.getBoundingClientRect().toJSON(),
              clientHeight: p.clientHeight,
              scrollHeight: p.scrollHeight,
              scrollTop: p.scrollTop,
              minHeight: getComputedStyle(p).minHeight,
              flex: getComputedStyle(p).flex,
            })),
          };
        });
        samples.push({ theme, width, height, page, ...sample });
        fs.writeFileSync(
          path.join(profile, 'list-scrollbars.json'),
          JSON.stringify(samples, null, 2),
        );
        await host.screenshot({
          path: path.join(
            profile,
            `scrollbar-${theme}-${width}-${height}-${page === 'ショートカット' ? 'keys' : 'gestures'}.png`,
          ),
        });
        assert(sample.bottom <= sample.bodyBottom + 1, JSON.stringify(sample));
        if (sample.scrollWidth > sample.clientWidth) {
          assert(sample.offsetHeight - sample.clientHeight >= 10, JSON.stringify(sample));
          await list.evaluate((e) => {
            e.scrollLeft = e.scrollWidth;
          });
          await until(
            async () => await list.evaluate((e) => e.scrollLeft > 0),
            'horizontal scroll',
          );
          const destination = await list
            .locator('.command-settings-cell')
            .first()
            .evaluate((e) => ({
              right: e.getBoundingClientRect().right,
              containerRight: e.closest('.shortcut-command-list').getBoundingClientRect().right,
            }));
          assert(destination.right <= destination.containerRight + 1);
          await list.evaluate((e) => {
            e.scrollLeft = 0;
          });
        }
        if (sample.scrollHeight > sample.clientHeight) {
          await list.evaluate((e) => {
            e.scrollTop = e.scrollHeight;
          });
          await until(async () => await list.evaluate((e) => e.scrollTop > 0), 'vertical scroll');
          await list.locator('tbody tr').last().scrollIntoViewIfNeeded();
          await list.evaluate((e) => {
            e.scrollTop = 0;
          });
        }
        const index = host.locator('.settings-categories');
        for (const title of [
          'Applet管理',
          '通知',
          'ショートカット',
          'マウスジェスチャー',
          'カスタムコマンド',
        ]) {
          const button = index.getByRole('button', { name: title, exact: true });
          assert.equal(await button.locator('.settings-index-icon svg').count(), 1);
          const g = await button.evaluate((e) => {
            const icon = e.querySelector('.settings-index-icon'),
              r = e.getBoundingClientRect(),
              i = icon.getBoundingClientRect();
            return {
              gap: r.right - i.right,
              padding: parseFloat(getComputedStyle(e).paddingRight),
              color: getComputedStyle(icon).color,
              text: getComputedStyle(e).color,
            };
          });
          assert(Math.abs(g.gap - g.padding) < 1);
          assert.equal(g.color, g.text);
        }
        checks.push(`visible-scrollbars-index-icons-${theme}-${width}-${height}-${page}`);
      }
    }
  await host.setViewportSize({ width: 1280, height: 900 });
  await select('ショートカット');
  await host.locator('.command-shortcut-search input').fill('Hint action');
  await until(
    async () => (await host.locator('[data-shortcut-command]').count()) === 1,
    'command search',
  );
  const filtered = host.locator('.shortcut-command-list');
  assert(await filtered.evaluate((e) => e.scrollWidth <= e.clientWidth));
  await filtered.locator('.applet-shortcut-add').first().click();
  await host.getByRole('dialog').waitFor();
  await host.getByRole('dialog').getByRole('button', { name: 'キャンセル', exact: true }).click();
  await until(async () => (await host.getByRole('dialog').count()) === 0, 'dialog closed');
  await select('マウスジェスチャー');
  await host.setViewportSize({ width: 760, height: 640 });
  await host.locator('.gesture-settings-section > summary').click();
  const list = host.locator('.shortcut-command-list');
  await list.evaluate((e) => {
    const body = e.closest('.settings-body');
    body.scrollTop = body.scrollHeight;
  });
  await list.scrollIntoViewIfNeeded();
  const expanded = await list.evaluate((e) => ({
    bottom: e.getBoundingClientRect().bottom,
    visibleBottom: e.closest('.settings-body').getBoundingClientRect().bottom,
    height: e.clientHeight,
    scrollbar: e.offsetHeight - e.clientHeight,
  }));
  assert(
    expanded.bottom <= expanded.visibleBottom + 1 &&
      expanded.height > 0 &&
      expanded.scrollbar >= 10,
    JSON.stringify(expanded),
  );
  await host.screenshot({ path: path.join(profile, 'scrollbar-expanded-options.png') });
  checks.push('filtered-no-horizontal-overflow-edit-dialog-expanded-options-reachable');
  await select('AI');
  assert.equal(
    await host.locator('.ai-connection-table').evaluate((e) => getComputedStyle(e).display),
    'block',
  );
};
