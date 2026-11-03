const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { launch, until } = require('./page-test-host.cjs');
const { settingsPage } = require('./settings-host-helper.cjs');
const { settleSettings } = require('./settings-immediate-helper.cjs');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(root, '.artifacts/input-palette-phase1-'));
const source = process.argv[2];
if (!source || !path.isAbsolute(source)) throw Error('Pass the fixed distribution EXE');
assert(
  fs.existsSync(path.join(path.dirname(source), 'appdock-host.json')),
  'Sealed host distribution is required',
);
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.closeToTray = false;
settings.host.textPaletteHistory = false;
settings.textLibrary = {
  groups: [
    {
      id: require('../out/main/shared/text-library').snippetGroupId,
      name: '定型文',
      files: [{ file: 'greeting.txt' }],
    },
  ],
};
fs.mkdirSync(path.join(profile, 'data/assets/texts'), { recursive: true });
fs.writeFileSync(path.join(profile, 'data/assets/texts/greeting.txt'), 'fixture greeting');
fs.writeFileSync(require('./test-settings.cjs').file(profile), JSON.stringify(settings));
const checks = [];
let host,
  success = false;
async function settingsForm() {
  await host.main.evaluate(() => window.dock.executeCommand('appdock.settings.text-palette.open'));
  await settingsPage(host.main);
}
async function editCount(testId, value) {
  const input = host.main.getByTestId(testId);
  await input.fill(String(value));
  await input.press('Enter');
  await settleSettings(host.main);
}
const state = () =>
  host.main.evaluate(async () => (await window.dock.snapshot()).settings.value.host);
async function mock(action, argument) {
  return host.app.evaluate(
    async (_electron, { action, argument }) => {
      const test = globalThis.palettePhase1;
      if (action === 'open') return test.host.open('fixture-editor', argument ?? 'snippets');
      if (action === 'open-early') {
        test.firstKey = 'end';
        return test.host.open('fixture-editor');
      }
      if (action === 'key') test.host.key(test.host.active.id, argument);
      if (action === 'snapshot')
        return {
          kind: test.host.active?.kind,
          selected: test.host.active?.selected,
          view: test.host.active?.view,
          scrollTop: test.host.active?.scrollTop,
          switching: test.host.active?.switching,
          calls: test.calls,
          managed: test.managed,
        };
      if (action === 'gate')
        test.gate = new Promise((resolve) => {
          test.release = resolve;
        });
      if (action === 'release') {
        test.release?.();
        test.gate = null;
      }
      if (action === 'history-status') test.historyStatus = argument;
      if (action === 'stale-scroll') test.host.active.scrollTop = 0;
      if (action === 'wait') await test.host.writes;
    },
    { action, argument },
  );
}
(async () => {
  try {
    host = await launch(profile, source);
    await settingsForm();
    const nav = await host.main
      .locator('[data-testid^="settings-nav:"]')
      .evaluateAll((nodes) => nodes.map((n) => n.dataset.testid));
    assert.equal(
      nav.indexOf('settings-nav:text-palette'),
      nav.indexOf('settings-nav:notifications') + 1,
    );
    assert.equal(await host.main.getByTestId('text-palette-rows').inputValue(), '8');
    assert.equal(await host.main.getByTestId('clipboard-palette-rows').inputValue(), '8');
    await editCount('text-palette-rows', 4);
    await editCount('clipboard-palette-rows', 3);
    assert.equal((await state()).textPaletteRows, 4);
    assert.equal((await state()).clipboardPaletteRows, 3);
    await editCount('text-palette-rows', 1.5);
    assert.equal((await state()).textPaletteRows, 4);
    assert.equal(await host.main.getByTestId('text-palette-rows').inputValue(), '1.5');
    await editCount('text-palette-rows', 4);
    const input = host.main.getByTestId('text-palette-rows');
    await input.fill('12');
    await input.press('Escape');
    await input.blur();
    assert.equal(await input.inputValue(), '4');
    checks.push(
      'Independent defaults/counts, fractional input rejected and retained, Escape cancels',
    );
    await host.resize(900, 620);
    await host.main.screenshot({ path: path.join(profile, 'settings-narrow.png') });
    await host.resize(1720, 1000);
    await host.main.screenshot({ path: path.join(profile, 'settings-wide.png') });
    // Exercise the real production management callback; no paste/clipboard operation occurs.
    await host.main.bringToFront();
    await host.main.getByTestId('text-palette-rows').focus();
    await host.main.evaluate(() => window.dock.executeCommand('appdock.text-palette.open'));
    const realPanel = await host.page('/input-palette.html');
    await realPanel
      .locator('.choices [data-index="0"] strong')
      .filter({ hasText: 'greeting' })
      .waitFor();
    assert.equal(
      await realPanel.locator('.choices [data-index="0"] strong').innerText(),
      'greeting',
    );
    await realPanel.getByRole('button', { name: '定型文を管理', exact: true }).click();
    await until(
      async () =>
        (await host.main.evaluate(() => window.dock.snapshot())).navigation.route ===
        'text-library',
      'production library navigation',
    );
    assert.equal(
      await host.main
        .locator('[data-gallery-group]')
        .filter({ hasText: '定型文' })
        .getAttribute('aria-current'),
      'page',
    );
    checks.push('Real nonactivating palette icon opens the fixed snippets group; extension hidden');
    await host.close();
    host = await launch(profile, source);
    await settingsForm();
    assert.equal(await host.main.getByTestId('text-palette-rows').inputValue(), '4');
    assert.equal(await host.main.getByTestId('clipboard-palette-rows').inputValue(), '3');
    assert.equal((await state()).textPaletteHistory, false);
    checks.push('Restart preserves both counts and existing history OFF');
    // Real packaged host/renderer with a simulated native boundary: never touches the personal clipboard.
    await host.app.evaluate(({ app }) => {
      const require = process
        .getBuiltinModule('module')
        .createRequire(app.getAppPath() + '/package.json');
      const path = require('node:path'),
        { pathToFileURL } = require('node:url');
      const { InputPaletteHost } = require(
        path.join(app.getAppPath(), 'out/main/main/core/input-palette-host.js'),
      );
      const test = (globalThis.palettePhase1 = { calls: [], managed: 0, historyStatus: 'ok' });
      const documents = Array.from({ length: 15 }, (_, i) => ({
        ref: { file: `folder/entry.${i + 1}.txt` },
        generation: 'test',
        textPreview: `本文 ${i + 1}`,
      }));
      test.host = new InputPaletteHost(
        pathToFileURL(path.join(app.getAppPath(), 'out/renderer/input-palette.html')).href,
        path.join(app.getAppPath(), 'out/main/main/input-palette-preload.js'),
        {
          paletteRequest: async (method, params) => {
            test.calls.push({ method, ...params });
            if (method === 'capture') {
              if (test.firstKey) {
                test.host.key(params.session, test.firstKey);
                test.firstKey = null;
              }
              return { x: 200, y: 80, window: 'fixture-editor' };
            }
            if (method === 'history') {
              await test.gate;
              return {
                status: test.historyStatus,
                rows:
                  test.historyStatus === 'ok'
                    ? Array.from({ length: 14 }, (_, i) => ({
                        id: 'history-' + i,
                        kind: 'text',
                        preview: '履歴 ' + (i + 1),
                      }))
                    : [],
              };
            }
            if (method === 'paste') return 'verified';
            return true;
          },
        },
        {
          snippetEntries: () => documents,
          document: async (ref) => ({ body: 'insert:' + ref.file }),
        },
        () => false,
        (kind) => (kind === 'snippets' ? 4 : 3),
        async () => {
          test.managed++;
        },
        (stage) => {
          throw Error('Unexpected palette failure ' + stage);
        },
      );
    });
    await mock('open');
    const panel = await host.page('/input-palette.html');
    const selected = (n) => panel.locator(`[data-index="${n}"][aria-current="true"]`).waitFor();
    const key = async (name, index) => {
      await mock('key', name);
      if (index !== undefined) await selected(index);
    };
    await selected(0);
    await panel.locator('.choices').evaluate((el) => {
      el.scrollTop = 500;
    });
    await key('home', 0);
    await until(
      async () => (await panel.locator('.choices').evaluate((el) => el.scrollTop)) === 0,
      'Home reveals already selected first row',
    );
    assert.equal(await panel.locator('[data-index="0"] strong').innerText(), 'entry.1');
    assert.equal(
      await panel.locator('[data-index="0"]').getAttribute('title'),
      'folder/entry.1.txt',
    );
    await key('page-down', 4);
    await key('page-down', 8);
    await key('page-down', 12);
    await key('page-down', 14);
    await key('home', 0);
    await key('page-up', 0);
    await key('end', 14);
    await key('page-up', 10);
    await key('up', 9);
    assert.equal(await panel.locator('[data-index="9"] kbd').innerText(), '0');
    assert.equal(await panel.locator('[data-index="10"] kbd').count(), 0);
    const scroll = await panel.locator('.choices').evaluate((el) => el.scrollTop);
    const old = await mock('snapshot');
    await mock('stale-scroll');
    const oldView = await panel.evaluate(() => ({
      session: document.querySelector('header').dataset.paletteSession,
    }));
    await mock('gate');
    await key('switch');
    await panel.evaluate(({ session, view }) => window.inputPalette.choose(session, view, 0), {
      ...oldView,
      view: old.view,
    });
    assert.equal((await mock('snapshot')).calls.filter((c) => c.method === 'paste').length, 0);
    await mock('release');
    await until(
      async () =>
        (await mock('snapshot')).kind === 'history' && !(await mock('snapshot')).switching,
      'history switch',
    );
    await selected(0);
    await key('page-down', 3);
    await key('switch');
    await until(
      async () =>
        (await mock('snapshot')).kind === 'snippets' && !(await mock('snapshot')).switching,
      'return to snippets',
    );
    await selected(9);
    await until(
      async () => (await panel.locator('.choices').evaluate((el) => el.scrollTop)) === scroll,
      'restore scroll',
    );
    await panel.screenshot({ path: path.join(profile, 'snippets-light.png') });
    await host.save({ host: { theme: 'dark' } });
    await panel.screenshot({ path: path.join(profile, 'snippets-dark.png') });
    await key('switch');
    await until(
      async () =>
        (await mock('snapshot')).kind === 'history' && !(await mock('snapshot')).switching,
      'return history',
    );
    await selected(3);
    const calls = (await mock('snapshot')).calls;
    assert.equal(calls.filter((c) => c.method === 'capture').length, 1);
    assert.equal(calls.filter((c) => c.method === 'history').length, 1);
    assert.equal(calls.filter((c) => c.method === 'close').length, 0);
    assert(calls.filter((c) => c.method === 'show').every((c) => c.session === oldView.session));
    checks.push(
      'Page/Home/End boundaries, fixed 1–0 badges, no badge on eleventh item, both selections and scroll restored without recapturing target/history',
    );
    await key('choose:9');
    await mock('wait');
    assert.equal(
      (await mock('snapshot')).calls.find((c) => c.method === 'paste').item,
      'history-9',
    );
    await mock('open');
    await selected(0);
    await key('choose:9');
    await mock('wait');
    assert.equal(
      (await mock('snapshot')).calls.findLast((c) => c.method === 'append').text,
      'insert:folder/entry.10.txt',
    );
    checks.push(
      'Number 0 resolves the tenth history ID and tenth document even outside the viewport; reopen starts at first item',
    );
    await mock('history-status', 'disabled');
    await mock('open', 'history');
    await panel.getByText('Windowsのクリップボード履歴がオフです。', { exact: true }).waitFor();
    await key('switch');
    await selected(0);
    await panel.getByRole('button', { name: '定型文を管理', exact: true }).click();
    await until(async () => (await mock('snapshot')).managed === 1, 'manage callback once');
    checks.push(
      'Disabled history remains switchable; stale click refused during delayed history loading; manage closes palette',
    );
    await mock('open-early');
    await selected(14);
    assert(
      await panel.locator('[data-index="14"]').evaluate((el) => {
        const row = el.getBoundingClientRect(),
          list = el.closest('.choices').getBoundingClientRect();
        // Fractional DIP coordinates differ by floating-point rounding at Windows 150% scaling.
        return row.top >= list.top - 0.01 && row.bottom <= list.bottom + 0.01;
      }),
      'Selection received before first paint is visible',
    );
    await key('cancel');
    checks.push('Navigation accepted before first paint remains selected and visible');
    success = true;
  } finally {
    if (host) {
      await host.app
        .evaluate(() => {
          globalThis.palettePhase1?.host.dispose();
          delete globalThis.palettePhase1;
        })
        .catch(() => {});
      await host.close();
    }
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify({ success, source, hash: host?.hash, checks }, null, 2),
    );
    console.log(JSON.stringify({ success, checks, profile }));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
