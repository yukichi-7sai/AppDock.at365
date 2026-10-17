const assert = require('node:assert/strict');

async function settles(check) {
  let failure;
  for (let i = 0; i < 80; i++) {
    try {
      await check();
      return;
    } catch (error) {
      failure = error;
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  throw failure;
}

async function assertLayout(host, page, app, embedded = false) {
  await settles(async () => {
    const bounds = await host.evaluate((embedded) => {
      const slot = document.querySelector('.shell-page-slot');
      const main = slot.closest('main');
      const area = embedded ? slot.parentElement : main;
      const rect = (e) => {
        const r = e.getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
        };
      };
      return {
        slot: rect(slot),
        area: rect(area),
        scroll: main.scrollHeight,
        height: main.clientHeight,
      };
    }, embedded);
    for (const edge of ['x', 'right', 'bottom'])
      assert(
        Math.abs(bounds.slot[edge] - bounds.area[edge]) <= 1,
        `${edge}: ${JSON.stringify(bounds)}`,
      );
    // Without a host banner the top is also flush with the allocated area.
    if (!(await host.locator('main > .error-banner').count()))
      assert(Math.abs(bounds.slot.y - bounds.area.y) <= 1, `top: ${JSON.stringify(bounds)}`);
    assert(bounds.slot.height > 0, 'visible slot');
    assert(bounds.scroll <= bounds.height + 1, 'host must not scroll the Shell');
    const surface = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      scroll: document.documentElement.scrollWidth,
      vertical: document.documentElement.scrollHeight,
    }));
    assert(
      Math.abs(surface.width - bounds.slot.width) <= 2,
      `view width: ${JSON.stringify({ bounds, surface })}`,
    );
    assert(Math.abs(surface.height - bounds.slot.height) <= 2, 'view height must track the slot');
    assert(surface.scroll <= surface.width + 1, 'no document horizontal overflow');
    assert(surface.vertical <= surface.height + 1, 'no document vertical overflow');
    if (app) {
      const native = await app.evaluate(({ BrowserWindow }, url) => {
        const w = BrowserWindow.getAllWindows().find((w) =>
          w.webContents.getURL().startsWith('appdock://host/index.html'),
        );
        const child = w.contentView.children.find((v) => v.webContents?.getURL() === url);
        return { bounds: child.getBounds(), zoom: w.webContents.getZoomFactor() };
      }, page.url());
      for (const key of ['x', 'y', 'width', 'height'])
        assert(
          Math.abs(native.bounds[key] - Math.round(bounds.slot[key] * native.zoom)) <= 1,
          `native ${key}`,
        );
    }
  });
}

async function exerciseLayout(host, page, app, kind) {
  if (kind === 'settings') {
    await settles(async () => {
      const layout = await host.evaluate(() => {
        const surface = document.querySelector('.settings-surface');
        const body = surface.querySelector('.settings-body');
        const r = surface.getBoundingClientRect();
        return { width: r.width, height: r.height, body: body.clientHeight, scroll: document.documentElement.scrollWidth, viewport: innerWidth };
      });
      assert(layout.width > 0 && layout.height > 0 && layout.body > 0);
      assert(layout.scroll <= layout.viewport + 1);
      assert.equal(page, host);
    });
    return;
  }
  await assertLayout(host, page, app);
  if (kind === 'logs') {
    const scrolling = await page.evaluate(() => {
      const table = document.querySelector('.log-table');
      const row = table.querySelector('.log-row');
      if (!row) throw Error('Log fixture must have a row');
      const copies = Array.from({ length: 80 }, () => row.cloneNode(true));
      table.append(...copies);
      const heading = document.querySelector('.page-heading');
      const top = heading.getBoundingClientRect().top;
      table.scrollTop = table.scrollHeight;
      const result = {
        scrolled: table.scrollTop > 0,
        headingFixed: heading.getBoundingClientRect().top === top,
        lastVisible:
          copies.at(-1).getBoundingClientRect().bottom <= table.getBoundingClientRect().bottom + 1,
        columnsFixed:
          Math.abs(
            table.querySelector('.log-head').getBoundingClientRect().top -
              table.getBoundingClientRect().top,
          ) <= 2,
      };
      copies.forEach((e) => e.remove());
      table.scrollTop = 0;
      return result;
    });
    assert.deepEqual(scrolling, {
      scrolled: true,
      headingFixed: true,
      lastVisible: true,
      columnsFixed: true,
    });
  }
  const id = await page.evaluate(async () => (await window.appdockPage.connect()).snapshot.id);
  // Exercise host notification reflow without modifying settings or creating real errors.
  await host.evaluate(() => {
    const banner = document.createElement('div');
    banner.className = 'error-banner';
    banner.dataset.layoutFixture = 'true';
    banner.textContent = 'Layout notification '.repeat(60);
    document.querySelector('main').prepend(banner);
  });
  try {
    await assertLayout(host, page, app);
    const gap = await host.evaluate(
      () =>
        document.querySelector('.shell-page-slot').getBoundingClientRect().top -
        document.querySelector('[data-layout-fixture]').getBoundingClientRect().bottom,
    );
    assert(gap >= -1 && gap <= 1, 'Shell begins immediately after the host notification');
  } finally {
    await host.locator('[data-layout-fixture]').evaluate((e) => e.remove());
  }
  await assertLayout(host, page, app);
  if (app) {
    const original = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      return {
        size: w.getSize(),
        minimum: w.getMinimumSize(),
        zoom: w.webContents.getZoomFactor(),
      };
    });
    try {
      for (const [width, height, zoom] of [
        [1500, 900, 1],
        [900, 650, 1.25],
        [700, 620, 1],
        [900, 360, 1],
      ]) {
        await app.evaluate(
          ({ BrowserWindow }, s) => {
            const w = BrowserWindow.getAllWindows()[0];
            w.setMinimumSize(400, 300);
            w.setSize(s[0], s[1]);
            w.webContents.setZoomFactor(s[2]);
          },
          [width, height, zoom],
        );
        await assertLayout(host, page, app);
        const content = await page.evaluate((kind) => {
          const e = document.querySelector(
            kind === 'home'
              ? '.home-page'
              : kind === 'logs'
                ? '.logs-page'
                : '.settings-surface > main',
          );
          return { width: e.clientWidth, scroll: e.scrollWidth };
        }, kind);
        assert(
          content.scroll <= content.width + 1,
          `${kind} content must not overflow horizontally`,
        );
        if (kind === 'home' && width === 1500) {
          const cols = await page
            .locator('.extension-grid')
            .evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(' ').length);
          assert(cols >= 3, 'wide home uses at least three card columns');
        }
      }
    } finally {
      await app.evaluate(({ BrowserWindow }, s) => {
        const w = BrowserWindow.getAllWindows()[0];
        w.setMinimumSize(...s.minimum);
        w.setSize(...s.size);
        w.webContents.setZoomFactor(s.zoom);
      }, original);
    }
    await assertLayout(host, page, app);
  }
  assert.equal(
    await page.evaluate(async () => (await window.appdockPage.connect()).snapshot.id),
    id,
    'layout changes retain the page session',
  );
}

module.exports = { assertLayout, exerciseLayout };
