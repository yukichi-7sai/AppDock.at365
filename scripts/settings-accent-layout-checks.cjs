const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { settleSettings } = require('./settings-immediate-helper.cjs');
const { ribbonPage } = require('./shell-overlay-helper.cjs');
const { accentPalettes } = require('../out/main/shared/appearance');
function contrast(a, b) {
  const luminance = (s) => {
    const rgb = s
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map(Number)
      .map((n) => n / 255)
      .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4));
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
module.exports = async function ({
  host,
  select,
  snapshot,
  until,
  inspect,
  inspector,
  electronExpression,
  profile,
  checks,
  portable,
}) {
  const samples = [],
    bars = [];
  const change = (patch) =>
    host.evaluate(async (patch) => {
      const s = await window.dock.snapshot();
      await window.dock.saveSettings(
        { ...s.settings.value, host: { ...s.settings.value.host, ...patch } },
        s.settings.revision,
      );
    }, patch);
  const read = async (button, state, palette, theme, kind) => {
    const style = await button.evaluate((e) => {
      const s = getComputedStyle(e);
      return { color: s.color, background: s.backgroundColor, filter: s.filter };
    });
    const ratio = contrast(style.color, style.background);
    samples.push({ state, palette, theme, kind, ...style, ratio });
    assert(ratio >= 4.5, JSON.stringify(samples.at(-1)));
    assert.equal(style.filter, 'none');
    return [style.color, style.background];
  };
  const palettes = [
    ...accentPalettes.map((p) => ({ id: p.id })),
    { id: 'custom', dark: '#000000', light: '#FFFFFF' },
    { id: 'custom', dark: '#FFFFFF', light: '#000000' },
    { id: 'sky-blue' },
  ];
  for (const theme of ['light', 'dark']) {
    for (const palette of palettes) {
      await change({
        theme,
        accentColor: palette.id,
        ...(palette.dark
          ? { customAccentDark: palette.dark, customAccentLight: palette.light }
          : {}),
      });
      await until(
        () => host.evaluate((theme) => document.documentElement.dataset.theme === theme, theme),
        'theme applied',
      );
      const colors = [];
      for (const [page, kind, selector] of [
        ['バージョン情報・更新', 'update', '.update-primary'],
        [portable ? 'Applet管理' : 'AI', 'add', '.applet-shortcut-add'],
      ]) {
        await select(page);
        const button = host.locator(selector).first();
        assert(await button.isEnabled());
        await host.getByRole('heading', { level: 1, exact: true, name: page }).hover();
        const normal = await read(button, 'normal', palette.id, theme, kind);
        await button.hover();
        const hover = await read(button, 'hover', palette.id, theme, kind);
        colors.push({ normal, hover });
      }
      assert.deepEqual(colors[0], colors[1], 'update and add use the same accent states');
    }
  }
  checks.push(`accent-update-and-add-${samples.length}-normal-hover-contrasts`);
  for (const theme of ['light', 'dark']) {
    await change({ theme, accentColor: 'alice-blue' });
    for (const width of [1280, 760]) {
      await inspect(
        inspector,
        `${electronExpression}.BrowserWindow.getAllWindows()[0].setSize(${width},1000)`,
      );
      await select('ショートカット');
      const flat = await host.locator('.settings-body').evaluate((e) => {
        const s = getComputedStyle(e),
          card = e.querySelector('.shortcuts-editor');
        return {
          border: s.borderTopWidth,
          padding: s.paddingLeft,
          background: s.backgroundColor,
          inset: card.getBoundingClientRect().left - e.getBoundingClientRect().left,
        };
      });
      assert.equal(flat.border, '0px');
      assert.equal(flat.padding, '0px');
      assert.equal(flat.background, 'rgba(0, 0, 0, 0)');
      assert(Math.abs(flat.inset) < 0.1);
      for (const page of [
        'ショートカット',
        'マウスジェスチャー',
        'AI',
        'カスタムコマンド',
        'MCPクライアント',
        'Applet管理',
      ]) {
        await select(page);
        const order = host
          .locator('button.accent-action')
          .filter({ has: host.locator('svg') })
          .first();
        assert(await order.count(), page + ' order accent');
      }
      await select('リボン');
      for (const position of ['上寄せ', '下寄せ']) {
        const region = host.getByRole('region', { name: position + 'のリボン設定', exact: true });
        assert.deepEqual(await region.locator('.ribbon-setting-actions button').allTextContents(), [
          '＋ コマンド',
          '＋ グループ',
          '＋ 区切り線',
        ]);
        assert.equal(await region.locator('.ribbon-setting-actions .accent-action').count(), 3);
        const inset = await region
          .locator('.ribbon-group-heading')
          .evaluate(
            (e) =>
              e.querySelector('button').getBoundingClientRect().left -
              e.getBoundingClientRect().left,
          );
        assert(inset < 120, 'ribbon add actions start beside the left heading');
      }
      const top = host.getByRole('region', { name: '上寄せのリボン設定', exact: true });
      await top.getByRole('button', { name: '＋ コマンド', exact: true }).click();
      const dialog = host.getByRole('dialog', { name: 'コマンドボタンを追加', exact: true });
      const command = dialog.locator('.ribbon-command-field');
      const geometry = await command.evaluate((e) => {
        const label = e.querySelector('span'),
          button = e.querySelector('button');
        const name = e.parentElement.querySelector('label'),
          icon = e.parentElement.querySelector('.ribbon-icon-picker > span');
        const style = (n) => [getComputedStyle(n).fontSize, getComputedStyle(n).fontWeight];
        return {
          label: style(label),
          name: style(name),
          icon: style(icon),
          gap: button.getBoundingClientRect().top - label.getBoundingClientRect().bottom,
        };
      });
      assert.deepEqual(geometry.label, geometry.name);
      assert.deepEqual(geometry.label, geometry.icon);
      assert(geometry.gap >= 7, 'command picker is on the next row');
      await host.screenshot({ path: path.join(profile, `ribbon-command-${theme}-${width}.png`) });
      await host.keyboard.press('Escape');
      await until(async () => (await host.locator('dialog[open]').count()) === 0, 'command cancel');
      assert(await host.locator('.ribbon-row-controls button.accent-action').count());
      await host.screenshot({ path: path.join(profile, `ribbon-actions-${theme}-${width}.png`) });
      await select('タスクトレイ');
      const behavior = host.getByRole('region', { name: '動作設定', exact: true });
      assert.equal(await behavior.locator('header .settings-hint-trigger').count(), 0);
      const widths = await behavior
        .locator('.tray-click-controls > button')
        .evaluateAll((buttons) =>
          buttons.map(
            (e) => e.getBoundingClientRect().width - e.parentElement.getBoundingClientRect().width,
          ),
        );
      assert(
        widths.length >= 2 && widths.every((x) => Math.abs(x) < 0.1),
        'tray click buttons fill their control width',
      );
      assert.equal(await host.locator('.tray-toolbar > button.accent-action').count(), 3);
      const rows = host.locator('[data-tray-item]');
      assert.equal(await rows.locator('.tray-row-controls').count(), await rows.count());
      assert.equal(await host.locator('.tray-item-editor .tray-toolbar').count(), 0);
      await host.screenshot({ path: path.join(profile, `tray-actions-${theme}-${width}.png`) });
      checks.push(`shortcut-frame-ribbon-dialog-tray-layout-${theme}-${width}`);
    }
  }
  await select('リボン');
  const top = host.getByRole('region', { name: '上寄せのリボン設定', exact: true });
  for (let i = 0; i < 2; i++) {
    await top.getByRole('button', { name: '＋ 区切り線', exact: true }).click();
    await settleSettings(host);
  }
  const separators = (await snapshot()).settings.value.ribbon.separators;
  assert.equal(separators.length, 2);
  for (const id of separators)
    assert.equal(
      await host
        .locator(`[data-ribbon-setting="${id}"] label > span`)
        .evaluate((e) => e.firstChild.textContent),
      '区切り線',
    );
  checks.push('new-separators-share-unnumbered-default-title');
  await select('タスクトレイ');
  const group = host.locator('[data-tray-item="tray.group"]');
  await group.getByTitle('下へ移動', { exact: true }).click();
  await settleSettings(host);
  assert.equal((await snapshot()).settings.value.trayMenu.at(-1).id, 'tray.group');
  await group.getByTitle('上へ移動', { exact: true }).click();
  await settleSettings(host);
  assert.equal((await snapshot()).settings.value.trayMenu[1].id, 'tray.group');
  await group.getByTitle('グループを解除', { exact: true }).click();
  await settleSettings(host);
  assert.deepEqual(
    (await snapshot()).settings.value.trayMenu.map((r) => r.id),
    ['tray.first', 'tray.child', 'tray.last'],
  );
  await host
    .locator('[data-tray-item="tray.last"]')
    .getByTitle('メニューから外す', { exact: true })
    .click();
  await settleSettings(host);
  assert.deepEqual(
    (await snapshot()).settings.value.trayMenu.map((r) => r.id),
    ['tray.first', 'tray.child'],
  );
  checks.push('embedded-tray-move-ungroup-preserves-children-and-delete-save');
  const rail = await ribbonPage(host);
  const groupButton = rail.locator('[data-ribbon-id="group:color"]');
  if ((await groupButton.getAttribute('aria-expanded')) !== 'true') await groupButton.click();
  const children = rail.locator('.ribbon-children').first();
  await children.locator('[data-ribbon-id="home"]').click();
  await until(
    async () =>
      /active/.test(await children.locator('[data-ribbon-id="home"]').getAttribute('class')),
    'selected ribbon child',
  );
  for (const state of ['selected', 'hover', 'focus']) {
    const button = children.locator('[data-ribbon-id="logs"]');
    if (state === 'hover') await button.hover();
    if (state === 'focus') await button.focus();
    const png = await children.screenshot({ path: path.join(profile, `ribbon-bar-${state}.png`) });
    const bitmap = await inspect(
      inspector,
      `(()=>{const i=${electronExpression}.nativeImage.createFromDataURL('data:image/png;base64,${png.toString('base64')}');return {size:i.getSize(),bits:i.toBitmap().toString('base64')};})()`,
    );
    const positions = await children.evaluate((e) => {
      const r = e.getBoundingClientRect();
      return {
        width: r.width,
        ys: [...e.querySelectorAll('button')].map((b) => {
          const v = b.getBoundingClientRect();
          return v.top + v.height / 2 - r.top;
        }),
      };
    });
    const scale = bitmap.size.width / positions.width,
      buffer = Buffer.from(bitmap.bits, 'base64');
    for (const y of positions.ys) {
      const offset = (Math.floor(y * scale) * bitmap.size.width + Math.floor(1.5 * scale)) * 4;
      const rgb = [buffer[offset + 2], buffer[offset + 1], buffer[offset]];
      bars.push({ state, rgb });
      assert.deepEqual(rgb, [210, 73, 161], 'group line paints above child highlights');
    }
    assert.equal(
      await children.evaluate((e) => getComputedStyle(e, ':after').pointerEvents),
      'none',
    );
  }
  checks.push('persistent-ribbon-bar-pixels-above-selected-hover-focus-highlights');
  fs.writeFileSync(path.join(profile, 'accent-contrast.json'), JSON.stringify(samples, null, 2));
  fs.writeFileSync(path.join(profile, 'ribbon-bar-pixels.json'), JSON.stringify(bars, null, 2));
};
