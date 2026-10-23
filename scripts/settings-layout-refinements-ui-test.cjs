const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { launchTestHost } = require('./electron-test-launcher.cjs');
const { settingsPage } = require('./settings-host-helper.cjs');
const { settleSettings } = require('./settings-immediate-helper.cjs');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', 'settings-layout-refinements-ui-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
const checks = [],
  errors = [],
  measurements = [];
let app, page;
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function until(fn, label) {
  const end = Date.now() + 60000;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  throw Error(label);
}
function contrast(a, b) {
  const luminance = (css) => {
    const [r, g, b] = css
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map((v) => {
        const s = Number(v) / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
    return r * 0.2126 + g * 0.7152 + b * 0.0722;
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
async function screenshot(name) {
  await page.screenshot({ path: path.join(profile, name + '.png') });
}
async function fields(container, narrow) {
  const rows = await container.locator('.settings-field').evaluateAll((elements) =>
    elements
      .filter((e) => e.getClientRects().length)
      .map((e) => {
        const rect = (element) => element?.getBoundingClientRect().toJSON();
        return {
          title: e.querySelector('legend').textContent,
          display: getComputedStyle(e).display,
          field: rect(e),
          label: rect(e.querySelector('.settings-field-label')),
          control: rect(e.querySelector('.settings-field-control')),
          group: rect(e.querySelector('.settings-field-group')),
          titleRect: rect(e.querySelector('.settings-title-with-hint > strong')),
          wide: e.classList.contains('settings-field-wide'),
          border: getComputedStyle(e).borderBottomWidth,
        };
      }),
  );
  for (const row of rows) {
    assert.equal(row.display, 'grid', row.title + ' uses the common grid');
    if (row.control) {
      if (narrow || row.wide)
        assert(row.control.y >= row.label.y + row.label.height - 1, row.title + ' stacks');
      else
        assert(
          row.control.x >= row.label.x + row.label.width + 10,
          row.title + ' has a value column',
        );
    }
    if (row.group) {
      assert(row.group.x + row.group.width <= row.titleRect.x, row.title + ' group beside title');
      assert(
        Math.abs(row.group.y + row.group.height / 2 - row.titleRect.y - row.titleRect.height / 2) <
          1,
        row.title + ' keeps the title height',
      );
      assert(row.titleRect.y - row.label.y < 12, row.title + ' has no extra group row');
    }
  }
  const selects = await container
    .locator('.settings-field-control select')
    .evaluateAll((elements) =>
      elements
        .filter((e) => e.getBoundingClientRect().width > 0)
        .map((e) => {
          const style = getComputedStyle(e),
            clone = e.cloneNode(true);
          clone.removeAttribute('id');
          Object.assign(clone.style, {
            position: 'fixed',
            visibility: 'hidden',
            font: style.font,
            padding: style.padding,
            borderWidth: style.borderWidth,
            borderStyle: style.borderStyle,
            boxSizing: style.boxSizing,
          });
          clone.style.setProperty('width', 'max-content', 'important');
          clone.style.setProperty('min-width', '0', 'important');
          clone.style.setProperty('max-width', 'none', 'important');
          document.body.append(clone);
          const natural = clone.getBoundingClientRect().width;
          clone.remove();
          return {
            label: e.getAttribute('aria-label'),
            width: e.getBoundingClientRect().width,
            available: e.parentElement.clientWidth,
            natural,
          };
        }),
    );
  for (const select of selects) {
    assert(select.width <= select.available + 1, select.label + ' fits its value column');
    assert(
      Math.abs(select.width - Math.min(select.natural, select.available)) < 2,
      select.label + ' uses the natural option width instead of filling the column',
    );
  }
  measurements.push({ type: 'fields', narrow, rows, selects });
  return rows;
}
async function centered(button) {
  const value = await button.evaluate((e) => {
    const b = e.getBoundingClientRect(),
      l = e.querySelector('.settings-action-label').getBoundingClientRect();
    return { label: e.textContent, offset: l.x + l.width / 2 - b.x - b.width / 2 };
  });
  measurements.push({ type: 'button', ...value });
  assert(Math.abs(value.offset) < 0.75, value.label + ' is centered: ' + value.offset);
}
async function disclosureLayout(summary) {
  return summary.evaluate((e) => {
    const bounds = (element) => element.getBoundingClientRect().toJSON();
    const sample = document.createElement('span');
    sample.style.cssText = 'position:absolute;background:var(--accent-soft);color:var(--accent)';
    e.append(sample);
    const colors = getComputedStyle(sample);
    const expectedBackground = colors.backgroundColor,
      expectedText = colors.color;
    sample.remove();
    return {
      summary: bounds(e),
      row: bounds(e.parentElement),
      owner: bounds(e.closest('.settings-section-card')),
      title: bounds(e.querySelector('h2')),
      description: bounds(e.querySelector(':scope > p')),
      icon: bounds(e.querySelector('.settings-section-toggle')),
      background: getComputedStyle(e).backgroundColor,
      titleColor: getComputedStyle(e.querySelector('h2')).color,
      descriptionColor: getComputedStyle(e.querySelector(':scope > p')).color,
      expectedBackground,
      expectedText,
    };
  });
}
function assertDisclosurePadding(sample) {
  const left = sample.title.x - sample.summary.x;
  const right = sample.summary.right - sample.icon.right;
  assert(left >= 7.9 && right >= 7.9, 'highlight leaves space beside text and disclosure icon');
  assert(Math.abs(left - right) < 1, 'highlight has balanced horizontal insets');
  assert(Math.abs(sample.title.x - sample.row.x) < 1, 'title stays aligned with the divider');
  assert(Math.abs(sample.icon.right - sample.row.right) < 1, 'disclosure icon stays in its column');
  assert(
    sample.summary.x > sample.owner.x + 3 && sample.summary.right < sample.owner.right - 3,
    'highlight remains inside the card frame',
  );
}
function assertDisclosureColors(sample) {
  assert.equal(
    sample.background,
    sample.expectedBackground,
    'highlight uses the selected soft accent',
  );
  assert.equal(
    sample.descriptionColor,
    sample.expectedText,
    'description uses readable accent text',
  );
  assert(contrast(sample.titleColor, sample.background) >= 4.5, 'title remains readable');
  assert(
    contrast(sample.descriptionColor, sample.background) >= 4.5,
    'description remains readable',
  );
}
async function tableAppearance(table) {
  return table.evaluate((e) => {
    const style = getComputedStyle(e);
    return Object.fromEntries(
      [
        'border-top-width',
        'border-top-style',
        'border-top-color',
        'border-radius',
        'background-color',
        'border-collapse',
        'border-spacing',
      ].map((key) => [key, style.getPropertyValue(key)]),
    );
  });
}
(async () => {
  let success = false;
  try {
    const initial = require('../out/main/shared/settings-schema').createDefaultSettings();
    initial.host.hardwareAcceleration = false;
    initial.keybindings = [];
    initial.gestures.enabled = false;
    fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(initial));
    const portable = !!process.argv[2],
      env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const executablePath = portable ? path.join(profile, 'AppDock.at365.exe') : require('electron');
    if (portable) {
      fs.copyFileSync(path.resolve(process.argv[2]), executablePath);
      assert.equal(hash(executablePath), hash(path.resolve(process.argv[2])));
    }
    app = await launchTestHost({
      executablePath,
      portable,
      env,
      args: [
        ...(portable ? [] : [root]),
        '--test-profile=' + profile,
        '--test-local-state=' + path.join(profile, 'local'),
      ],
    });
    await until(async () => {
      page = app
        .context()
        .pages()
        .find((p) => p.url().startsWith('appdock://host/'));
      return page && (await page.evaluate(() => window.dock?.snapshot()))?.startupReady;
    }, 'host startup');
    page.on('pageerror', (error) => errors.push(error.message));
    page.setDefaultTimeout(15000);
    await page.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    await settingsPage(page);
    const select = async (name) => {
      await page.locator('.settings-categories').getByRole('button', { name, exact: true }).click();
      await page.getByRole('heading', { name, exact: true, level: 1 }).waitFor();
      await settleSettings(page);
    };
    for (const [name, expected] of [
      ['カスタムコマンド', /操作.*コマンド.*実行内容.*公開/],
      ['AI', /AIサーバー.*接続先.*モデル/],
      ['MCPクライアント', /MCPサーバー.*接続先.*ツール/],
    ]) {
      await select(name);
      assert.match(await page.locator('.settings-page-heading > p').innerText(), expected);
    }
    await select('Applet管理');
    assert.equal(await page.getByText('導入状況', { exact: true }).count(), 0);
    assert.equal(
      await page.getByText('インストール済みAppletを管理できます。', { exact: true }).count(),
      0,
    );
    if (portable)
      assert.equal(
        await page.locator('.applet-management > .settings-field').count(),
        0,
        'normal Applet management goes directly from search to count and table',
      );
    checks.push(
      'three page descriptions explain their purpose; Applet management omits redundant installation guidance',
    );
    for (const theme of ['light', 'dark']) {
      await select('表示');
      await page.getByLabel('テーマ', { exact: true }).selectOption(theme);
      await settleSettings(page);
      await page.waitForFunction(
        (theme) => document.documentElement.dataset.theme === theme,
        theme,
      );
      for (const width of [1280, 760]) {
        let bindingListAppearance;
        await app.evaluate(
          ({ BrowserWindow }, width) =>
            BrowserWindow.getAllWindows()
              .find((w) => w.webContents.getURL().startsWith('appdock://host/'))
              .setSize(width, 950),
          width,
        );
        await app.evaluate(({ app }) => {
          const req = process
            .getBuiltinModule('module')
            .createRequire(app.getAppPath() + '/package.json');
          const { WindowsLaunch } = req('./out/main/main/core/windows-launch');
          const descriptor = Object.getOwnPropertyDescriptor(WindowsLaunch.prototype, 'isBusy');
          const fixture = (globalThis.settingsLayoutRecovery = {
            descriptor,
            original: undefined,
            launch: undefined,
          });
          Object.defineProperty(WindowsLaunch.prototype, 'isBusy', {
            ...descriptor,
            get() {
              if (!fixture.launch) {
                fixture.launch = this;
                fixture.original = this.recoveryPending;
              }
              this.recoveryPending = true;
              return descriptor.get.call(this);
            },
          });
        });
        await select('一般');
        assert.equal(
          await page.getByRole('heading', { name: 'Applet・MCPからの操作', exact: true }).count(),
          0,
        );
        const fileCard = page.getByRole('region', { name: '設定ファイル', exact: true });
        const fileActions = fileCard.locator(
          ':scope > .settings-section-content > .settings-actions',
        );
        assert.deepEqual(await fileActions.getByRole('button').allTextContents(), [
          '再起動',
          'バックアップで復元',
          '保存先を開く',
          '中断したWindows起動設定を復旧',
        ]);
        const actionSpacing = await fileActions.evaluate((e) => {
          const style = getComputedStyle(e),
            rect = e.getBoundingClientRect();
          return {
            gap: parseFloat(style.gap),
            top: e.firstElementChild.getBoundingClientRect().top - rect.top,
            bottom: rect.bottom - e.lastElementChild.getBoundingClientRect().bottom,
            inside: [...e.children].every((c) => c.getBoundingClientRect().right <= rect.right + 1),
          };
        });
        assert(
          actionSpacing.gap >= 12 &&
            actionSpacing.top >= 12 &&
            actionSpacing.bottom >= 12 &&
            actionSpacing.inside,
        );
        await fileActions.scrollIntoViewIfNeeded();
        await screenshot(`${theme}-${width}-general-file-actions`);
        await app.evaluate(({ app }) => {
          const req = process
            .getBuiltinModule('module')
            .createRequire(app.getAppPath() + '/package.json');
          const { WindowsLaunch } = req('./out/main/main/core/windows-launch');
          const fixture = globalThis.settingsLayoutRecovery;
          Object.defineProperty(WindowsLaunch.prototype, 'isBusy', fixture.descriptor);
          if (fixture.launch) fixture.launch.recoveryPending = fixture.original;
          delete globalThis.settingsLayoutRecovery;
        });
        for (const name of ['マウスジェスチャー', 'ショートカットキー']) {
          await select(name);
          const options = page
            .locator('details.settings-section')
            .filter({ has: page.getByRole('heading', { name: '動作設定', exact: true }) });
          if (!(await options.evaluate((e) => e.open)))
            await options.locator(':scope > summary').click();
          assert.equal(
            await options.locator('.settings-section').count(),
            0,
            name + ' has no nested sections',
          );
          const narrow = await page
            .locator('.settings-page-layout')
            .evaluate((e) => e.clientWidth <= 660);
          const rows = await fields(options, narrow);
          const browserRows = rows.filter((r) => r.title.startsWith('Webブラウザ：'));
          assert.equal(browserRows.length, 2);
          if (name === 'マウスジェスチャー') {
            assert.equal(rows.filter((r) => r.title.startsWith('操作感：')).length, 2);
            assert.equal(rows.filter((r) => r.title.startsWith('待機表示：')).length, 3);
          }
          assert(
            rows.every((r) => Math.abs(r.field.width - rows[0].field.width) < 1),
            'separators span the same full row',
          );
          assert(
            rows.slice(0, -1).every((r) => parseFloat(r.border) > 0),
            'all preceding rows have separators',
          );
          await options.scrollIntoViewIfNeeded();
          await screenshot(`${theme}-${width}-${name}`);
          if (name === 'ショートカットキー')
            bindingListAppearance = await tableAppearance(
              page.locator('.command-shortcuts .applet-shortcut-overview'),
            );
        }
        await select('通知');
        const notifications = page.locator('.notification-settings');
        const ownerCards = notifications.locator(':scope > [aria-label$="の通知"]');
        assert((await ownerCards.count()) > 0);
        for (const ownerCard of await ownerCards.all()) {
          const layout = await ownerCard.evaluate((e) => {
            const style = getComputedStyle(e);
            const rows = [...e.querySelectorAll('.notification-setting-card')].map((card) =>
              card.getBoundingClientRect(),
            );
            return {
              border: parseFloat(style.borderTopWidth),
              radius: parseFloat(style.borderRadius),
              background: style.backgroundColor,
              gaps: rows.slice(1).map((row, index) => row.top - rows[index].bottom),
              separators: [...e.querySelectorAll('.notification-setting-card')]
                .slice(0, -1)
                .map((row) => parseFloat(getComputedStyle(row).borderBottomWidth)),
            };
          });
          assert(
            layout.border > 0 && layout.radius >= 10 && layout.background !== 'rgba(0, 0, 0, 0)',
            'notification owner is a surfaced card',
          );
          assert(
            layout.gaps.every((gap) => Math.abs(gap) < 1) &&
              layout.separators.every((border) => border > 0),
            'notification rows meet at full-width separators inside the owner card',
          );
          if (theme === 'dark') {
            const borderColor = await ownerCard.evaluate((e) => getComputedStyle(e).borderTopColor);
            assert(contrast(borderColor, layout.background) >= 2, 'dark owner border is visible');
          }
          measurements.push({ type: 'notification-owner', theme, width, ...layout });
        }
        for (const name of ['読み上げ', 'MCP Event']) {
          const card = notifications
            .locator(':scope > .settings-section')
            .filter({ has: page.getByRole('heading', { name, exact: true }) });
          if (!(await card.evaluate((e) => e.open))) await card.locator(':scope > summary').click();
          await fields(
            card,
            await page.locator('.settings-page-layout').evaluate((e) => e.clientWidth <= 660),
          );
          await card.scrollIntoViewIfNeeded();
          await screenshot(`${theme}-${width}-notification-${name.replaceAll(' ', '-')}`);
        }
        const cards = await notifications
          .locator('.notification-setting-card')
          .evaluateAll((elements) =>
            elements.map((e) => ({
              border: getComputedStyle(e).borderTopWidth,
              radius: parseFloat(getComputedStyle(e).borderRadius),
              background: getComputedStyle(e).backgroundColor,
              borderColor: getComputedStyle(e).borderColor,
              titleSize: getComputedStyle(e.querySelector('summary h2')).fontSize,
              icon: e.querySelector('.settings-section-toggle').getBoundingClientRect().toJSON(),
              width: e.getBoundingClientRect().width,
              summaryWidth: e.querySelector('summary').getBoundingClientRect().width,
            })),
          );
        assert(cards.length >= 2);
        for (const card of cards) {
          assert.equal(parseFloat(card.border), 0, 'notification row has no extra card frame');
          assert(
            card.radius === 0 && card.background === 'rgba(0, 0, 0, 0)',
            'notification row uses the containing card surface',
          );
          assert.equal(card.titleSize, '13px', 'row title matches a SettingsField title');
          assert(card.icon.width >= 24 && card.icon.height >= 24, 'disclosure icon is visible');
          assert(
            card.summaryWidth >= card.width + 15.9,
            'disclosure target includes horizontal highlight insets',
          );
        }
        measurements.push({ type: 'cards', theme, width, cards });
        const errorCard = notifications
          .locator('.notification-setting-card')
          .filter({ has: page.getByRole('heading', { name: 'エラー通知', exact: true }) });
        await errorCard.scrollIntoViewIfNeeded();
        await screenshot(`${theme}-${width}-notification-rows-collapsed`);
        const savedNotifications = await page.evaluate(
          async () => (await window.dock.snapshot()).settings.value.notificationPreferences,
        );
        const summary = errorCard.locator(':scope > summary');
        if (await errorCard.evaluate((e) => e.open)) await summary.click();
        await page.mouse.move(2, 2);
        const idle = await disclosureLayout(summary);
        assertDisclosurePadding(idle);
        await summary.hover();
        const hovered = await disclosureLayout(summary);
        assertDisclosureColors(hovered);
        for (const key of ['summary', 'title', 'description', 'icon'])
          assert.deepEqual(hovered[key], idle[key], 'hover preserves ' + key + ' geometry');
        measurements.push({ type: 'disclosure-highlight', theme, width, idle, hovered });
        await screenshot(`${theme}-${width}-notification-hover`);
        await summary.focus();
        await summary.press('Enter');
        assert(await errorCard.evaluate((e) => e.open), 'Enter expands the row');
        await page.mouse.move(2, 2);
        assertDisclosureColors(await disclosureLayout(summary));
        assert(
          await summary.evaluate((e) => parseFloat(getComputedStyle(e).outlineWidth) >= 2),
          'keyboard focus is visible',
        );
        await summary.press('Space');
        assert(!(await errorCard.evaluate((e) => e.open)), 'Space collapses the row');
        const summaryBox = await summary.boundingBox();
        await summary.click({ position: { x: summaryBox.width - 14, y: summaryBox.height / 2 } });
        assert(
          await errorCard.evaluate((e) => e.open),
          'clicking the disclosure icon expands the row',
        );
        assert.deepEqual(
          await page.evaluate(
            async () => (await window.dock.snapshot()).settings.value.notificationPreferences,
          ),
          savedNotifications,
          'opening and closing rows never changes saved notification settings',
        );
        assert(await errorCard.getByLabel('エラー通知のバナー', { exact: true }).isDisabled());
        await fields(
          errorCard,
          await page.locator('.settings-page-layout').evaluate((e) => e.clientWidth <= 660),
        );
        await errorCard.scrollIntoViewIfNeeded();
        await screenshot(`${theme}-${width}-notification-card`);
        assert.equal(
          await page.locator('.settings-body').evaluate((e) => e.scrollWidth > e.clientWidth + 2),
          false,
          'highlight does not introduce horizontal scrolling',
        );
        await select('操作の許可');
        const publication = page.getByRole('region', { name: '操作の許可', exact: true });
        assert.equal(await publication.locator(':scope > .permission-table').count(), 1);
        assert.equal(
          await page.getByRole('heading', { name: 'APIの公開', exact: true }).count(),
          0,
        );
        assert(
          await publication.evaluate((e) => {
            const help = e.querySelector(':scope > details.settings-section');
            const table = e.querySelector(':scope > .permission-table');
            return (
              !!help &&
              !help.open &&
              !!(help.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING)
            );
          }),
          'collapsed help card precedes the top-level permission table',
        );
        const background = await page.locator('.permission-table').evaluate((e) => {
          const sample = document.createElement('span');
          sample.style.background = 'var(--panel)';
          e.append(sample);
          const result = {
            table: getComputedStyle(e).backgroundColor,
            card: getComputedStyle(sample).backgroundColor,
          };
          sample.remove();
          return result;
        });
        assert.equal(background.table, background.card, 'permissions use the card background');
        const permissionAppearance = await tableAppearance(page.locator('.permission-table'));
        await screenshot(`${theme}-${width}-permissions-top-level`);
        assert.deepEqual(
          permissionAppearance,
          bindingListAppearance,
          'permission frame matches CommandBindingList',
        );
        measurements.push({ type: 'permission-frame', theme, width, permissionAppearance });
        await screenshot(`${theme}-${width}-permissions`);
        await select('MCPサーバー');
        const group = page.getByRole('region', { name: '認証の設定例', exact: true });
        const spacing = await group.evaluate(
          (e) =>
            e.querySelector('header').getBoundingClientRect().top - e.getBoundingClientRect().top,
        );
        assert(spacing >= 16, 'unframed section heading has top spacing');
        measurements.push({ type: 'section-group-spacing', theme, width, spacing });
        await group.scrollIntoViewIfNeeded();
        await screenshot(`${theme}-${width}-section-group`);
        if (portable) {
          await select('Applet管理');
          await page.getByRole('button', { name: 'Appletをインストール', exact: true }).click();
          const dialog = page.getByRole('dialog');
          const sourceField = dialog.getByRole('group', { name: '配布元', exact: true });
          assert.equal(
            await sourceField.locator('.settings-field-label strong').innerText(),
            '配布元',
          );
          assert.equal(
            await sourceField.locator('.settings-field-label p').innerText(),
            'URLまたはフォルダー',
          );
          await centered(
            dialog.getByRole('button', { name: 'インストールして再起動', exact: true }),
          );
          await screenshot(`${theme}-${width}-install`);
          await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
        }
        await select('AI');
        const before = await page.evaluate(
          async () => (await window.dock.snapshot()).settings.value.ai,
        );
        await page.getByRole('button', { name: 'AIサーバーを追加', exact: true }).click();
        const dialog = page.getByRole('dialog');
        assert.equal(
          await dialog.locator('.settings-section, details').count(),
          0,
          'AI settings are flat',
        );
        assert.equal(await dialog.locator('.settings-dialog-fields > .settings-field').count(), 11);
        await fields(dialog, await dialog.evaluate((e) => e.clientWidth - 48 <= 520));
        await centered(dialog.getByRole('button', { name: 'OK', exact: true }));
        await screenshot(`${theme}-${width}-ai-top`);
        await dialog.getByLabel('AIの保存指定', { exact: true }).scrollIntoViewIfNeeded();
        await screenshot(`${theme}-${width}-ai-options`);
        await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
        assert.deepEqual(
          await page.evaluate(async () => (await window.dock.snapshot()).settings.value.ai),
          before,
          'cancel keeps saved AI settings',
        );
        assert.equal(
          await page.locator('.settings-body').evaluate((e) => e.scrollWidth > e.clientWidth + 2),
          false,
        );
        checks.push(
          `${theme} ${width}: fields, full separators, group captions, notification cards, permissions, flat AI and centered actions`,
        );
      }
    }
    const { accentChoices } = require('../out/main/shared/appearance');
    for (const theme of ['light', 'dark']) {
      await select('表示');
      await page.getByLabel('テーマ', { exact: true }).selectOption(theme);
      await settleSettings(page);
      for (const palette of accentChoices) {
        await select('表示');
        await page
          .getByRole('group', { name: 'アクセントカラー', exact: true })
          .getByRole('button', { name: palette.title, exact: true })
          .click();
        await settleSettings(page);
        await page.waitForFunction(
          (id) => document.documentElement.dataset.accent === id,
          palette.id,
        );
        await select('通知');
        const summary = page.locator('.notification-setting-card > summary').first();
        await summary.hover();
        const sample = await disclosureLayout(summary);
        assertDisclosurePadding(sample);
        assertDisclosureColors(sample);
        measurements.push({ type: 'disclosure-palette', theme, palette: palette.id, sample });
        await screenshot(`${theme}-palette-${palette.id}-notification-hover`);
      }
    }
    checks.push(
      'notification highlights keep padded geometry and readable soft accent colors for all presets and custom in both themes',
    );
    await select('AI');
    await page.getByRole('button', { name: 'AIサーバーを追加', exact: true }).click();
    let aiDialog = page.getByRole('dialog');
    const savedBefore = await page.evaluate(
      async () => (await window.dock.snapshot()).settings.value.ai,
    );
    await aiDialog.getByLabel('AI接続の名前', { exact: true }).fill('Layout probe');
    await aiDialog.getByLabel('AIのAPIのURL', { exact: true }).fill('http://127.0.0.1:1/v1');
    await aiDialog.getByLabel('AIの既定の出力トークン上限', { exact: true }).fill('16384');
    await aiDialog.getByLabel('AIの既定の待ち時間（秒）', { exact: true }).fill('120');
    assert.deepEqual(
      await page.evaluate(async () => (await window.dock.snapshot()).settings.value.ai),
      savedBefore,
      'AI edits stay local until OK',
    );
    await aiDialog.getByRole('button', { name: 'OK', exact: true }).click();
    await aiDialog.waitFor({ state: 'hidden' });
    const saved = await page.evaluate(async () => (await window.dock.snapshot()).settings.value.ai);
    const connection = saved.connections.find((c) => c.name === 'Layout probe');
    assert.equal(connection.defaultMaxOutputTokens, 16384);
    assert.equal(connection.defaultTimeoutSeconds, 120);
    assert.equal(connection.baseUrl, 'http://127.0.0.1:1/v1');
    await page.getByRole('button', { name: 'Layout probeの設定', exact: true }).click();
    aiDialog = page.getByRole('dialog');
    assert.equal(
      await aiDialog.getByLabel('AIの既定の待ち時間（秒）', { exact: true }).inputValue(),
      '120',
    );
    await aiDialog.getByLabel('AIのTemperature', { exact: true }).fill('0.7');
    await aiDialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    assert.deepEqual(
      await page.evaluate(async () => (await window.dock.snapshot()).settings.value.ai),
      saved,
    );
    checks.push(
      'flat AI fields retain local drafts, persist limits on OK and discard edits on cancel',
    );
    await page.evaluate(() => window.dock.executeCommand('appdock.settings.showHints.off'));
    await settleSettings(page);
    await select('マウスジェスチャー');
    const options = page
      .locator('details.settings-section')
      .filter({ has: page.getByRole('heading', { name: '動作設定', exact: true }) });
    await options.locator(':scope > summary').click();
    assert.equal(await options.locator('.settings-field-group').count(), 7);
    assert.equal(await page.locator('.settings-hint-icon').count(), 0);
    checks.push(
      'group context stays visible with hints off; saved values and required notification targets are preserved',
    );
    assert.deepEqual(errors, []);
    success = true;
  } catch (error) {
    fs.writeFileSync(path.join(profile, 'failure.txt'), error.stack || String(error));
    console.error(error);
    process.exitCode = 1;
    if (page) await screenshot('failure').catch(() => {});
  } finally {
    if (app)
      await app.close().catch((error) => {
        errors.push(error.message);
        success = false;
        process.exitCode = 1;
      });
    const result = {
      success,
      checks,
      errors,
      profile,
      version: require('../package.json').version,
      portable: process.argv[2] ? hash(process.argv[2]) : null,
    };
    fs.writeFileSync(
      path.join(profile, 'measurements.json'),
      JSON.stringify(measurements, null, 2),
    );
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  }
})();
