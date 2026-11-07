const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHostApi } = require('../out/main/main/core/host-api');
const { validateJson, checkCustomSchema } = require('../out/main/shared/custom-commands');
const {
  validateSettingValue,
  parseSettingDefinitions,
} = require('../out/main/shared/setting-definitions');
const { base64Value } = require('../out/main/shared/base64');

test('Storage preserves complete large values independently in every scope and owner', async (t) => {
  const base = path.resolve('.artifacts');
  fs.mkdirSync(base, { recursive: true });
  const root = fs.mkdtempSync(path.join(base, 'payload-capacity-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const api = createHostApi(
    {},
    root,
    () => {},
    () => {},
  );
  const owner = {
    state: 'running',
    manifest: { id: 'fixture.capacity', capabilities: ['storage'] },
  };
  for (const scope of ['memory', 'device', 'shared']) {
    const value = { scope, text: '本文🌙'.repeat(200000) };
    await api(owner, 'host.storage.set', { key: 'large', value, scope });
    assert.deepEqual(await api(owner, 'host.storage.get', { key: 'large', scope }), value);
    const other = { state: 'running', manifest: { ...owner.manifest, id: 'fixture.other' } };
    assert.equal(await api(other, 'host.storage.get', { key: 'large', scope }), null);
  }
});

test('JSON and Schema validation accepts large content while preserving types, explicit constraints and cycles', () => {
  const text = 'text'.repeat(300000);
  const value = Object.fromEntries(Array.from({ length: 10000 }, (_, i) => ['item' + i, text]));
  validateJson(value);
  const definition = { key: 'body', title: 'Body', type: 'string' };
  validateSettingValue(definition, text);
  const [explicit] = parseSettingDefinitions([{ ...definition, maxLength: text.length }]);
  validateSettingValue(explicit, text);
  validateSettingValue({ ...definition, type: 'string-list' }, [text]);
  validateSettingValue({ ...definition, type: 'select', dynamic: true }, text);
  assert.throws(() => validateSettingValue({ ...definition, maxLength: 3 }, text));
  checkCustomSchema({
    type: 'object',
    description: text,
    properties: { body: { type: 'string' } },
  });
  let nested = {};
  for (let i = 0; i < 100; i++) nested = { child: nested };
  validateJson(nested);
  nested.self = nested;
  assert.throws(() => validateJson(nested));
  assert.throws(() => validateJson({ value: Infinity }));
  assert.throws(() => validateJson(JSON.parse('{"__proto__":{}}')));
});

test('Base64 validation handles large data without a regex stack and rejects malformed groups', () => {
  const bytes = Buffer.alloc(6 * 1024 * 1024, 137);
  const value = bytes.toString('base64');
  assert.equal(base64Value(value), true);
  assert.deepEqual(Buffer.from(value, 'base64'), bytes);
  for (const invalid of ['A', 'AAA', 'A===', '=AAA', 'AAAA=AAA', 'AA\n=', 'AA_=', 42])
    assert.equal(base64Value(invalid), false);
});
