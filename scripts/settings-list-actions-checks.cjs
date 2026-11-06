const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async ({
  host,
  select,
  snapshot,
  until,
  inspect,
  inspector,
  electronExpression,
  profile,
  checks,
}) => {
  const samples = [];
  const interactions = [];
  const pages = [
    [
      'Applet管理',
      '.applet-management-actions .settings-list-icon, .applet-management-links .settings-list-icon',
    ],
    ['リボン', '.ribbon-row-controls .settings-list-icon'],
    ['タスクトレイ', '.tray-row-controls .settings-list-icon'],
    ['カスタムコマンド', '.settings-list tbody .settings-list-icon'],
    ['文章生成AI', '.ai-connection-table .settings-list-icon'],
    ['MCPクライアント', '.settings-list tbody .settings-list-icon:visible'],
    ['MCPツールコマンド', '.settings-list tbody .settings-list-icon:visible'],
  ];
  const change = (patch) =>
    host.evaluate(async (patch) => {
      const s = await window.dock.snapshot();
      await window.dock.saveSettings(
        { ...s.settings.value, host: { ...s.settings.value.host, ...patch } },
        s.settings.revision,
      );
    }, patch);
  for (const theme of ['light', 'dark']) {
    await change({ theme });
    for (const width of [1280, 760]) {
      await inspect(
        inspector,
        `(${(e, width) => {
          const window = e.BrowserWindow.getAllWindows().find(
            (w) =>
              !w.isDestroyed() && w.webContents.getURL().startsWith('appdock://host/index.html'),
          );
          window.setMinimumSize(600, 600);
          window.setSize(width, 900);
        }})(${electronExpression},${width})`,
      );
      await until(
        async () => (await host.evaluate(() => innerWidth)) === width,
        'resized native window',
      );
      await until(
        () =>
          host.evaluate(async () => {
            const connection =
              document.querySelector('.settings-surface').dataset.settingsConnection;
            return (
              (await window.dock.settingsPage.get(connection)).content.hostWidth === innerWidth
            );
          }),
        'resized host',
      );
      let reference;
      for (const [title, selector] of pages) {
        await select(title === 'MCPツールコマンド' ? 'MCPクライアント' : title);
        if (title.startsWith('MCP'))
          await host
            .getByRole('tab', { name: title === 'MCPクライアント' ? '接続先' : title, exact: true })
            .click();
        if (['Applet管理', '文章生成AI', 'MCPクライアント'].includes(title)) {
          const order = host.getByRole('button', { name: /並べ替え/ });
          assert.equal(await order.count(), 1, title + ' has one order action');
          assert.equal(
            await host
              .locator('.settings-list-toolbar')
              .getByRole('button', { name: /並べ替え/ })
              .count(),
            1,
            title + ' exposes a single order action in its list controls',
          );
          if (!(await order.isDisabled())) {
            const before = (await snapshot()).settings.value;
            await order.click();
            const dialog = host.getByRole('dialog');
            await dialog.waitFor();
            await dialog.press('Escape');
            await dialog.waitFor({ state: 'hidden' });
            assert.deepEqual((await snapshot()).settings.value, before);
          }
          await host.screenshot({
            path: path.join(profile, `list-actions-${theme}-${width}-${title}.png`),
          });
        }
        await host.getByRole('heading', { level: 1 }).hover();
        const geometry = await host.locator(selector).evaluateAll((buttons) => {
          const probe = document.createElement('span');
          probe.style.cssText =
            'display:none;background:transparent;color:var(--text);border:1px solid transparent';
          document.body.append(probe);
          const normal = getComputedStyle(probe);
          const result = buttons.map((button) => {
            const r = button.getBoundingClientRect(),
              s = getComputedStyle(button),
              cell = button.closest('td');
            return {
              label: button.getAttribute('aria-label'),
              width: r.width,
              height: r.height,
              color: s.color,
              background: s.backgroundColor,
              radius: s.borderRadius,
              border: s.borderColor,
              accent: button.classList.contains('accent-action'),
              expectedColor: normal.color,
              expectedBackground: normal.backgroundColor,
              expectedBorder: normal.borderColor,
              insideCell:
                !cell ||
                (r.left >= cell.getBoundingClientRect().left &&
                  r.right <= cell.getBoundingClientRect().right),
              rect: r.toJSON(),
              cell: cell?.getBoundingClientRect().toJSON(),
              gap: getComputedStyle(button.parentElement).gap,
            };
          });
          probe.remove();
          return result;
        });
        assert(geometry.length, title + ' has row actions');
        if (!reference) reference = geometry.find((button) => !button.accent);
        for (const button of geometry) {
          assert.equal(button.width, 32, title + ': ' + button.label);
          assert.equal(button.height, 32, title + ': ' + button.label);
          assert.equal(button.radius, reference.radius);
          assert(
            button.insideCell,
            title + ': actions stay inside their cells: ' + JSON.stringify(button),
          );
          assert.equal(button.background, button.expectedBackground, title + ': ' + button.label);
          assert.equal(button.border, button.expectedBorder, title + ': ' + button.label);
          if (!button.accent) {
            assert.equal(button.color, button.expectedColor, title + ': ' + button.label);
          }
        }
        samples.push({ theme, width, page: title, geometry });
        const buttons = host.locator(selector);
        const candidates = await buttons.evaluateAll((buttons) =>
          [false, true].map((accent) =>
            buttons.findIndex(
              (button) => !button.disabled && button.classList.contains('accent-action') === accent,
            ),
          ),
        );
        for (const index of candidates.filter((index) => index >= 0)) {
          const button = buttons.nth(index);
          const read = () =>
            button.evaluate((e) => {
              const accent = e.classList.contains('accent-action');
              const probe = document.createElement('span');
              probe.style.cssText = `display:none;background:var(${accent ? '--accent-hover' : '--panel'});border:1px solid var(${accent ? '--accent-hover' : '--border'})`;
              document.body.append(probe);
              const style = getComputedStyle(e),
                expected = getComputedStyle(probe),
                rect = e.getBoundingClientRect();
              const result = {
                width: rect.width,
                height: rect.height,
                background: style.backgroundColor,
                border: style.borderColor,
                borderStyle: style.borderStyle,
                borderWidth: style.borderWidth,
                filter: style.filter,
                expectedBackground: expected.backgroundColor,
                expectedBorder: expected.borderColor,
                focused: e.matches(':focus-visible'),
              };
              probe.remove();
              return result;
            });
          const rest = await read();
          assert.equal(rest.background, 'rgba(0, 0, 0, 0)');
          assert.equal(rest.border, 'rgba(0, 0, 0, 0)');
          await button.hover();
          const hover = await read();
          assert.equal(hover.background, hover.expectedBackground);
          assert.equal(hover.border, hover.expectedBorder);
          assert.equal(hover.borderStyle, 'solid');
          assert(parseFloat(hover.borderWidth) > 0);
          assert.equal(
            hover.filter,
            'none',
            'hover keeps the neutral border from bleaching into the background',
          );
          await host.getByRole('heading', { level: 1 }).hover();
          await button.focus();
          await host.keyboard.press('Tab');
          await host.keyboard.press('Shift+Tab');
          const focus = await read();
          assert(focus.focused);
          assert.equal(focus.background, focus.expectedBackground);
          assert.equal(focus.border, focus.expectedBorder);
          for (const state of [rest, hover, focus]) {
            assert.equal(state.width, 32);
            assert.equal(state.height, 32);
          }
          interactions.push({
            theme,
            width,
            page: title,
            label: await button.getAttribute('aria-label'),
            rest,
            hover,
            focus,
          });
          await button.evaluate((e) => e.blur());
        }
      }
      checks.push(
        `${theme}/${width}: seven current lists share 32px transparent icons and hover/keyboard focus surfaces`,
      );
    }
  }
  // Trigger stack actions, filtering and cancellation are covered by command-stacks-ui-test
  // and command-triggers-ui-test --usability-only/--dialog-actions-only.
  await host.evaluate(() => window.dock.executeCommand('appdock.settings.showHints.off'));
  await until(async () => (await snapshot()).settings.value.host.showHints === false, 'hints off');
  const actions = host.locator('.settings-list tbody .settings-list-icon:visible');
  assert((await actions.count()) > 0);
  assert(
    await actions.evaluateAll((buttons) =>
      buttons.every((button) => !!button.getAttribute('aria-label')),
    ),
  );
  checks.push('MCP command row actions retain accessible labels with hints OFF');
  fs.writeFileSync(path.join(profile, 'list-actions.json'), JSON.stringify(samples, null, 2));
  fs.writeFileSync(
    path.join(profile, 'list-icon-states.json'),
    JSON.stringify(interactions, null, 2),
  );
};
