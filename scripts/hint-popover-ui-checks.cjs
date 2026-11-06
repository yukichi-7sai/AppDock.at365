const assert = require('node:assert/strict');
const path = require('node:path');

/** Exercise shared hint behavior without freezing unrelated settings page layout. */
module.exports = async ({ host, select, hints, checks, profile }) => {
  await select('表示');
  await hints(true);
  const theme = host.getByRole('button', { name: 'テーマのヒント', exact: true });
  const popup = host.locator('.settings-hint-tooltip:popover-open');
  await theme.hover();
  await popup.waitFor();
  assert.match(await popup.innerText(), /ワークスペースの明るさ/);
  await popup.hover();
  assert(await popup.isVisible(), 'pointer transfer retains the explanation');
  await host.keyboard.press('Escape');
  await popup.waitFor({ state: 'hidden' });
  await theme.focus();
  await popup.waitFor();
  await host.keyboard.press('Escape');
  await popup.waitFor({ state: 'hidden' });
  assert(await theme.evaluate((node) => document.activeElement === node));
  await theme.click();
  await popup.waitFor();
  await host.getByRole('heading', { name: '表示', level: 1, exact: true }).click();
  await popup.waitFor({ state: 'hidden' });
  checks.push('settings hints support hover transfer, keyboard focus, Escape and outside click');
  await theme.hover();
  await popup.waitFor();
  await hints(false);
  assert.equal(await host.locator('.settings-hint-trigger').count(), 0);
  assert.equal(await host.locator('.settings-hint-tooltip').count(), 0);
  await hints(true);
  await theme.waitFor();
  checks.push('optional hint visibility removes triggers and popovers and restores them');

  await select('カスタムコマンド');
  await host.getByRole('button', { name: 'コマンドを追加', exact: true }).click();
  const dialog = host.locator('dialog[open]');
  await dialog.getByLabel('種類', { exact: true }).selectOption('appdock.process.start');
  const argumentsHint = dialog.getByRole('button', { name: '引数のヒント', exact: true });
  await argumentsHint.scrollIntoViewIfNeeded();
  await argumentsHint.focus();
  await popup.waitFor();
  assert.match(await popup.innerText(), /文字列のJSON配列/);
  assert(
    await popup.evaluate((node) => {
      const r = node.getBoundingClientRect();
      return (
        r.left >= 0 &&
        r.right <= innerWidth &&
        r.top >= 0 &&
        r.bottom <= innerHeight &&
        node.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2))
      );
    }),
    'popover stays above modal clipping and inside the viewport',
  );
  await host.screenshot({ path: path.join(profile, 'shared-hint-modal.png') });
  await host.keyboard.press('Escape');
  await popup.waitFor({ state: 'hidden' });
  assert(await dialog.isVisible(), 'Escape only dismisses the hint');
  await argumentsHint.blur();
  await argumentsHint.focus();
  await popup.waitFor();
  await hints(false);
  assert.equal(await dialog.locator('.settings-hint-trigger').count(), 0);
  assert.equal(await dialog.locator('.settings-hint-icon .settings-hint-tooltip').count(), 0);
  assert.equal(
    await popup.count(),
    0,
    'optional hint closes while command descriptions remain available',
  );
  await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
  checks.push(
    'modal hints stay on the top layer; Escape and hint OFF preserve the editor until cancelled',
  );
};
