const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  libraryOrderLabel,
  orderListBlocks,
  moveOrderList,
  orderListResult,
} = require('../out/main/shared/order-list');
const rows = [
  { id: 'a', title: 'Lucide: Accessibility' },
  { id: 'c', title: 'Test: TestA' },
  { id: 'b', title: 'Lucide: Animals' },
  { id: 'e', title: 'Standalone' },
  { id: 'd', title: 'Test: TestB' },
].map((item) => ({ ...item, ...libraryOrderLabel(item.title) }));
const byId = new Map(rows.map((row) => [row.id, row]));

test('library order rejects a renamed grouping but preserves concurrent membership-only changes', () => {
  const { LibraryClassificationStore } = require('../out/main/main/core/library-classification');
  const original = rows.map((row) => ({ id: row.id, name: row.title, images: [] }));
  const store = {
    value: { imageLibrary: { groups: structuredClone(original) } },
    revision: 1,
    save(value) {
      this.value = value;
      this.revision++;
    },
  };
  const library = new LibraryClassificationStore(store, () => {});
  const operation = {
    kind: 'order',
    before: original.map((g) => g.id),
    ids: ['c', 'd', 'a', 'b', 'e'],
  };
  store.value.imageLibrary.groups[0].name = 'Changed: Accessibility';
  assert.throws(
    () => library.edit(operation, original),
    (e) => e.code === 'REVISION_CONFLICT',
  );
  assert.equal(store.revision, 1);
  store.value.imageLibrary.groups[0].name = original[0].name;
  store.value.imageLibrary.groups[0].images = [{ file: 'retained.png' }];
  library.edit(operation, original);
  assert.deepEqual(
    store.value.imageLibrary.groups.map((g) => g.id),
    operation.ids,
  );
  assert.deepEqual(store.value.imageLibrary.groups.find((g) => g.id === 'a').images, [
    { file: 'retained.png' },
  ]);
});

test('first occurrence groups match navigation without changing stored order or names', () => {
  assert.deepEqual(
    orderListBlocks(rows).map((b) => [b.group, b.items.map((i) => i.id)]),
    [
      ['Lucide', ['a', 'b']],
      ['Test', ['c', 'd']],
      [undefined, ['e']],
    ],
  );
  assert.deepEqual(orderListResult(rows, rows), ['a', 'c', 'b', 'e', 'd']);
  assert.deepEqual(
    rows.map((row) => row.title),
    ['Lucide: Accessibility', 'Test: TestA', 'Lucide: Animals', 'Standalone', 'Test: TestB'],
  );
  assert.deepEqual(libraryOrderLabel('  Lucide : Animals: Cats'), {
    group: 'Lucide',
    displayTitle: 'Animals: Cats',
  });
  assert.deepEqual(libraryOrderLabel(':item'), { displayTitle: ':item' });
  assert.deepEqual(libraryOrderLabel('  :item'), { displayTitle: '  :item' });
  assert.deepEqual(libraryOrderLabel('Title：item'), { displayTitle: 'Title：item' });
});

test('block moves flatten every descendant while retaining inner order and ungrouped placement', () => {
  const blocks = orderListBlocks(rows),
    source = { block: blocks[1].key },
    target = { block: blocks[0].key };
  const ids = moveOrderList(blocks, source, target, false);
  assert.deepEqual(ids, ['c', 'd', 'a', 'b', 'e']);
  assert.deepEqual(
    orderListResult(
      rows,
      ids.map((id) => byId.get(id)),
    ),
    ids,
  );
  assert.deepEqual(moveOrderList(blocks, { block: blocks[2].key }, source, false), [
    'a',
    'b',
    'e',
    'c',
    'd',
  ]);
  assert.equal(
    moveOrderList(blocks, source, target, true),
    undefined,
    'already immediately after target',
  );
  assert.deepEqual(
    rows.map((row) => row.id),
    ['a', 'c', 'b', 'e', 'd'],
    'draft does not mutate the source',
  );
});

test('children only move among siblings; no-op and restored visual order preserve interleaving', () => {
  const blocks = orderListBlocks(rows),
    a = { block: blocks[0].key, item: 'a' },
    b = { block: blocks[0].key, item: 'b' };
  assert.deepEqual(moveOrderList(blocks, b, a, false), ['b', 'a', 'c', 'd', 'e']);
  assert.equal(moveOrderList(blocks, a, a, false), undefined);
  assert.equal(moveOrderList(blocks, b, { block: blocks[1].key, item: 'c' }, false), undefined);
  assert.equal(moveOrderList(blocks, b, { block: blocks[1].key }, false), undefined);
  assert.equal(moveOrderList(blocks, { block: blocks[0].key }, a, false), undefined);
  assert.equal(
    moveOrderList(blocks, { block: blocks[0].key, item: 'missing' }, a, false),
    undefined,
  );
  assert.deepEqual(
    orderListResult(
      rows,
      ['a', 'b', 'c', 'd', 'e'].map((id) => byId.get(id)),
    ),
    ['a', 'c', 'b', 'e', 'd'],
  );
});

test('flat lists and colliding item/group names retain stable independent identities', () => {
  const flat = [
    { id: 'same', title: 'one' },
    { id: 'two', title: 'same', group: 'same' },
  ];
  const blocks = orderListBlocks(flat);
  assert.notEqual(blocks[0].key, blocks[1].key);
  assert.deepEqual(
    moveOrderList(blocks, { block: blocks[0].key }, { block: blocks[1].key }, true),
    ['two', 'same'],
  );
  assert.deepEqual(orderListResult([], []), []);
  const simple = orderListBlocks([
    { id: 'a', title: 'a' },
    { id: 'b', title: 'b' },
  ]);
  assert.deepEqual(
    moveOrderList(simple, { block: simple[0].key }, { block: simple[1].key }, true),
    ['b', 'a'],
  );
});
