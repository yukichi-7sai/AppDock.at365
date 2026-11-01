const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseSettingDefinitions,
  parseSettingOptions,
  validateSettingValue,
  validateAppletSettings,
} = require('../out/main/shared/setting-definitions.js');
const { createDefaultSettings } = require('../out/main/shared/settings-schema.js');
const {
  normalizeObject,
  readObjectList,
  isObjectFieldEnabled,
} = require('../out/main/shared/object-list.js');

test('conditional list inputs resolve defaults and numeric selections without changing saved values', () => {
  const raw = {
    key: 'monitors',
    title: 'Monitors',
    type: 'object-list',
    default: [],
    fields: [
      {
        key: 'Mode',
        title: 'Mode',
        type: 'select',
        default: 'Fit',
        numericOptions: true,
        options: [
          { label: 'Fit', value: 'Fit' },
          { label: 'Tile', value: 'Tile' },
        ],
      },
      {
        key: 'Gap',
        title: 'Gap',
        type: 'number',
        default: 10,
        minimum: 0,
        maximum: 4096,
        enabledWhen: { key: 'Mode', equals: 'Tile' },
      },
    ],
  };
  const [definition] = parseSettingDefinitions([raw]);
  const [mode, gap] = definition.fields;
  assert.equal(isObjectFieldEnabled({}, gap, definition.fields), false);
  assert.equal(isObjectFieldEnabled({ Mode: 1 }, gap, definition.fields), true);
  const stored = { Mode: 'Tile', Gap: 24, private: 'keep' };
  const draft = normalizeObject(stored, definition.fields);
  draft.Mode = 'Fit';
  assert.equal(isObjectFieldEnabled(draft, gap, definition.fields), false);
  assert.equal(draft.Gap, 24);
  validateSettingValue(definition, [draft]);
  draft.Mode = 'Tile';
  assert.equal(isObjectFieldEnabled(draft, gap, definition.fields), true);
  assert.equal(isObjectFieldEnabled(draft, mode, definition.fields), true);
  assert.deepEqual(draft, stored);
  assert.throws(() => validateSettingValue(definition, [{ Mode: 'Fit', Gap: -1 }]));
  for (const enabledWhen of [
    null,
    {},
    { key: 'missing', equals: 'Tile' },
    { key: 'Gap', equals: 10 },
    { key: 'Mode', equals: 'missing' },
    { key: 'Mode', equals: true },
    { key: 'Mode', equals: NaN },
    { key: 'Mode', equals: {} },
  ]) {
    assert.throws(() =>
      parseSettingDefinitions([
        { ...raw, fields: [raw.fields[0], { ...raw.fields[1], enabledWhen }] },
      ]),
    );
  }
  assert.throws(() => parseSettingDefinitions([{ ...raw.fields[1] }]));
});

test('monitor forms accept legacy JSON and preserve folders, enum values, padding and unknown data', () => {
  const [definition] = parseSettingDefinitions([
    {
      key: 'monitors',
      title: 'Monitors',
      type: 'object-list',
      default: [],
      fields: [
        { key: 'Folders', title: 'Folders', type: 'string-list', aliases: ['Folder'], default: [] },
        {
          key: 'Mode',
          title: 'Mode',
          type: 'select',
          numericOptions: true,
          default: 'Fit',
          options: [
            { label: 'Fill', value: 'Fill' },
            { label: 'Fit', value: 'Fit' },
            { label: 'Tile', value: 'Tile' },
          ],
        },
        {
          key: 'PaddingBottom',
          title: 'Bottom',
          type: 'number',
          default: 0,
          minimum: 0,
          maximum: 65535,
        },
      ],
    },
  ]);
  const legacy = JSON.stringify([
    { Folder: 'C:/images', Mode: 2, PaddingBottom: 40, extra: 'keep' },
  ]);
  validateSettingValue(definition, legacy);
  const canonical = readObjectList(legacy).map((item) => normalizeObject(item, definition.fields));
  assert.deepEqual(canonical, [
    { Folders: ['C:/images'], Mode: 'Tile', PaddingBottom: 40, extra: 'keep' },
  ]);
  validateSettingValue(definition, canonical);
  assert.deepEqual(
    normalizeObject({ Folder: 'a', Folders: ['b', 'a'] }, definition.fields).Folders,
    ['b', 'a'],
  );
  for (const invalid of [
    '{',
    [null],
    [{ Folders: null }],
    [{ Folders: [null] }],
    [{ Folders: [''] }],
    [{ Mode: 99 }],
    [{ PaddingBottom: -1 }],
  ])
    assert.throws(() => validateSettingValue(definition, invalid));
  assert.throws(
    () => parseSettingDefinitions([{ ...definition, fields: [{ ...definition, key: 'nested' }] }]),
    /一覧/,
  );
  assert.throws(
    () =>
      parseSettingDefinitions([
        { ...definition, fields: [{ key: '__proto__', title: 'Bad', type: 'string' }] },
      ]),
    /定義/,
  );
});
test('Applet selections validate definitions, unique options, defaults and ranges', () => {
  const [position] = parseSettingDefinitions([
    {
      key: 'position',
      title: '時計の位置',
      type: 'select',
      default: 'top',
      options: [
        { label: '上端', value: 'top' },
        { label: '下端', value: 'bottom' },
      ],
    },
  ]);
  assert.doesNotThrow(() => validateSettingValue(position, 'bottom'));
  assert.throws(() => validateSettingValue(position, 'invalid'), /時計の位置/);
  assert.throws(() => parseSettingDefinitions([{ ...position, default: 'invalid' }]), /時計の位置/);
  assert.throws(
    () =>
      parseSettingOptions([
        { label: 'A', value: 'a' },
        { label: 'B', value: 'a' },
      ]),
    /重複/,
  );
  assert.throws(
    () =>
      parseSettingDefinitions([
        { key: 'number', title: 'サイズ', type: 'number', minimum: 10, maximum: 0 },
      ]),
    /範囲/,
  );
});
test('dynamic monitor selections preserve a disconnected monitor but enforce string values', () => {
  const [monitor] = parseSettingDefinitions([
    {
      key: 'monitor',
      title: 'モニター',
      type: 'select',
      dynamic: true,
      default: 'primary',
      options: [{ label: 'メイン', value: 'primary' }],
    },
  ]);
  assert.doesNotThrow(() => validateSettingValue(monitor, 'disconnected-display'));
  assert.throws(() => validateSettingValue(monitor, 123), /モニター/);
});
test('Applet numeric and boolean settings reject invalid saves without constraining undeclared data', () => {
  const value = createDefaultSettings();
  value.extensions['at365.watch'] = {
    enabled: true,
    settings: { opacity: 0.4, arbitraryData: { a: 1 } },
  };
  const applets = [
    {
      id: 'at365.watch',
      settings: [
        { key: 'opacity', title: '不透明度', type: 'number', minimum: 0.05, maximum: 1 },
        { key: 'visible', title: '時計を表示', type: 'boolean' },
      ],
    },
  ];
  assert.doesNotThrow(() => validateAppletSettings(value, applets));
  value.extensions['at365.watch'].settings.opacity = 2;
  assert.throws(() => validateAppletSettings(value, applets), /不透明度/);
  value.extensions['at365.watch'].settings.opacity = 0.4;
  value.extensions['at365.watch'].settings.visible = 'true';
  assert.throws(() => validateAppletSettings(value, applets), /時計を表示/);
});
