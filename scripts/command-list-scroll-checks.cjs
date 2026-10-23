const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
module.exports = async ({ host, select, until, profile, checks }) => {
  const samples = [];
  const pages = [
    'ショートカットキー',
    'マウスジェスチャー',
    'タッチパッドジェスチャー',
    'カスタムコマンド',
  ];
  const frame = host.locator('.settings-page-layout');
  const body = host.locator('.settings-body');
  const list = host.locator('.command-list-page-scroll');
  const bar = host.getByRole('region', { name: 'コマンド一覧を横にスクロール' });
  const geometry = () =>
    list.evaluate((e) => {
      const body = e.closest('.settings-body');
      const bar = document.querySelector('.command-list-scrollbar');
      const toolbar = body.querySelector('.command-list-toolbar');
      let canvas = body;
      while (
        canvas.parentElement &&
        ['transparent', 'rgba(0, 0, 0, 0)'].includes(getComputedStyle(canvas).backgroundColor)
      )
        canvas = canvas.parentElement;
      const section = e.closest('.command-list-section');
      return {
        list: e.getBoundingClientRect().toJSON(),
        body: body.getBoundingClientRect().toJSON(),
        bar: bar.getBoundingClientRect().toJSON(),
        toolbar: toolbar.getBoundingClientRect().toJSON(),
        heading: body.querySelector('.settings-page-heading')?.getBoundingClientRect().toJSON(),
        pageToolbar: body.querySelector('.settings-page-toolbar')?.getBoundingClientRect().toJSON(),
        outerScroll: body.classList.contains('settings-page-scroll'),
        filterBackground: getComputedStyle(toolbar).backgroundColor,
        canvasBackground: getComputedStyle(canvas).backgroundColor,
        unframed:
          !!section &&
          !e.closest('.settings-section') &&
          getComputedStyle(section).borderTopWidth === '0px' &&
          getComputedStyle(section).paddingLeft === '0px' &&
          section.querySelectorAll(':scope > header, :scope > .settings-section-content').length ===
            0,
        clientWidth: e.clientWidth,
        scrollWidth: e.scrollWidth,
        clientHeight: e.clientHeight,
        scrollHeight: e.scrollHeight,
        bodyClientWidth: body.clientWidth,
        bodyScrollWidth: body.scrollWidth,
        bodyClientHeight: body.clientHeight,
        bodyScrollHeight: body.scrollHeight,
        internalTop: e.scrollTop,
        bodyTop: body.scrollTop,
        barVisible: !bar.parentElement.hidden,
        border: e.clientLeft,
      };
    });
  for (const theme of ['light', 'dark']) {
    await host.evaluate(async (theme) => {
      const s = await window.dock.snapshot();
      await window.dock.saveSettings(
        { ...s.settings.value, host: { ...s.settings.value.host, theme } },
        s.settings.revision,
      );
    }, theme);
    for (const [width, height] of [
      [1280, 900],
      [760, 900],
      [760, 640],
    ]) {
      await host.setViewportSize({ width, height });
      for (const page of pages) {
        await select(page);
        await list.waitFor();
        await until(async () => {
          const g = await geometry();
          return g.barVisible === g.scrollWidth > g.clientWidth + 1;
        }, 'scrollbar width measured');
        let g = await geometry();
        assert(
          g.outerScroll && g.heading && g.pageToolbar,
          'page header and controls share the outer scrollport',
        );
        assert(g.unframed, 'filters and table use an unframed top-level list');
        assert(g.scrollHeight <= g.clientHeight + 1, JSON.stringify(g));
        assert(g.bodyScrollHeight > g.bodyClientHeight + 100, JSON.stringify(g));
        assert(g.bodyScrollWidth <= g.bodyClientWidth + 1, JSON.stringify(g));
        if (g.barVisible) {
          assert(Math.abs(g.bar.left - g.list.left - g.border) <= 1, JSON.stringify(g));
          assert(Math.abs(g.bar.width - g.clientWidth) <= 1, JSON.stringify(g));
          assert(g.bar.height >= 12);
          const bounds = await frame.boundingBox();
          assert(g.bar.bottom <= bounds.y + bounds.height + 1);
          await bar.evaluate((e) => {
            e.scrollLeft = e.scrollWidth;
          });
          await until(
            async () =>
              list.evaluate((e) => {
                const bar = document.querySelector('.command-list-scrollbar');
                return e.scrollLeft > 0 && Math.abs(e.scrollLeft - bar.scrollLeft) <= 1;
              }),
            'bar scrolls table',
          );
          await list.evaluate((e) => {
            e.scrollLeft = Math.floor((e.scrollWidth - e.clientWidth) / 2);
          });
          await until(
            async () =>
              list.evaluate(
                (e) =>
                  Math.abs(
                    e.scrollLeft - document.querySelector('.command-list-scrollbar').scrollLeft,
                  ) <= 1,
              ),
            'table scrolls bar',
          );
          await bar.evaluate((e) => {
            e.scrollLeft = 0;
          });
          await bar.focus();
          await bar.evaluate((e) => {
            e.addEventListener(
              'keydown',
              (event) => {
                e.dataset.lastKey = event.key;
              },
              { once: true },
            );
          });
          await bar.press('ArrowRight');
          fs.writeFileSync(
            path.join(profile, 'keyboard-scroll.json'),
            JSON.stringify(
              await list.evaluate((e) => {
                const bar = document.querySelector('.command-list-scrollbar');
                return {
                  page: document.querySelector('.settings-page-heading h1').textContent,
                  tableLeft: e.scrollLeft,
                  barLeft: bar.scrollLeft,
                  barWidth: bar.clientWidth,
                  barScrollWidth: bar.scrollWidth,
                  key: bar.dataset.lastKey,
                  active: document.activeElement?.className,
                };
              }),
              null,
              2,
            ),
          );
          await until(
            async () => list.evaluate((e) => e.scrollLeft > 0),
            'keyboard horizontal scroll',
          );
          await bar.press('End');
          await until(
            async () =>
              list.evaluate((e) => Math.abs(e.scrollWidth - e.clientWidth - e.scrollLeft) <= 1),
            'keyboard reaches last column',
          );
          await bar.press('Home');
          await until(
            async () => list.evaluate((e) => e.scrollLeft <= 1),
            'keyboard returns to first column',
          );
          const track = await bar.boundingBox();
          await host.mouse.move(track.x + 12, track.y + track.height - 6);
          await host.mouse.down();
          await host.mouse.move(track.x + track.width - 20, track.y + track.height - 6, {
            steps: 5,
          });
          await host.mouse.up();
          await until(async () => list.evaluate((e) => e.scrollLeft > 0), 'native scrollbar drag');
        }
        await body.evaluate((e) => {
          const toolbar = e.querySelector('.command-list-toolbar');
          const anchor = toolbar.offsetHeight
            ? toolbar
            : e.querySelector('.command-list-page-scroll');
          e.scrollTop += anchor.getBoundingClientRect().top - e.getBoundingClientRect().top + 400;
        });
        await until(async () => body.evaluate((e) => e.scrollTop > 0), 'page vertical scroll');
        g = await geometry();
        assert.equal(g.internalTop, 0);
        assert(
          g.heading.bottom <= g.body.top && g.pageToolbar.bottom <= g.body.top,
          'page header and controls scroll out of view',
        );
        if (page !== 'カスタムコマンド') {
          assert.equal(
            g.filterBackground,
            g.canvasBackground,
            'sticky filters blend with the page background',
          );
          assert(Math.abs(g.toolbar.top - g.body.top) <= 1, JSON.stringify(g));
          assert(
            await host.locator('.command-list-toolbar').evaluate((e) => {
              const r = e.getBoundingClientRect();
              return e.contains(document.elementFromPoint(r.left + 10, r.top + 10));
            }),
            'sticky filters cover table rows',
          );
        } else assert.equal(await host.locator('.command-shortcut-search').count(), 0);
        const point = await body.boundingBox();
        await host.mouse.move(point.x + point.width / 2, point.y + point.height - 30);
        const before = g.bodyTop;
        await host.mouse.wheel(0, 180);
        await until(
          async () => (await body.evaluate((e) => e.scrollTop)) > before,
          'wheel over table scrolls page',
        );
        const afterWheel = await geometry();
        assert.equal(afterWheel.internalTop, 0);
        if (g.barVisible) assert(afterWheel.barVisible);
        samples.push({ theme, width, height, page, ...afterWheel });
        fs.writeFileSync(
          path.join(profile, 'list-scrollbars.json'),
          JSON.stringify(samples, null, 2),
        );
        await host.screenshot({
          path: path.join(
            profile,
            `scrollbar-${theme}-${width}-${height}-${pages.indexOf(page)}.png`,
          ),
        });
        checks.push(
          `outer-header-scroll-linked-horizontal-sticky-background-${theme}-${width}-${height}-${page}`,
        );
      }
    }
  }
  await host.setViewportSize({ width: 760, height: 640 });
  for (const page of pages.slice(0, 3)) {
    await select(page);
    const search = host.locator('.command-shortcut-search input');
    await search.fill('no matching command 0123456789');
    await search.press('Enter');
    await until(
      async () => (await host.locator('[data-shortcut-command]').count()) === 0,
      'empty search',
    );
    await until(
      async () => host.locator('.command-list-scrollbar-slot').evaluate((e) => e.hidden),
      'empty list hides bar',
    );
    await search.fill('appdock.open');
    await search.press('Enter');
    await until(
      async () => (await host.locator('[data-shortcut-command]').count()) === 1,
      'single result',
    );
    await until(async () => (await geometry()).barVisible, 'bar restored after filtering');
    await list.locator('.applet-shortcut-add').click();
    await host.getByRole('dialog').waitFor();
    const position = await list.evaluate((e) => ({
      left: e.scrollLeft,
      top: e.closest('.settings-body').scrollTop,
    }));
    await host.getByRole('dialog').getByRole('button', { name: 'キャンセル', exact: true }).click();
    await until(async () => (await host.getByRole('dialog').count()) === 0, 'dialog closes');
    assert.deepEqual(
      await list.evaluate((e) => ({
        left: e.scrollLeft,
        top: e.closest('.settings-body').scrollTop,
      })),
      position,
    );
    assert(
      await list.locator('.applet-shortcut-add').evaluate((e) => e === document.activeElement),
    );
    await search.fill('');
    await search.press('Enter');
    checks.push(`empty-filter-restore-dialog-focus-${page}`);
  }
  await select('マウスジェスチャー');
  await host.locator('.gesture-settings-section > summary').click();
  await body.evaluate((e) => {
    const toolbar = e.querySelector('.command-list-toolbar');
    e.scrollTop += toolbar.getBoundingClientRect().top - e.getBoundingClientRect().top + 400;
  });
  await until(async () => {
    const g = await geometry();
    return Math.abs(g.toolbar.top - g.body.top) <= 1 && g.barVisible;
  }, 'expanded options preserve sticky filters and bar');
  checks.push('expanded-options-page-scroll');
  await select('カスタムコマンド');
  await host.getByRole('button', { name: 'JSON', exact: true }).click();
  await until(
    async () => (await host.locator('.command-list-page-scroll').count()) === 0,
    'JSON releases table',
  );
  assert(await host.locator('.command-list-scrollbar-slot').evaluate((e) => e.hidden));
  await host.getByRole('button', { name: 'フォーム', exact: true }).click();
  await list.waitFor();
  await until(async () => (await geometry()).barVisible, 'form restores horizontal scrollbar');
  checks.push('JSON-form-lifetime');
  for (const theme of ['light', 'dark']) {
    await host.evaluate(async (theme) => {
      const s = await window.dock.snapshot();
      await window.dock.saveSettings(
        { ...s.settings.value, host: { ...s.settings.value.host, theme } },
        s.settings.revision,
      );
    }, theme);
    for (const [width, height] of [
      [1280, 900],
      [760, 640],
    ]) {
      await host.setViewportSize({ width, height });
      await select('Applet管理');
      await body.evaluate((e) => {
        const toolbar = e.querySelector('.command-list-toolbar');
        e.scrollTop += toolbar.getBoundingClientRect().top - e.getBoundingClientRect().top + 250;
      });
      assert(
        await body.evaluate((e) => {
          const toolbar = e.querySelector('.command-list-toolbar');
          return (
            e.classList.contains('settings-page-scroll') &&
            e.scrollTop > 0 &&
            Math.abs(toolbar.getBoundingClientRect().top - e.getBoundingClientRect().top) <= 1 &&
            e.querySelector('.settings-page-heading').getBoundingClientRect().bottom <
              e.getBoundingClientRect().top
          );
        }),
        'Applet filters stick while the page header scrolls away',
      );
      await host.screenshot({ path: path.join(profile, `applet-sticky-${theme}-${width}.png`) });
      const search = host.getByRole('searchbox', { name: 'Appletを検索', exact: true });
      await search.fill('fixture.hints');
      await search.press('Enter');
      await until(
        async () => (await host.locator('[data-applet-id]').count()) === 1,
        'sticky Applet search',
      );
      assert(await search.evaluate((e) => e === document.activeElement));
      await search.fill('');
      await search.press('Enter');
      await until(
        async () => (await host.locator('[data-applet-id]').count()) >= 24,
        'Applet search clears',
      );
      checks.push(`applet-management-sticky-filter-${theme}-${width}`);
    }
  }
  await select('AI');
  assert.equal(await host.locator('.command-list-page-scroll').count(), 0);
  assert(await host.locator('.command-list-scrollbar-slot').evaluate((e) => e.hidden));
  assert.equal(
    await host.locator('.ai-connection-table').evaluate((e) => getComputedStyle(e).display),
    'block',
  );
  checks.push('other-settings-native-layout');
  for (const theme of ['light', 'dark']) {
    await host.evaluate(async (theme) => {
      const s = await window.dock.snapshot();
      await window.dock.saveSettings(
        { ...s.settings.value, host: { ...s.settings.value.host, theme } },
        s.settings.revision,
      );
    }, theme);
    for (const width of [1280, 760]) {
      await host.setViewportSize({ width, height: 640 });
      for (const title of [
        '表示',
        '一般',
        '通知',
        'リボン',
        'タスクトレイ',
        'Webアカウント',
        '操作の許可',
        'TTS',
        'AI',
        'MCPサーバー',
        'MCPクライアント',
        'バージョン情報・更新',
        'Hint fixture',
      ]) {
        await select(title);
        const checkHeader = async () => {
          assert.equal(await body.count(), 1);
          const g = await body.evaluate((e) => {
            const header = e.querySelector('.settings-page-heading');
            const before = header.getBoundingClientRect().top;
            const oldPadding = e.style.paddingBottom;
            // Supply overflow on short fixture pages as well as naturally long pages.
            e.style.paddingBottom = `${e.clientHeight}px`;
            e.scrollTop = 140;
            const result = { moved: before - header.getBoundingClientRect().top, top: e.scrollTop };
            e.scrollTop = 0;
            e.style.paddingBottom = oldPadding;
            return result;
          });
          assert(g.top > 0 && Math.abs(g.moved - g.top) < 1, title + JSON.stringify(g));
        };
        await checkHeader();
        if (['一般', 'AI', 'Hint fixture'].includes(title)) {
          const original = (await host.evaluate(() => window.dock.snapshot())).settings;
          await host.getByRole('button', { name: 'JSON', exact: true }).click();
          const editor = host.getByRole('textbox', { name: '設定JSON', exact: true });
          await editor.waitFor();
          assert((await editor.boundingBox()).height >= 180);
          await checkHeader();
          await host.getByRole('button', { name: 'フォーム', exact: true }).click();
          assert.deepEqual((await host.evaluate(() => window.dock.snapshot())).settings, original);
        }
      }
      await host.screenshot({
        path: path.join(profile, `all-settings-header-${theme}-${width}.png`),
      });
      checks.push(`all-host-and-Applet-headers-scroll-form-JSON-${theme}-${width}`);
    }
  }
};
