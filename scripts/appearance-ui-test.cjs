const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { freePort, inspect, electronExpression } = require('./electron-main-helper.cjs');
const { settleSettings } = require('./settings-immediate-helper.cjs');
const { waitForHost } = require('./settings-host-helper.cjs');
const { accentPalettes, resolveAppearance } = require('../out/main/shared/appearance');
const { getHostTranslator } = require('../out/main/shared/i18n');
const translate = getHostTranslator('ja');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', 'appearance-ui-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
const checks = [],
  errors = [];
const ribbonSamples = [];
const scrollbarSamples = [];
const luminance = (rgb) => {
  const [r, g, b] = rgb
    .match(/[\d.]+/g)
    .slice(0, 3)
    .map(Number)
    .map((v) => v / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
};
const contrast = (a, b) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
};
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const until = async (read, label, timeout = 60000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await read();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 80));
  }
  throw Error(label);
};
let child,
  browser,
  context,
  host,
  server,
  mainPort,
  output = '';
const source =
  process.argv[2] && !process.argv[2].startsWith('--') ? path.resolve(process.argv[2]) : null;
const scrollbarsOnly = process.argv.includes('--scrollbars-only');
const exe = source ? path.join(profile, 'AppDock.at365.exe') : require('electron');
if (source) {
  require('./copy-host.cjs').copyHost(source, exe);
  assert.equal(hash(exe), hash(source));
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
async function start() {
  const port = await freePort();
  mainPort = await freePort();
  child = spawn(
    exe,
    [
      ...(source ? [] : [root]),
      '--test-profile=' + profile,
      '--test-local-state=' + path.join(profile, 'local'),
      '--remote-debugging-port=' + port,
      '--inspect=' + mainPort,
    ],
    { cwd: root, env, windowsHide: true, stdio: 'pipe' },
  );
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));
  browser = await until(async () => {
    try {
      return await chromium.connectOverCDP('http://127.0.0.1:' + port, { timeout: 800 });
    } catch {}
  }, 'CDP');
  context = browser.contexts()[0];
  host = await until(
    () => context.pages().find((p) => p.url().startsWith('appdock://host/')),
    'host',
  );
  host.setDefaultTimeout(15000);
  await until(
    async () => (await host.evaluate(() => window.dock.snapshot())).startupReady,
    'startup',
  );
}
async function stop() {
  if (host && !host.isClosed())
    await host.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
  if (child) await until(() => child.exitCode !== null, 'exit');
  if (browser) await browser.close();
  browser = undefined;
}
async function assertColors(page, id, dark, custom) {
  const expected = resolveAppearance(id, dark, 0, custom);
  await page.waitForFunction(
    ({ id, dark, colors }) => {
      const r = document.documentElement,
        s = getComputedStyle(r);
      return (
        r.dataset.accent === id &&
        r.dataset.theme === (dark ? 'dark' : 'light') &&
        s.getPropertyValue('--accent').trim() === colors.accent &&
        s.getPropertyValue('--accent-soft').trim() === colors.soft &&
        s.getPropertyValue('--accent-text').trim() === colors.text
      );
    },
    { id, dark, colors: expected.colors },
  );
  const snapshot = await page.evaluate(() => window.appdockAppearance.snapshot());
  assert.equal(snapshot.palette, id);
  assert.equal(snapshot.dark, dark);
  scrollbarSamples.push({
    url: page.url(),
    dark,
    ...(await require('./shared-scrollbar-checks.cjs')(page, dark)),
  });
}
async function assertRibbonReadability(rail, id, dark) {
  const normal = rail
    .locator('.activity-rail button:not(:disabled):not(.active):not(.avatar):not(.error)')
    .first();
  const read = async (button, state) => {
    const sample = await button.evaluate((el) => {
      const style = getComputedStyle(el);
      const background =
        style.backgroundColor === 'rgba(0, 0, 0, 0)'
          ? getComputedStyle(el.closest('.activity-rail')).backgroundColor
          : style.backgroundColor;
      return {
        background,
        opacity: style.opacity,
        colors: [el, el.querySelector('.rail-label'), el.querySelector('svg')]
          .filter(Boolean)
          .map((node) => ({ element: node.tagName, color: getComputedStyle(node).color })),
      };
    });
    ribbonSamples.push({ id, dark, state, ...sample });
    for (const item of sample.colors)
      assert(
        contrast(item.color, sample.background) >= 4.5,
        `${id}/${dark}/${state}/${item.element}: ${item.color} on ${sample.background} = ${contrast(item.color, sample.background).toFixed(2)}`,
      );
  };
  await rail.mouse.move(0, 0);
  await read(normal, 'normal');
  await normal.hover();
  await read(normal, 'hover');
  await rail.mouse.move(0, 0);
  await normal.focus();
  await read(normal, 'focus');
  const selected = rail.locator('.activity-rail button.active:not(:disabled)').first();
  await read(selected, 'selected');
  await rail.screenshot({
    path: path.join(profile, `ribbon-${id}-${dark ? 'dark' : 'light'}.png`),
  });
}
(async () => {
  let success = false;
  try {
    server = http.createServer((_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end('<!doctype html><title>Remote fixture</title><p>Remote content</p>');
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const folder = path.join(profile, 'extensions', 'fixture.accent');
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(
      path.join(folder, 'extension.json'),
      JSON.stringify({
        apiVersion: 1,
        id: 'fixture.accent',
        name: 'Accent fixture',
        version: '1.0.0',
        runtime: 'node',
        entry: 'index.cjs',
        minimumHostVersion: '0.75.0',
        capabilities: ['pages', 'notifications'],
        commands: [
          { id: 'fixture.accent.open', title: 'Open accent fixture', activateOnExecute: true },
          { id: 'fixture.accent.notice', title: 'Scrollbar notice' },
        ],
        notificationTypes: [
          {
            typeId: 'message',
            title: 'Scrollbar fixture notice',
            description: 'Fixture',
            levels: ['info'],
            defaultLevel: 'info',
            defaultEnabled: true,
            canDisable: true,
            disabledControlReason: '',
            allowedTargets: ['banner', 'desktop'],
            defaultTargets: ['banner', 'desktop'],
            requiredTargets: [],
            lifetimePolicy: 'userDuration',
            defaultDurationSeconds: null,
            history: 'persistent',
          },
        ],
        pages: [
          {
            id: 'main',
            title: 'Accent fixture',
            source: 'local',
            ui: 'main.html',
            openCommand: 'fixture.accent.open',
          },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(folder, 'index.cjs'),
      "exports.activate=async c=>{c.commands.register('fixture.accent.open','Open accent fixture',()=>c.pages.open('main'));c.commands.register('fixture.accent.notice','Scrollbar notice',()=>c.notifications.publish({typeId:'message',title:'Scrollbar fixture',body:'Local notification surface',historyText:{title:'Scrollbar fixture',body:'Safe'}}));};",
    );
    fs.writeFileSync(
      path.join(folder, 'main.html'),
      `<!doctype html><meta charset="utf-8"><style>:root{--accent:#123456}body{--accent:#654321}#sample{color:var(--accent);background:var(--accent-soft)}</style><p id="sample">Local Applet fixture</p><iframe title="Remote fixture" src="http://127.0.0.1:${server.address().port}/"></iframe>`,
    );
    const initial = require('../out/main/shared/settings-schema').createDefaultSettings();
    initial.host.hardwareAcceleration = false;
    initial.host.closeToTray = false;
    initial.host.soundEnabled = false;
    initial.host.accentColor = 'sky-blue';
    initial.gestures.enabled = false;
    initial.keybindings = [];
    initial.globalShortcutCommands = [];
    initial.extensions['fixture.accent'] = { enabled: true, settings: {} };
    fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(initial));
    await start();
    assert.equal(
      (await host.evaluate(() => window.dock.snapshot())).version,
      require('../package.json').version,
    );
    if (scrollbarsOnly) {
      await host.evaluate(() => window.dock.executeCommand('fixture.accent.open'));
      const local = await until(
        () =>
          context
            .pages()
            .find(
              (page) => page.url().includes('fixture.accent') && page.url().endsWith('/main.html'),
            ),
        'local scrollbar fixture',
      );
      await host.evaluate(() =>
        window.dock.executeCommand('appdock.settings.command-triggers.open'),
      );
      await host.locator('.command-triggers-editor').waitFor();
      // Only this isolated process simulates notification availability; no OS setting is changed.
      await inspect(
        mainPort,
        `const e=${electronExpression};const {NotificationAvailability}=process.getBuiltinModule('module').createRequire(e.app.getAppPath()+'/package.json')('./out/main/main/core/notification-availability.js');NotificationAvailability.prototype.status=()=> 'allowed';`,
      );
      await host.evaluate(() => window.dock.executeCommand('fixture.accent.notice'));
      await until(
        () =>
          context.pages().filter((page) => page.url().endsWith('/notifications.html')).length >= 2,
        'banner and desktop notification surfaces',
      );
      await host.evaluate(() => {
        void window.dock.openCommandPalette({ requestId: 'scrollbar-preview', mode: 'execute' });
      });
      await until(
        () => context.pages().find((page) => page.url().endsWith('/command-palette/index.html')),
        'overlay',
      );
      for (const theme of ['light', 'dark'])
        for (const palette of ['mint', 'rose']) {
          await host.evaluate(
            async ({ theme, palette }) => {
              const snapshot = await window.dock.snapshot();
              await window.dock.saveSettings(
                {
                  ...snapshot.settings.value,
                  host: { ...snapshot.settings.value.host, theme, accentColor: palette },
                },
                snapshot.settings.revision,
              );
            },
            { theme, palette },
          );
          await settleSettings(host);
          let surfaces = 0;
          for (const page of context.pages()) {
            if (
              page.isClosed() ||
              !(await page
                .evaluate(() => typeof window.appdockAppearance !== 'undefined')
                .catch(() => false))
            )
              continue;
            await assertColors(page, palette, theme === 'dark');
            surfaces++;
          }
          assert(
            surfaces >= 9,
            'host, Shell, overlay, notifications and local Applet receive common scrollbars',
          );
          checks.push(`shared-scrollbars-${theme}-${palette}-${surfaces}-surfaces`);
          if (palette === 'rose')
            await host.screenshot({ path: path.join(profile, `scrollbars-${theme}.png`) });
        }
      await host.evaluate(() => window.dock.cancelCommandPalette('scrollbar-preview'));
      await local.reload();
      await assertColors(local, 'rose', true);
      checks.push('shared-scrollbars-reload-and-hidden-local-surface');
      const remote = await until(
        () => local.frames().find((frame) => frame.url().startsWith('http://127.0.0.1:')),
        'remote frame',
      );
      assert.equal(
        await remote.evaluate(() =>
          getComputedStyle(document.documentElement)
            .getPropertyValue('--appdock-scrollbar-thumb')
            .trim(),
        ),
        '',
      );
      assert.equal(await remote.evaluate(() => typeof window.appdockAppearance), 'undefined');
      checks.push('remote-frame-keeps-site-scrollbars-and-no-local-appearance-API');
      success = true;
      return;
    }
    await host.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    await host.getByRole('button', { name: '表示', exact: true }).click();
    await host.locator('.accent-palettes').waitFor();
    await assertColors(host, 'sky-blue', false);
    assert.equal(await host.getByRole('button', { name: 'スカイブルー', exact: true }).count(), 0);
    assert(await host.getByText('現在の配色: スカイブルー', { exact: true }).isVisible());
    assert.deepEqual(await host.locator('.accent-palettes button').allTextContents(), [
      'ミント',
      'アリス',
      'ワンダーランド',
      'マジカント',
      'クッキー',
      'カスタム',
    ]);
    checks.push('legacy sky-blue preserved; custom last in six choices');
    assert(
      await host
        .locator('.settings-form')
        .evaluate(
          (el) =>
            !!(
              el
                .querySelector('[aria-label="テーマ"]')
                .compareDocumentPosition(el.querySelector('.accent-palettes')) &
              Node.DOCUMENT_POSITION_FOLLOWING
            ),
        ),
    );
    checks.push('appearance setting visible');
    await host.getByLabel('テーマ', { exact: true }).selectOption('dark');
    await settleSettings(host);
    await assertRibbonReadability(
      context.pages().find((p) => /\/shells\/default\/index\.html$/.test(p.url())),
      'sky-blue',
      true,
    );
    for (const dark of [false, true]) {
      await host.getByLabel('テーマ', { exact: true }).selectOption(dark ? 'dark' : 'light');
      await settleSettings(host);
      for (const palette of accentPalettes) {
        await host
          .getByRole('button', {
            name: translate('appearance.accent.palette.' + palette.id),
            exact: true,
          })
          .click();
        await settleSettings(host);
        await assertColors(host, palette.id, dark);
        assert.equal(await host.locator('.accent-palettes [aria-pressed="true"]').count(), 1);
        const shells = context
          .pages()
          .filter((p) => /\/shells\/default\/(index|bars)\.html$/.test(p.url()));
        for (const shell of shells) await assertColors(shell, palette.id, dark);
        const rail = shells.find((p) => p.url().endsWith('/index.html'));
        await assertRibbonReadability(rail, palette.id, dark);
        checks.push(palette.id + '/' + (dark ? 'dark' : 'light'));
      }
    }
    checks.push(
      'ribbon labels/icons retain readable contrast in normal, hover, focus and selected states for all presets',
    );
    await host.getByRole('button', { name: 'カスタム', exact: true }).click();
    await host.getByLabel('テーマ', { exact: true }).selectOption('light');
    await settleSettings(host);
    const custom = { dark: '#6C3A86', light: '#F8ECFF' };
    const darkGroup = host.getByRole('group', { name: '濃い色', exact: true });
    const lightGroup = host.getByRole('group', { name: '淡い色', exact: true });
    let darkHex = darkGroup.getByRole('textbox', { name: '色のHEX値' });
    let lightHex = lightGroup.getByRole('textbox', { name: '色のHEX値' });
    const before = (await host.evaluate(() => window.dock.snapshot())).settings;
    await darkHex.fill('#12');
    assert.equal(
      (await host.evaluate(() => window.dock.snapshot())).settings.revision,
      before.revision,
    );
    await darkHex.press('Escape');
    assert.equal(await darkHex.inputValue(), before.value.host.customAccentDark);
    await darkHex.fill('#XYZ123');
    await darkHex.press('Enter');
    assert.equal(await darkHex.getAttribute('aria-invalid'), 'true');
    assert.equal(
      (await host.evaluate(() => window.dock.snapshot())).settings.value.host.customAccentDark,
      before.value.host.customAccentDark,
    );
    await darkHex.fill(custom.dark);
    await darkHex.press('Enter');
    await settleSettings(host);
    await lightHex.fill(custom.light);
    await lightHex.press('Tab');
    await settleSettings(host);
    await assertColors(host, 'custom', false, custom);
    checks.push(
      'custom HEX stays local, Escape cancels, invalid input is not saved, Enter/blur commit',
    );
    await lightGroup.getByRole('button', { name: '桃', exact: true }).click();
    await settleSettings(host);
    assert.equal(
      (await host.evaluate(() => window.dock.snapshot())).settings.value.host.customAccentLight,
      '#E7B3D1',
    );
    await lightGroup.getByLabel('自由な色', { exact: true }).evaluate((el) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '#f8ecff');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settleSettings(host);
    assert.equal(
      (await host.evaluate(() => window.dock.snapshot())).settings.value.host.customAccentLight,
      custom.light,
    );
    checks.push('custom swatches and native color input save');
    for (const dark of [false, true]) {
      await host.getByLabel('テーマ', { exact: true }).selectOption(dark ? 'dark' : 'light');
      await settleSettings(host);
      for (const page of context
        .pages()
        .filter((p) => /appdock:\/\/host\/|\/(main|bars)\.html$/.test(p.url())))
        await assertColors(page, 'custom', dark, custom);
      const rail = context.pages().find((p) => /\/shells\/default\/index\.html$/.test(p.url()));
      await assertColors(rail, 'custom', dark, custom);
      await assertRibbonReadability(rail, 'custom', dark);
      await host.screenshot({ path: path.join(profile, `custom-${dark ? 'dark' : 'light'}.png`) });
    }
    checks.push('custom shared colors in both themes');
    await host.getByRole('button', { name: 'アリス', exact: true }).click();
    await settleSettings(host);
    assert.equal(await host.locator('.accent-custom-colors').count(), 0);
    await host.getByRole('button', { name: 'カスタム', exact: true }).click();
    await settleSettings(host);
    assert.equal(await darkHex.inputValue(), custom.dark);
    assert.equal(await lightHex.inputValue(), custom.light);
    checks.push('custom colors retained across preset switching');
    await host.getByRole('button', { name: 'アリス', exact: true }).click();
    await settleSettings(host);
    await host.screenshot({ path: path.join(profile, 'appearance-dark.png') });
    await host.evaluate(() => window.dock.executeCommand('fixture.accent.open'));
    const local = await until(
      () =>
        context
          .pages()
          .find((p) => p.url().endsWith('/main.html') && p.url().includes('fixture.accent')),
      'local page',
    );
    await assertColors(local, 'alice-blue', true);
    assert.equal(
      await local.locator('#sample').evaluate((el) => getComputedStyle(el).color),
      'rgb(172, 213, 255)',
    );
    const remote = await until(
      () => local.frames().find((f) => f.url().startsWith('http://127.0.0.1:')),
      'remote frame',
    );
    assert.equal(await remote.evaluate(() => typeof window.appdockAppearance), 'undefined');
    assert.equal(
      await remote.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--appdock-scrollbar-thumb')
          .trim(),
      ),
      '',
    );
    checks.push('local Applet root/body overrides and remote isolation');
    for (const route of ['logs', 'image-library', 'notifications']) {
      await host.evaluate((route) => window.dock.navigate(route), route);
      await waitForHost(
        host,
        async (route) => (await window.dock.pages.get())?.kind === route,
        route,
      );
      const page = host;
      await assertColors(page, 'alice-blue', true);
      checks.push(route + ' late-open colors');
      if (route === 'notifications') {
        const colors = await page.evaluate(() =>
          ['warning', 'error'].map((level) => {
            const el = document.createElement('div');
            el.className = 'level-' + level;
            document.body.append(el);
            const color = getComputedStyle(el).getPropertyValue('--notification-accent').trim();
            el.remove();
            return color;
          }),
        );
        assert.deepEqual(colors, ['#d6a252', '#e37583']);
        checks.push('warning/error semantic colors');
      }
    }
    await host.evaluate(() => {
      void window.dock.openCommandPalette({ requestId: 'accent-preview', mode: 'execute' });
    });
    const overlay = await until(
      () => context.pages().find((p) => p.url().endsWith('/command-palette/index.html')),
      'overlay',
    );
    await assertColors(overlay, 'alice-blue', true);
    await host.evaluate(() => window.dock.cancelCommandPalette('accent-preview'));
    checks.push('overlay colors');
    await local.reload();
    await assertColors(local, 'alice-blue', true);
    checks.push('local reload colors');
    await host.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    await host.getByRole('button', { name: '表示', exact: true }).click();
    await host.getByLabel('テーマ', { exact: true }).selectOption('light');
    await settleSettings(host);
    await assertColors(local, 'alice-blue', false);
    checks.push('hidden Applet live updates');
    await host.getByRole('button', { name: 'カスタム', exact: true }).click();
    await settleSettings(host);
    for (const page of context
      .pages()
      .filter((p) => p.url().startsWith('appdock://host/') || p.url().startsWith('file:')))
      await assertColors(page, 'custom', false, custom);
    await local.reload();
    await assertColors(local, 'custom', false, custom);
    checks.push(
      'custom colors propagate to local Applet and all opened Shell surfaces, including reload',
    );
    await host.getByRole('button', { name: 'アリス', exact: true }).click();
    await settleSettings(host);
    await host.screenshot({ path: path.join(profile, 'appearance-light.png') });
    await stop();
    await start();
    await assertColors(host, 'alice-blue', false);
    checks.push('restart persistence');
    darkHex = host
      .getByRole('group', { name: '濃い色', exact: true })
      .getByRole('textbox', { name: '色のHEX値' });
    lightHex = host
      .getByRole('group', { name: '淡い色', exact: true })
      .getByRole('textbox', { name: '色のHEX値' });
    await host.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    await host.getByRole('button', { name: '表示', exact: true }).click();
    await host.getByRole('button', { name: 'カスタム', exact: true }).click();
    await settleSettings(host);
    assert.equal(await darkHex.inputValue(), custom.dark);
    assert.equal(await lightHex.inputValue(), custom.light);
    await assertColors(host, 'custom', false, custom);
    checks.push('custom pair restored after restart');
    await host.getByRole('button', { name: 'ミント', exact: true }).click();
    await settleSettings(host);
    await assertColors(host, 'mint', false);
    await inspect(
      mainPort,
      electronExpression +
        ".BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('appdock://host/')).setSize(760,850)",
    );
    assert(
      await host.locator('.accent-palettes').evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    );
    await host.getByRole('button', { name: 'アリス', exact: true }).focus();
    await host.keyboard.press('Space');
    await settleSettings(host);
    await assertColors(host, 'alice-blue', false);
    await host.screenshot({ path: path.join(profile, 'appearance-narrow.png') });
    await host.getByRole('button', { name: 'ミント', exact: true }).focus();
    await host.keyboard.press('Enter');
    await settleSettings(host);
    await assertColors(host, 'mint', false);
    checks.push('narrow native window and keyboard palette selection');
    await host.getByRole('button', { name: 'カスタム', exact: true }).click();
    await settleSettings(host);
    assert(
      await host
        .locator('.accent-custom-colors')
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    );
    assert(await darkHex.isVisible());
    await host.screenshot({ path: path.join(profile, 'custom-narrow.png') });
    await host.getByRole('button', { name: 'ミント', exact: true }).click();
    await settleSettings(host);
    checks.push('custom editors fit narrow window');
    const json = JSON.parse(
      fs.readFileSync(
        path.join(profile, 'settings-' + require('node:os').hostname() + '.json'),
        'utf8',
      ),
    );
    assert.equal(json.host?.accentColor, undefined);
    assert.equal(json.host.customAccentDark, custom.dark);
    assert.equal(json.host.customAccentLight, custom.light);
    checks.push('default omitted from device JSON');
    success = true;
  } catch (error) {
    errors.push(String(error.stack || error));
    process.exitCode = 1;
  } finally {
    await stop().catch((error) => {
      errors.push(String(error));
      process.exitCode = 1;
    });
    if (server) await new Promise((r) => server.close(r));
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify(
        {
          success,
          portable: !!source,
          sourceHash: source && hash(source),
          scrollbarsOnly,
          checks,
          errors,
          ribbonSamples,
          scrollbarSamples,
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(path.join(profile, 'process.log'), output);
    console.log(JSON.stringify({ profile, success, checks, errors }, null, 2));
  }
})();
