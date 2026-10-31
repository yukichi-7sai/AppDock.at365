const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

module.exports = async ({
  app,
  host,
  profile,
  model,
  open,
  until,
  geometry,
  checks,
  logStorage,
}) => {
  const id = 'fixture.host-pages';
  await until(
    async () =>
      (await host.evaluate(() => window.dock.snapshot())).extensions.some(
        (e) => e.id === id && e.state === 'running',
      ),
    'log fixture running',
  );
  await host.evaluate(() => window.dock.executeCommand('fixture.host-pages.mark'));
  const recorded = (await host.evaluate(() => window.dock.snapshot())).logs.filter(
    (e) => e.source === id,
  );
  assert(recorded.some((e) => e.level === 'debug' && e.category === 'normal'));
  assert.equal(recorded.filter((e) => e.category === 'audit' && e.level === 'info').length, 2);
  assert.equal(recorded.filter((e) => e.category === 'audit' && e.level === 'warn').length, 1);
  assert(!JSON.stringify(recorded).includes('must-not-appear-in-audit'));
  checks.push(
    'Node debug and Applet API success/refusal arrive with separate categories and no arguments',
  );

  await open('logs');
  const directory = logStorage.fallbackMode ? logStorage.fallback : logStorage.shared;
  assert.deepEqual((await model()).content.storage, {
    mode: logStorage.fallbackMode ? 'local' : 'shared',
    directory,
  });
  await host
    .getByText(logStorage.fallbackMode ? 'このPCに退避中（同期されません）' : '端末別の共有ログ', {
      exact: true,
    })
    .waitFor();
  await app.evaluate(({ shell }) => {
    globalThis.logOpenedDirectories = [];
    shell.openPath = async (directory) => {
      globalThis.logOpenedDirectories.push(directory);
      return '';
    };
  });
  await host.getByRole('button', { name: '保存先を開く', exact: true }).click();
  await until(
    async () => (await app.evaluate(() => globalThis.logOpenedDirectories)).length === 1,
    'open current log directory',
  );
  assert.deepEqual(await app.evaluate(() => globalThis.logOpenedDirectories), [directory]);
  checks.push(
    'storage status and open-directory action use the actual shared or fallback destination',
  );
  const source = host.getByLabel('ログのApplet', { exact: true });
  const category = host.getByLabel('ログの種類', { exact: true });
  const level = host.getByLabel('ログレベル', { exact: true });
  const search = host.getByLabel('ログを検索', { exact: true });
  const reset = host.getByRole('button', { name: '絞り込みを解除', exact: true });
  const table = host.getByRole('table', { name: 'ログ一覧' });
  const filter = async (control, key, value) => {
    await control.selectOption(value);
    await until(async () => (await model()).content.filters[key] === value, key + ' filter');
  };
  await filter(source, 'source', id);
  assert.equal(await category.inputValue(), 'normal');
  assert.equal(await level.inputValue(), 'standard');
  await table.getByText('log-fixture-info: ready', { exact: true }).waitFor();
  assert.equal(
    await table.getByText('log-fixture-debug: startup stage', { exact: true }).count(),
    0,
  );
  await until(
    async () => (await table.innerText()).includes('result=failed'),
    'audit warning visible',
  );
  assert(!(await table.innerText()).includes('result=success'));
  checks.push(
    'initial normal/Info view hides diagnostic and successful audits but retains audit warnings',
  );

  await filter(level, 'level', 'debug');
  await table.getByText('log-fixture-debug: startup stage', { exact: true }).waitFor();
  await search.fill('log-fixture-debug');
  await host.getByLabel('Appletの絞り込みを解除', { exact: true }).click();
  await until(async () => (await model()).content.filters.source === '', 'source cleared');
  assert.equal(await search.inputValue(), 'log-fixture-debug');
  assert.equal(await level.inputValue(), 'debug');
  assert.equal(await category.inputValue(), 'normal');
  await search.fill('no-such-log-fixture');
  await table.getByText('該当するログはありません。', { exact: true }).waitFor();
  await reset.focus();
  await reset.press('Enter');
  await until(async () => (await model()).content.filters.category === 'all', 'all filters clear');
  assert.equal(await search.inputValue(), '');
  assert.equal(await source.inputValue(), '');
  assert.equal(await level.inputValue(), 'all');
  assert(await reset.isDisabled());
  checks.push(
    'Debug can be selected; source-only clearing preserves other filters; keyboard reset recovers from empty results',
  );

  await filter(category, 'category', 'audit');
  await filter(level, 'level', 'info');
  await filter(source, 'source', id);
  await search.fill('result=success');
  await until(async () => (await model()).content.entries.length === 1, 'audit success match');
  await until(
    async () => (await table.innerText()).includes('result=success'),
    'audit success rendered',
  );
  assert.equal(await table.getByText('監査', { exact: true }).count(), 1);
  assert(!(await table.innerText()).includes('log-fixture-debug'));
  checks.push(
    'audit kind, level, source and text combine; row category distinguishes audit information',
  );

  await reset.click();
  await filter(source, 'source', id);
  for (const [theme, width, height] of [
    ['dark', 1280, 900],
    ['light', 540, 640],
  ]) {
    await host.evaluate(async (theme) => {
      const state = await window.dock.snapshot();
      state.settings.value.host.theme = theme;
      await window.dock.saveSettings(state.settings.value, state.settings.revision);
    }, theme);
    await until(
      () => host.evaluate((theme) => document.documentElement.dataset.theme === theme, theme),
      'theme',
    );
    await app.evaluate(
      ({ BrowserWindow }, { width, height }) => {
        const w = BrowserWindow.getAllWindows().find((w) =>
          w.webContents.getURL().startsWith('appdock://host/index.html'),
        );
        w.setMinimumSize(400, 320);
        w.setSize(width, height);
      },
      { width, height },
    );
    await until(
      () => host.evaluate((width) => Math.abs(innerWidth - width) < 25, width),
      'resized',
    );
    await geometry();
    const controls = await host.locator('.logs-page').evaluate((page) => {
      const rect = page.getBoundingClientRect();
      return [...page.querySelectorAll('button,input,select')].map((el) => {
        const r = el.getBoundingClientRect();
        return {
          label: el.getAttribute('aria-label') || el.textContent,
          visible:
            r.width > 0 &&
            r.height > 0 &&
            r.left >= rect.left &&
            r.right <= rect.right + 1 &&
            r.bottom <= rect.bottom,
        };
      });
    });
    assert(
      controls.every((c) => c.visible),
      JSON.stringify(controls),
    );
    await filter(category, 'category', 'audit');
    await filter(category, 'category', 'all');
    await host.screenshot({ path: path.join(profile, `logs-${theme}-${width}.png`) });
  }
  checks.push(
    'wide dark and narrow light views keep all controls reachable and remain operable without document overflow',
  );
  // Showing and hiding records is a view operation, not a recording setting.
  const saved = fs
    .readFileSync(path.join(directory, 'host.log'), 'utf8')
    .trim()
    .split(/\r?\n/)
    .map(JSON.parse);
  for (const entry of recorded)
    assert.equal(saved.filter((e) => JSON.stringify(e) === JSON.stringify(entry)).length, 1);
  assert(!JSON.stringify(saved).includes('must-not-appear-in-audit'));
  checks.push('debug and audit records remain in the file exactly once through UI filtering');
  assert.equal(fs.readFileSync(path.join(logStorage.other, 'host.log'), 'utf8'), logStorage.old);
  assert(!recorded.some((e) => e.source === 'old.fixture'));
  if (!logStorage.fallbackMode) {
    assert.equal(
      fs.readFileSync(path.join(logStorage.fallback, 'host.log'), 'utf8'),
      logStorage.old,
    );
    assert(!JSON.stringify(saved).includes('existing-log-retained'));
    checks.push('old local logs and another computer log are preserved without migration');
  } else {
    assert.equal(saved[0].source, 'old.fixture');
    const fallbackBefore = fs.readFileSync(path.join(logStorage.fallback, 'host.log'));
    const blocked = path.join(logStorage.shared, 'host.log');
    assert.equal(path.dirname(blocked), logStorage.shared);
    fs.rmdirSync(blocked);
    await host.evaluate(() => window.dock.executeCommand('fixture.host-pages.mark'));
    await until(
      async () => (await model()).content.storage.mode === 'shared',
      'shared log recovery',
    );
    await host.getByText('端末別の共有ログ', { exact: true }).waitFor();
    await host.getByRole('button', { name: '保存先を開く', exact: true }).click();
    await until(
      async () => (await app.evaluate(() => globalThis.logOpenedDirectories)).length === 2,
      'recovered directory',
    );
    assert.equal((await app.evaluate(() => globalThis.logOpenedDirectories))[1], logStorage.shared);
    assert.deepEqual(fs.readFileSync(path.join(logStorage.fallback, 'host.log')), fallbackBefore);
    const recovered = fs
      .readFileSync(path.join(logStorage.shared, 'host.log'), 'utf8')
      .trim()
      .split(/\r?\n/)
      .map(JSON.parse);
    assert(recovered.some((e) => e.level === 'debug'));
    assert(!recovered.some((e) => e.source === 'old.fixture'));
    for (const e of recorded)
      assert(!recovered.some((r) => JSON.stringify(r) === JSON.stringify(e)));
    checks.push(
      'recovered storage returns new records to shared data and leaves fallback history untouched',
    );
  }
};
