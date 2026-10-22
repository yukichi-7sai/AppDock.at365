const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { _electron } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.artifacts', `applet-install-dialog-ui-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
const checks = [],
  errors = [];
const until = async (fn) => {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw Error('UI state did not settle');
};
const same = (a, b) => {
  for (const selector of Object.keys(a))
    for (const key of ['x', 'y', 'width', 'height'])
      assert(
        Math.abs(a[selector][key] - b[selector][key]) < 0.6,
        `${selector} ${key} moved: ${a[selector][key]} -> ${b[selector][key]}`,
      );
};
(async () => {
  let app, page;
  const result = { ok: false, output, checks, errors };
  try {
    const { build } = await import('vite');
    const { default: react } = await import('@vitejs/plugin-react');
    await build({
      configFile: false,
      root: path.join(root, 'tests/fixtures/applet-install-ui'),
      base: './',
      plugins: [react()],
      logLevel: 'error',
      build: { outDir: path.join(output, 'view'), emptyOutDir: false },
    });
    const bootstrap = path.join(output, 'main.cjs');
    fs.writeFileSync(
      bootstrap,
      `const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const w=new BrowserWindow({width:1280,height:900,webPreferences:{contextIsolation:true}});w.loadFile(${JSON.stringify(path.join(output, 'view/index.html'))});});`,
    );
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await _electron.launch({ executablePath: require('electron'), args: [bootstrap], env });
    page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    page.on('pageerror', (e) => errors.push(e.message));
    const open = () =>
      page.getByRole('button', { name: 'Appletをインストール', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const apply = dialog.getByRole('button', { name: 'インストールして再起動', exact: true });
    const source = dialog.getByLabel('Appletの配布元');
    const geometry = () =>
      dialog.evaluate((element) =>
        Object.fromEntries(
          ['input', 'footer', '.primary', '.primary .settings-action-label', '.settings-error']
            .map((selector) => [
              selector,
              element.querySelector(selector).getBoundingClientRect().toJSON(),
            ])
            .concat([['dialog', element.getBoundingClientRect().toJSON()]]),
        ),
      );
    const longError =
      '配布元を読み取れませんでした。'.repeat(55) +
      '\nフォルダーの内容を確認して、もう一度インストールしてください。';
    for (const theme of ['light', 'dark']) {
      await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
      for (const width of [1280, 760, 390]) {
        await page.evaluate(() => {
          window.installFailure = '配布元のURLまたはフォルダーを入力してください。';
        });
        await page.setViewportSize({ width, height: 900 });
        await open();
        assert.equal(
          await dialog.getByRole('button', { name: '内容を確認', exact: true }).count(),
          0,
        );
        const before = await geometry();
        assert(await dialog.getByRole('button', { name: 'エラーの詳細' }).isHidden());
        await apply.click();
        await dialog.getByRole('alert').filter({ hasText: '配布元' }).waitFor();
        same(before, await geometry());
        const icon = dialog.getByRole('button', { name: 'エラーの詳細' });
        const details = dialog.getByRole('tooltip');
        await icon.hover();
        await details.waitFor();
        const anchor = await icon.boundingBox();
        const shortTip = await details.boundingBox();
        assert(Math.abs(shortTip.y - (anchor.y + anchor.height + 6)) < 1);
        assert(shortTip.x <= anchor.x + anchor.width && shortTip.x + shortTip.width >= anchor.x);
        await page.screenshot({ path: path.join(output, `tooltip-short-${theme}-${width}.png`) });
        // Move the pointer without Playwright scrolling the tooltip's ancestor into view.
        await page.mouse.move(shortTip.x + shortTip.width / 2, shortTip.y + shortTip.height / 2);
        assert(await details.isVisible());
        await dialog.getByRole('heading').hover();
        await details.waitFor({ state: 'hidden' });
        await source.fill('C:\\Applet 配布\\Sample');
        await source.press('Enter');
        same(before, await geometry());
        assert.match(await dialog.getByRole('alert').innerText(), /配布元/);
        await page.evaluate((error) => (window.installFailure = error), longError);
        await apply.click();
        await until(async () =>
          (await dialog.getByRole('alert').textContent()).includes(longError),
        );
        same(before, await geometry());
        await icon.focus();
        await details.waitFor();
        assert(await icon.evaluate((e) => document.activeElement === e));
        await page.keyboard.press('PageDown');
        await until(() => details.evaluate((e) => e.scrollTop > 0));
        assert((await details.innerText()).includes(longError));
        same(before, await geometry());
        const bounds = await details.boundingBox();
        assert(
          bounds.x >= 0 &&
            bounds.y >= 0 &&
            bounds.x + bounds.width <= width + 1 &&
            bounds.y + bounds.height <= 901,
        );
        await page.screenshot({ path: path.join(output, `error-details-${theme}-${width}.png`) });
        await page.keyboard.press('Escape');
        assert(await details.isHidden());
        assert(await dialog.isVisible());
        assert(
          await dialog
            .getByRole('button', { name: 'エラーの詳細' })
            .evaluate((e) => e === document.activeElement),
        );
        await page.screenshot({ path: path.join(output, `error-${theme}-${width}.png`) });
        await icon.click();
        await details.waitFor();
        await dialog.getByRole('heading').click();
        assert(await details.isHidden());
        await icon.focus();
        await details.waitFor();
        await page.setViewportSize({ width, height: 880 });
        await details.waitFor({ state: 'hidden' });
        await page.setViewportSize({ width, height: 900 });
        await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
      }
    }
    checks.push(
      'anchored-hover-focus-click-tooltip-with-scroll-escape-outside-resize-and-stable-layout-in-both-themes-at-three-widths',
    );
    await page.setViewportSize({ width: 760, height: 420 });
    await open();
    await apply.click();
    await dialog.getByRole('alert').filter({ hasText: '配布元' }).waitFor();
    const small = await geometry();
    assert(small.dialog.y >= 0 && small.dialog.y + small.dialog.height <= 421);
    assert(small.footer.y + small.footer.height <= small.dialog.y + small.dialog.height);
    await dialog.getByRole('button', { name: 'エラーの詳細' }).focus();
    const smallTip = dialog.getByRole('tooltip');
    await smallTip.waitFor();
    const smallBounds = await smallTip.boundingBox();
    assert(smallBounds.y >= 8 && smallBounds.y + smallBounds.height <= 413);
    await page.keyboard.press('Escape');
    await page.screenshot({ path: path.join(output, 'error-short-window.png') });
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    checks.push('short-window-keeps-footer-visible-without-growing-the-error-line');
    await page.setViewportSize({ width: 760, height: 900 });
    await open();
    await dialog.getByRole('button', { name: '配布フォルダーを選ぶ' }).click();
    await until(async () => (await source.inputValue()) === 'C:\\Applet 配布\\Sample');
    await source.fill('C:\\unconfirmed');
    await source.press('Escape');
    assert.equal(await source.inputValue(), 'C:\\Applet 配布\\Sample');
    checks.push('folder-picker-and-escape-cancel-use-local-confirmed-input');
    await page.evaluate(() => {
      window.installFailure = '';
      window.installDelay = true;
      window.installCalls = [];
    });
    const beforePending = await geometry();
    await apply.evaluate((element) => {
      element.click();
      element.click();
    });
    await until(() => page.evaluate(() => typeof window.releaseInstall === 'function'));
    const duringPending = await geometry();
    same(beforePending, duringPending);
    const button = duringPending['.primary'];
    const label = duringPending['.primary .settings-action-label'];
    assert(Math.abs(label.x + label.width / 2 - button.x - button.width / 2) < 0.75);
    assert(await apply.isDisabled());
    assert(await source.isDisabled());
    assert(await dialog.getByRole('button', { name: 'キャンセル', exact: true }).isEnabled());
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await page.evaluate(() => window.releaseInstall());
    await until(() =>
      page.evaluate(() => window.installCalls.some((c) => c.name === 'discardAppletPackage')),
    );
    const cancelled = await page.evaluate(() => window.installCalls);
    assert.equal(cancelled.filter((c) => c.name === 'prepareAppletInstall').length, 1);
    assert(cancelled.some((c) => c.name === 'cancelAppletPackagePreview'));
    assert(!cancelled.some((c) => c.name === 'applyAppletPackage'));
    checks.push('cancelled-validation-discards-a-late-plan-without-installing');
    await page.evaluate(() => {
      window.installDelay = false;
      window.applyFailure = '導入前に配布物が変更されました。';
      window.installCalls = [];
    });
    await open();
    await source.fill('C:\\retry');
    const beforeApplyError = await geometry();
    await apply.click();
    await dialog.getByRole('alert').filter({ hasText: '導入前' }).waitFor();
    same(beforeApplyError, await geometry());
    assert.equal(await source.inputValue(), 'C:\\retry');
    assert.equal(await page.locator('[role="alert"]').count(), 1);
    await page.evaluate(() => (window.applyFailure = ''));
    await apply.click();
    await dialog.waitFor({ state: 'hidden' });
    const applied = await page.evaluate(() => window.installCalls);
    assert.equal(applied.filter((c) => c.name === 'prepareAppletInstall').length, 2);
    assert.equal(applied.filter((c) => c.name === 'applyAppletPackage').length, 2);
    checks.push('one-button-validates-then-applies-and-retries-local-errors-without-losing-input');
    assert.deepEqual(errors, []);
    result.ok = true;
  } catch (error) {
    result.error = String(error.stack || error);
    process.exitCode = 1;
    await page?.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  } finally {
    await app?.close().catch(() => {});
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
