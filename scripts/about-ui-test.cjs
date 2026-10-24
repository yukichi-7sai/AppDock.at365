const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { launchTestHost } = require('./electron-test-launcher.cjs');
const { settingsPage } = require('./settings-host-helper.cjs');
const { settleSettings } = require('./settings-immediate-helper.cjs');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', 'about-ui-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
const hash = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const version = require('../package.json').version;
let hostFeedVersion = version;
const checks = [],
  measurements = [],
  requests = [],
  errors = [];
let app,
  page,
  server,
  success = false;
async function until(fn, label) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error(label);
}
(async () => {
  try {
    server = http.createServer((req, res) => {
      const id = req.url.slice(1).replace('.json', '');
      requests.push(id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          schemaVersion: 1,
          kind: id === 'host' ? 'host' : 'applet',
          id,
          version: id === 'host' ? hostFeedVersion : '1.0.0',
          payload: {
            file: id === 'host' ? 'AppDock.at365.exe' : 'update.zip',
            format: id === 'host' ? 'exe' : 'zip',
            sha256: 'a'.repeat(64),
            size: 20,
          },
        }),
      );
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const initial = require('../out/main/shared/settings-schema').createDefaultSettings();
    initial.host.hardwareAcceleration = false;
    initial.host.soundEnabled = false;
    initial.keybindings = [];
    initial.gestures.enabled = false;
    initial.touchpadGestures.enabled = false;
    initial.updates.checkHostOnStartup = false;
    initial.updates.checkAppletsOnStartup = false;
    initial.updates.allowSameVersion = false;
    const base = 'http://127.0.0.1:' + server.address().port;
    initial.updates.hostSource = base + '/host.json';
    for (const suffix of ['a', 'b']) {
      const id = 'fixture.about.' + suffix,
        folder = path.join(profile, 'extensions', suffix);
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(
        path.join(folder, 'extension.json'),
        JSON.stringify({
          apiVersion: 1,
          id,
          name: 'About ' + suffix,
          version: '1.0.0',
          runtime: 'node',
          entry: 'worker.cjs',
        }),
      );
      fs.writeFileSync(path.join(folder, 'worker.cjs'), 'exports.activate = () => {};');
      initial.extensions[id] = {
        enabled: suffix === 'a',
        settings: {},
        updateSource: base + '/' + id + '.json',
      };
    }
    fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(initial));
    const portable = !!process.argv[2],
      executablePath = portable ? path.join(profile, 'AppDock.at365.exe') : require('electron');
    if (portable) {
      fs.copyFileSync(path.resolve(process.argv[2]), executablePath);
      assert.equal(hash(executablePath), hash(process.argv[2]));
    }
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
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
      const s = page && (await page.evaluate(() => window.dock?.snapshot()));
      return (
        s?.startupReady &&
        s.extensions.some((e) => e.id === 'fixture.about.a' && e.state === 'running')
      );
    }, 'startup');
    page.setDefaultTimeout(15000);
    page.on('pageerror', (e) => errors.push(e.message));
    const snapshot = () => page.evaluate(() => window.dock.snapshot());
    const model = () =>
      page.evaluate(() =>
        window.dock.settingsPage.get(
          document.querySelector('.settings-surface').dataset.settingsConnection,
        ),
      );
    await page.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    await settingsPage(page);
    await page.getByTestId('settings-nav:about').click();
    await page.getByRole('heading', { name: 'AppDockについて', exact: true, level: 1 }).waitFor();
    const overview = page.getByTestId('about-overview');
    assert.equal(await overview.evaluate((e) => e === e.parentElement.firstElementChild), true);
    await until(
      () => overview.locator('img').evaluate((e) => e.complete && e.naturalWidth > 0),
      'icon loaded',
    );
    assert.match(
      await overview.getByTestId('about-version').innerText(),
      new RegExp(version.replaceAll('.', '\\.')),
    );
    assert.equal(await overview.getByTestId('about-applet-count').innerText(), '2');
    assert.equal(
      await page.getByRole('heading', { name: '実行環境の詳細', exact: true }).count(),
      0,
    );
    assert.equal(await overview.locator('.settings-section').count(), 0);
    for (const removed of [
      'AppDockへようこそ',
      '現在のバージョン',
      '最新のバージョンです。',
      '実行環境',
      'まとめて更新',
      '本体の更新',
      'Appletを一括更新',
      'Appletの管理と更新',
    ])
      assert.equal(await overview.getByText(removed, { exact: true }).count(), 0, removed);
    assert.equal(
      await overview
        .getByText('アプリ・コマンド・毎日の操作を、ひとつの場所に。', { exact: true })
        .count(),
      1,
    );
    assert.equal(
      await overview.getByRole('button', { name: 'AppDockとAppletをすべて更新', exact: true }).count(),
      1,
    );
    assert.equal(
      await overview.getByRole('button', { name: 'AppDockを更新', exact: true }).count(),
      1,
    );
    const options = page.locator('.about-page > details.settings-section');
    assert.equal(await options.evaluate((e) => e.open), false);
    await until(
      async () =>
        !(await snapshot()).updates.busy &&
        !!(await snapshot()).updates.results.find((r) => r.id === 'host')?.checkedAt,
      'initial automatic host check',
    );
    assert.deepEqual(requests, ['host']);
    assert.equal((await snapshot()).updates.notice, undefined);
    assert.equal(
      await checkBorder(overview.getByRole('button', { name: '更新を確認', exact: true })),
      '0px',
    );
    async function checkBorder(button) {
      await button.hover();
      return button.evaluate((e) => getComputedStyle(e).borderTopWidth);
    }
    checks.push(
      'information panel, frameless check icon, initially collapsed settings and one quiet automatic host check',
    );
    const oldCount = (await model()).content.auxiliary.aboutStats.commandCount;
    await page.evaluate(async () => {
      const s = await window.dock.snapshot();
      await window.dock.saveSettings(
        {
          ...s.settings.value,
          customCommands: {
            version: 2,
            items: [
              {
                id: '00000000-0000-0000-0000-000000000013',
                title: 'About count fixture',
                description: '',
                typeId: 'appdock.process.start',
                owner: { kind: 'host' },
                configVersion: 1,
                config: {
                  mode: 'cmd',
                  command: 'echo fixture',
                  workingDirectory: '',
                  showConsole: false,
                },
                enabled: true,
                automation: false,
              },
            ],
          },
        },
        s.settings.revision,
      );
    });
    await until(
      async () => (await model()).content.auxiliary.aboutStats.commandCount === oldCount + 1,
      'live command count',
    );
    await until(
      async () =>
        (await overview.getByTestId('about-command-count').innerText()) === String(oldCount + 1),
      'rendered command count',
    );
    assert.equal(
      await overview.getByTestId('about-command-count').innerText(),
      String(oldCount + 1),
    );
    await page.getByTestId('settings-nav:shortcuts').click();
    await page
      .getByRole('heading', { name: 'ショートカットキー', exact: true, level: 1 })
      .waitFor();
    const catalog = (await model()).content.auxiliary.commands;
    await page.getByTestId('settings-nav:about').click();
    await overview.waitFor();
    assert.equal(
      (await model()).content.auxiliary.aboutStats.commandCount,
      new Set(catalog.map((c) => c.id)).size,
    );
    assert.equal(
      (await model()).content.auxiliary.aboutStats.availableCommandCount,
      new Set(catalog.filter((c) => c.available).map((c) => c.id)).size,
    );
    checks.push(
      'counts refresh after command registration and match the shared command catalog without exposing its entries in About auxiliary data',
    );
    const versionRow = overview.getByTestId('about-version');
    const check = versionRow.getByRole('button', { name: '更新を確認', exact: true });
    hostFeedVersion = '999.0.0';
    requests.length = 0;
    await check.click();
    await until(
      async () => (await versionRow.locator('.version-available').innerText()).includes('999.0.0'),
      'available host version',
    );
    assert.deepEqual(
      requests,
      ['host'],
      'icon checks host metadata without an update installation',
    );
    assert.equal((await versionRow.locator('time').getAttribute('dateTime')) !== null, true);
    await page.screenshot({ path: path.join(profile, 'host-update-available.png') });
    hostFeedVersion = version;
    await check.click();
    await until(
      async () => (await versionRow.locator('.version-available').count()) === 0,
      'current host version',
    );
    assert.equal(await overview.getByText('最新のバージョンです。', { exact: true }).count(), 0);
    requests.length = 0;
    await page.evaluate(() => window.dock.executeCommand('appdock.updates.check'));
    assert.deepEqual([...new Set(requests)].sort(), ['fixture.about.a', 'fixture.about.b', 'host']);
    assert.equal(
      (await snapshot()).updates.notice,
      undefined,
      'check command stays quiet when all targets are current',
    );
    checks.push(
      'host check icon uses metadata only and shows/removes the available version; current-only icon and check command results stay quiet',
    );
    assert.equal(await options.evaluate((e) => e.open), false);
    for (const [label, expected] of [
      ...(portable
        ? [
            ['AppDockとAppletをすべて更新', ['host', 'fixture.about.a', 'fixture.about.b']],
            ['AppDockを更新', ['host']],
          ]
        : []),
    ]) {
      requests.length = 0;
      await overview.getByRole('button', { name: label, exact: true }).click();
      await until(
        async () =>
          !(await snapshot()).updates.busy && expected.every((id) => requests.includes(id)),
        label,
      );
      assert.deepEqual([...new Set(requests)].sort(), [...expected].sort());
      assert.equal(
        (await snapshot()).updates.notice.kind,
        'info',
        'update execution keeps no-update notification',
      );
    }
    assert.equal(await options.evaluate((e) => e.open), false);
    checks.push(
      portable
        ? 'all/host update targets match same-version local feeds; closed settings stay closed'
        : 'development update execution is deferred to the fixed EXE',
    );
    await options.locator(':scope > summary').click();
    assert.equal(
      await page
        .getByText(
          require('../src/shared/locales/ja/host.json')['settings.updateSettings.startupHint'],
          { exact: true },
        )
        .count(),
      0,
    );
    const auto = page.getByRole('switch', { name: 'AppDockの更新を自動で確認', exact: true });
    assert.equal(await auto.getAttribute('aria-checked'), 'true');
    await auto.click();
    await settleSettings(page);
    assert.equal((await snapshot()).settings.value.updates.checkHostOnAboutOpen, false);
    const beforeReopen = requests.length;
    await page.getByTestId('settings-nav:shortcuts').click();
    await page
      .getByRole('heading', { name: 'ショートカットキー', level: 1, exact: true })
      .waitFor();
    await page.getByTestId('settings-nav:about').click();
    await overview.waitFor();
    await options.locator(':scope > summary').click();
    await page.getByRole('switch', { name: 'AppDockの更新を自動で確認', exact: true }).click();
    await settleSettings(page);
    await page.waitForTimeout(150);
    assert.equal(
      requests.length,
      beforeReopen,
      'disabled entry and recently checked re-enable do not fetch',
    );
    const source = page.getByLabel('AppDockの更新元', { exact: true });
    const reset = page.getByRole('button', { name: 'AppDockの更新元を既定に戻す', exact: true });
    const sourceBox = await source.boundingBox(),
      resetBox = await reset.boundingBox();
    assert(resetBox.x >= sourceBox.x + sourceBox.width);
    assert(Math.abs(sourceBox.y + sourceBox.height / 2 - resetBox.y - resetBox.height / 2) < 2);
    assert.equal(await reset.innerText(), '');
    await page
      .getByRole('switch', {
        name: require('../out/main/shared/settings-catalog').hostSettingItem(
          'about',
          'checkHostOnStartup',
        ).title,
        exact: true,
      })
      .click();
    await settleSettings(page);
    assert.equal((await snapshot()).settings.value.updates.checkHostOnStartup, true);
    await page
      .getByRole('switch', {
        name: require('../out/main/shared/settings-catalog').hostSettingItem(
          'about',
          'checkHostOnStartup',
        ).title,
        exact: true,
      })
      .click();
    await settleSettings(page);
    checks.push(
      'collapsed update settings preserve save behavior, automatic check opt-out/throttle and adjacent icon reset',
    );
    const appletTile = overview.getByRole('button', { name: 'Appletの管理と更新', exact: true });
    await appletTile.focus();
    await appletTile.press('Enter');
    await page.getByRole('heading', { name: 'Applet管理', exact: true, level: 1 }).waitFor();
    await page.getByTestId('settings-nav:about').click();
    await overview.waitFor();
    for (const theme of ['light', 'dark']) {
      await page.evaluate(async (theme) => {
        const s = await window.dock.snapshot();
        await window.dock.saveSettings(
          { ...s.settings.value, host: { ...s.settings.value.host, theme } },
          s.settings.revision,
        );
      }, theme);
      await until(
        () => page.evaluate((theme) => document.documentElement.dataset.theme === theme, theme),
        'theme',
      );
      for (const width of [1280, 900, 760, 600]) {
        await app.evaluate(({ BrowserWindow }, width) => {
          const w = BrowserWindow.getAllWindows().find((w) =>
            w.webContents.getURL().startsWith('appdock://host/'),
          );
          w.setMinimumSize(600, 600);
          w.setSize(width, 1000);
        }, width);
        await until(() => page.evaluate((width) => innerWidth === width, width), 'window width');
        await page.locator('.settings-body').evaluate((e) => {
          e.scrollTop = 0;
        });
        const size = await page
          .locator('.settings-body')
          .evaluate((e) => ({ clientWidth: e.clientWidth, scrollWidth: e.scrollWidth }));
        assert(size.scrollWidth <= size.clientWidth + 2, JSON.stringify(size));
        const actions = await overview
          .locator('.about-update-buttons button')
          .evaluateAll((elements) =>
            elements.map((element) => {
              const rect = element.getBoundingClientRect();
              return {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
                background: getComputedStyle(element).backgroundColor,
              };
            }),
          );
        assert.equal(actions.length, 2);
        assert(Math.abs(actions[0].y - actions[1].y) < 1, 'update buttons share a row');
        assert(Math.abs(actions[0].width - actions[1].width) < 1, 'update buttons share width');
        assert(Math.abs(actions[0].height - actions[1].height) < 1, 'update buttons share height');
        if (theme === 'light') assert.equal(actions[1].background, 'rgb(255, 255, 255)');
        const accent = await page.evaluate(() => {
          const e = document.createElement('span');
          e.style.color = 'var(--accent)';
          document.body.append(e);
          const color = getComputedStyle(e).color;
          e.remove();
          return color;
        });
        const hostButton = overview.getByRole('button', { name: 'AppDockを更新', exact: true });
        await hostButton.hover();
        assert.equal(await hostButton.evaluate((e) => getComputedStyle(e).borderTopColor), accent);
        assert.equal(await hostButton.evaluate((e) => getComputedStyle(e).filter), 'none');
        await page.getByRole('button', { name: 'ファイルを開く', exact: true }).hover();
        assert.equal(
          await page
            .getByRole('button', { name: 'ファイルを開く', exact: true })
            .evaluate((e) => getComputedStyle(e).borderTopColor),
          accent,
        );
        if (width === 1280) {
          const boxes = await versionRow
            .locator('.version-display, button, time')
            .evaluateAll((elements) =>
              elements.map((e) => {
                const r = e.getBoundingClientRect();
                return { x: r.x, y: r.y, width: r.width, height: r.height };
              }),
            );
          assert.equal(boxes.length, 3);
          assert(boxes[2].x >= boxes[1].x + boxes[1].width);
          assert(
            Math.abs(boxes[0].y + boxes[0].height / 2 - boxes[2].y - boxes[2].height / 2) < 2,
            'version and last-check time share a line',
          );
        }
        measurements.push({ theme, width, ...size, actions });
        await page.screenshot({ path: path.join(profile, theme + '-' + width + '.png') });
      }
    }
    checks.push(
      'Applet management link and real light/dark widths 1280/900/760/600 fit without horizontal page overflow',
    );
    assert.deepEqual(errors, []);
    success = true;
  } catch (e) {
    fs.writeFileSync(path.join(profile, 'failure.txt'), e.stack || String(e));
    console.error(e);
    process.exitCode = 1;
    await page?.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
  } finally {
    await app?.close().catch((e) => {
      errors.push(e.message);
      success = false;
      process.exitCode = 1;
    });
    await new Promise((r) => (server ? server.close(r) : r()));
    const result = {
      success,
      version,
      checks,
      errors,
      measurements,
      requests,
      profile,
      portable: process.argv[2] ? hash(process.argv[2]) : null,
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  }
})();
