const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const { freePort } = require('./electron-main-helper.cjs');
const { settingsPage } = require('./settings-host-helper.cjs');
const { settleSettings } = require('./settings-immediate-helper.cjs');
const root = path.resolve(__dirname, '..');
const profile = path.join(root, '.artifacts', 'settings-input-' + Date.now());
fs.mkdirSync(profile, { recursive: true });
const checks = [];
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let child,
  browser,
  host,
  page,
  success = false,
  output = '';
async function until(fn, label) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      if (await fn()) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error(label);
}
const snapshot = () => host.evaluate(() => window.dock.snapshot());
const saved = async () => (await snapshot()).settings.value;
const disk = () => JSON.parse(fs.readFileSync(path.join(profile, 'settings.json')));
(async () => {
  try {
    const initial = require('../out/main/shared/settings-schema').createDefaultSettings();
    initial.host.hardwareAcceleration = false;
    initial.keybindings = [];
    initial.gestures.enabled = false;
    require('./profile-settings-fixture.cjs').installProfileSettings(
      profile,
      initial,
      'Original profile',
    );
    const fixture = path.join(profile, 'extensions', 'fixture.input');
    fs.mkdirSync(fixture, { recursive: true });
    fs.writeFileSync(
      path.join(fixture, 'extension.json'),
      JSON.stringify({
        apiVersion: 1,
        id: 'fixture.input',
        name: 'Input fixture',
        version: '1.0.0',
        runtime: 'node',
        entry: 'index.cjs',
        settings: [
          { key: 'text', title: 'Fixture text', type: 'string', default: 'Default text' },
          {
            key: 'amount',
            title: 'Fixture amount',
            type: 'number',
            default: 0,
            minimum: 0,
            maximum: 100,
          },
          {
            key: 'url',
            title: 'Fixture URL',
            type: 'string',
            format: 'url',
            default: 'https://example.invalid/default',
          },
        ],
      }),
    );
    fs.writeFileSync(path.join(fixture, 'index.cjs'), 'module.exports = {};');
    initial.extensions['fixture.input'] = {
      enabled: false,
      settings: { text: 'Original text', amount: 1, url: 'https://example.invalid/old' },
    };
    fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify(initial));
    let exe = require('electron');
    if (process.argv[2]) {
      exe = path.join(profile, 'AppDock.at365.exe');
      require('./copy-host.cjs').copyHost(path.resolve(process.argv[2]), exe);
      assert.equal(hash(exe), hash(process.argv[2]));
    }
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const port = await freePort();
    child = spawn(
      exe,
      [
        ...(process.argv[2] ? [] : [root]),
        '--test-profile=' + profile,
        '--test-local-state=' + path.join(profile, 'local'),
        '--remote-debugging-port=' + port,
      ],
      { cwd: root, env, windowsHide: true, stdio: 'pipe' },
    );
    child.stdout.on('data', (b) => (output += b));
    child.stderr.on('data', (b) => (output += b));
    await until(async () => {
      browser = await chromium.connectOverCDP('http://127.0.0.1:' + port, { timeout: 1000 });
      return browser;
    }, 'CDP');
    await until(() => {
      host = browser
        .contexts()
        .flatMap((c) => c.pages())
        .find((p) => p.url().startsWith('appdock://host/'));
      return host;
    }, 'host');
    await until(async () => (await snapshot()).startupReady, 'startup');
    await host.evaluate(() => window.dock.executeCommand('appdock.settings.open'));
    page = await settingsPage(host);
    page.setDefaultTimeout(15000);
    const select = async (name) => {
      await page
        .locator('.settings-categories button')
        .filter({ has: page.locator('span[title="' + name + '"]') })
        .click();
      await page.getByRole('heading', { level: 1, name, exact: true }).waitFor();
    };
    async function pending(input, text, read) {
      const before = read(await saved());
      const revision = (await snapshot()).settings.revision;
      await input.fill(text);
      await page.waitForTimeout(120);
      await settleSettings(page);
      assert.equal(await input.inputValue(), text);
      assert.deepEqual(read(await saved()), before, 'typing does not change runtime settings');
      assert.deepEqual(read(disk()), before, 'typing does not change settings.json');
      assert.equal((await snapshot()).settings.revision, revision);
      return before;
    }
    await select('プロフィール');
    const name = page.getByLabel('ユーザー名', { exact: true });
    await pending(
      name,
      'Unconfirmed profile',
      (s) => s.extensions['fixture.profile'].settings.name,
    );
    await name.press('Escape');
    assert.equal(await name.inputValue(), 'Original profile');
    await name.blur();
    await settleSettings(page);
    assert.equal((await saved()).extensions['fixture.profile'].settings.name, 'Original profile');
    await pending(name, 'Confirmed profile', (s) => s.extensions['fixture.profile'].settings.name);
    await name.press('Enter');
    await settleSettings(page);
    assert.equal((await saved()).extensions['fixture.profile'].settings.name, 'Confirmed profile');
    const revision = (await snapshot()).settings.revision;
    await name.press('Enter');
    await name.blur();
    await settleSettings(page);
    assert.equal(
      (await snapshot()).settings.revision,
      revision,
      'Enter/repeated Enter/blur writes once',
    );
    await pending(name, 'Saved by blur', (s) => s.extensions['fixture.profile'].settings.name);
    await name.blur();
    await settleSettings(page);
    assert.equal(disk().extensions['fixture.profile'].settings.name, 'Saved by blur');
    checks.push(
      'host text defers runtime/disk/revision, Escape restores, Enter and blur save exactly once',
    );

    await name.focus();
    await name.evaluate((el) => {
      el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
        el,
        '日本語の入力',
      );
      el.dispatchEvent(
        new InputEvent('input', { bubbles: true, data: '日本語の入力', isComposing: true }),
      );
      for (const key of ['Enter', 'Escape'])
        el.dispatchEvent(
          new KeyboardEvent('keydown', {
            key,
            keyCode: 229,
            isComposing: true,
            bubbles: true,
            cancelable: true,
          }),
        );
      el.dispatchEvent(
        new CompositionEvent('compositionend', { bubbles: true, data: '日本語の入力' }),
      );
    });
    await settleSettings(page);
    assert.equal((await saved()).extensions['fixture.profile'].settings.name, 'Saved by blur');
    assert.equal(await name.inputValue(), '日本語の入力');
    await name.press('Enter');
    await settleSettings(page);
    assert.equal(disk().extensions['fixture.profile'].settings.name, '日本語の入力');
    checks.push(
      'IME Enter/Escape and compositionend keep text local until a separate confirmation',
    );
    await name.evaluate((el) => {
      el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
        el,
        'Blur during IME',
      );
      el.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
      el.blur();
      el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    });
    await settleSettings(page);
    assert.equal(disk().extensions['fixture.profile'].settings.name, 'Blur during IME');
    await name.fill('Pending external replacement');
    await host.evaluate(async () => {
      const s = await window.dock.snapshot();
      s.settings.value.extensions['fixture.profile'].settings.name = 'External profile';
      await window.dock.saveSettings(s.settings.value, s.settings.revision);
    });
    await until(
      async () => (await name.inputValue()) === 'External profile',
      'external value replaces local field',
    );
    await name.fill('Cancel after external update');
    await name.press('Escape');
    assert.equal(await name.inputValue(), 'External profile');
    checks.push(
      'IME blur confirms once and an external update becomes the new field cancellation point',
    );

    await select('Input fixture');
    const text = page.getByLabel('Fixture text', { exact: true });
    await pending(text, 'Applet pending', (s) => s.extensions['fixture.input'].settings.text);
    await text.press('Escape');
    await text.blur();
    await settleSettings(page);
    assert.equal((await saved()).extensions['fixture.input'].settings.text, 'Original text');
    await text.fill('Applet confirmed');
    await text.press('Enter');
    await settleSettings(page);
    assert.equal(disk().extensions['fixture.input'].settings.text, 'Applet confirmed');
    const amount = page.getByLabel('Fixture amount', { exact: true });
    await pending(amount, '4', (s) => s.extensions['fixture.input'].settings.amount);
    await amount.press('ArrowUp');
    await amount.press('ArrowUp');
    assert.equal(await amount.inputValue(), '6');
    assert.equal((await saved()).extensions['fixture.input'].settings.amount, 1);
    await amount.press('Escape');
    assert.equal(await amount.inputValue(), '1');
    await pending(amount, '-', (s) => s.extensions['fixture.input'].settings.amount);
    await amount.press('Enter');
    await page.getByRole('alert').first().waitFor();
    assert.equal((await saved()).extensions['fixture.input'].settings.amount, 1);
    await amount.fill('8');
    await amount.press('Enter');
    await settleSettings(page);
    assert.equal(disk().extensions['fixture.input'].settings.amount, 8);
    const url = page.getByLabel('Fixture URL', { exact: true });
    await pending(
      url,
      'https://example.invalid/pending',
      (s) => s.extensions['fixture.input'].settings.url,
    );
    await url.press('Escape');
    assert.equal(await url.inputValue(), 'https://example.invalid/old');
    checks.push(
      'Applet text/URL and number arrows defer, Escape restores, incomplete numeric confirmation never reaches Store',
    );
    await page.getByRole('button', { name: 'JSON', exact: true }).click();
    const json = page.getByLabel('設定JSON', { exact: true });
    const originalJson = await json.inputValue();
    const editedJson = JSON.parse(originalJson);
    editedJson.extensions['fixture.input'].settings.amount = 9;
    await pending(
      json,
      JSON.stringify(editedJson),
      (s) => s.extensions['fixture.input'].settings.amount,
    );
    await json.press('Escape');
    assert.equal(await json.inputValue(), originalJson);
    await json.fill(JSON.stringify(editedJson));
    await json.press('Enter');
    await settleSettings(page);
    assert.equal(disk().extensions['fixture.input'].settings.amount, 9);
    checks.push('page JSON uses the same confirmation/cancellation without exposing partial input');

    await select('AI');
    const prompt = page.getByLabel('共通プロンプト', { exact: true });
    await pending(prompt, 'first line', (s) => s.ai?.commonPrompt ?? '');
    await prompt.press('End');
    await prompt.press('Shift+Enter');
    await prompt.pressSequentially('second line');
    assert.equal(await prompt.inputValue(), 'first line\nsecond line');
    assert.equal((await saved()).ai.commonPrompt, '');
    await prompt.press('Escape');
    assert.equal(await prompt.inputValue(), '');
    await prompt.fill('Saved multiline\nprompt');
    await prompt.press('Enter');
    await settleSettings(page);
    assert.equal(disk().ai.commonPrompt, 'Saved multiline\nprompt');
    checks.push(
      'multiline text uses Shift+Enter for a line, Enter for save, Escape for field cancellation',
    );
    await page.getByRole('button', { name: 'AIサーバーを追加', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const connection = page.getByLabel('AI接続の名前', { exact: true });
    const originalName = await connection.inputValue();
    await connection.fill('Cancelled local name');
    await connection.press('Escape');
    assert.equal(await connection.inputValue(), originalName);
    assert.equal(await dialog.count(), 1, 'field Escape keeps its dialog open');
    await connection.fill('Confirmed local name');
    await connection.press('Enter');
    assert.equal(
      (await saved()).ai.connections.length,
      0,
      'field Enter does not save a grouped record',
    );
    await page.getByLabel('AIの認証方式').selectOption('bearer');
    const secret = page.getByLabel('AIのAPIキー', { exact: true });
    await secret.fill('synthetic-cancel-only');
    await secret.press('Escape');
    assert.equal(await secret.inputValue(), '');
    await connection.focus();
    await connection.evaluate((el) => {
      el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
        el,
        'Dialog IME confirmed',
      );
      el.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
      el.blur();
      el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    });
    await page.getByLabel('AIの認証方式').selectOption('none');
    const aiUrl = page.getByLabel('AIのAPIのURL', { exact: true });
    await aiUrl.fill('http://127.0.0.1:1/v1');
    await dialog.getByRole('button', { name: 'OK', exact: true }).click();
    await settleSettings(page);
    assert.equal(disk().ai.connections[0].name, 'Dialog IME confirmed');
    checks.push(
      'dialog text/password Escape cancels the field, Enter and IME blur stay local, OK saves the record once',
    );

    await select('通知');
    await page.getByTestId('notification-delivery').locator(':scope > summary').click();
    await page.getByTestId('notification-speech').locator(':scope > summary').click();
    await page.getByRole('switch', { name: '通知の声に共通設定を使う', exact: true }).click();
    await settleSettings(page);
    const voice = page.getByLabel('通知用のボイスID', { exact: true });
    const originalVoice = await pending(
      voice,
      'unconfirmed-voice',
      (s) => s.notificationPreferences?.speech?.voice,
    );
    await voice.press('Escape');
    assert.equal(await voice.inputValue(), originalVoice ?? '');
    await voice.fill('confirmed-voice');
    await voice.press('Enter');
    await settleSettings(page);
    assert.equal(disk().notificationPreferences.speech.voice, 'confirmed-voice');
    checks.push('editable voice combobox defers direct text and supports Escape/Enter');

    const search = page.getByLabel('設定を検索', { exact: true });
    await search.fill('ユーザー名');
    await page
      .getByRole('status')
      .filter({ hasText: /件の設定/ })
      .waitFor();
    await search.press('Escape');
    await settleSettings(page);
    assert.equal(await search.inputValue(), '');
    checks.push('settings search retains live filtering and Escape clear');
    await page.screenshot({ path: path.join(profile, 'confirmed-settings.png') });
    success = true;
  } catch (error) {
    fs.writeFileSync(path.join(profile, 'error.txt'), error.stack ?? String(error));
    console.error(error);
    process.exitCode = 1;
    await page?.screenshot({ path: path.join(profile, 'failure.png') }).catch(() => {});
  } finally {
    if (host) await host.evaluate(() => window.dock.executeCommand('appdock.quit')).catch(() => {});
    if (child && child.exitCode === null) {
      try {
        await until(() => child.exitCode !== null, 'shutdown');
      } catch {
        child.kill();
        success = false;
        process.exitCode = 1;
      }
    }
    await browser?.close().catch(() => {});
    fs.writeFileSync(path.join(profile, 'process.log'), output);
    const result = {
      success,
      checks,
      profile,
      version: require('../package.json').version,
      portable: process.argv[2] ? hash(process.argv[2]) : null,
    };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  }
})();
