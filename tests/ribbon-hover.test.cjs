const { test } = require('node:test');
const assert = require('node:assert/strict');
const { RibbonHover } = require('../out/main/main/core/ribbon-hover');
function fixture(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const state = {
    enabled: false,
    delay: 200,
    visible: true,
    inside: false,
    manual: 'expanded',
    reads: 0,
    changes: 0,
  };
  const hover = new RibbonHover({
    enabled: () => state.enabled,
    collapseDelayMs: () => state.delay,
    available: () => state.visible,
    containsCursor: () => {
      state.reads++;
      return state.inside;
    },
    canExpand: () => !state.group,
    manualMode: () => state.manual,
    changed: () => state.changes++,
  });
  t.after(() => hover.dispose());
  return { state, hover, tick: (ms) => t.mock.timers.tick(ms) };
}
test('automatic hover preserves the manual selection, defaults off and leaves after a short grace period', (t) => {
  const { state, hover, tick } = fixture(t);
  hover.refresh();
  assert.equal(hover.displayMode, 'expanded');
  state.enabled = true;
  hover.refresh();
  assert.equal(hover.displayMode, 'compact');
  state.inside = true;
  hover.pointer(true);
  assert.equal(hover.displayMode, 'expanded');
  state.inside = false;
  hover.pointer(false);
  tick(199);
  assert.equal(hover.displayMode, 'expanded');
  tick(1);
  assert.equal(hover.displayMode, 'compact');
  state.enabled = false;
  hover.refresh();
  assert.equal(hover.displayMode, 'expanded');
  assert.equal(state.manual, 'expanded');
});
test('missing leave is checked once a second only while automatically expanded', (t) => {
  const { state, hover, tick } = fixture(t);
  state.enabled = true;
  hover.refresh();
  const collapsedReads = state.reads;
  tick(5000);
  assert.equal(state.reads, collapsedReads);
  state.inside = true;
  hover.pointer(true);
  const expandedReads = state.reads;
  tick(999);
  assert.equal(state.reads, expandedReads);
  tick(1);
  assert.equal(state.reads, expandedReads + 1);
  state.inside = false;
  tick(999);
  assert.equal(hover.displayMode, 'expanded');
  tick(1);
  assert.equal(hover.displayMode, 'expanded');
  tick(199);
  assert.equal(hover.displayMode, 'expanded');
  tick(1);
  assert.equal(hover.displayMode, 'compact');
  const reads = state.reads;
  tick(5000);
  assert.equal(state.reads, reads);
  state.enabled = false;
  hover.refresh();
  tick(5000);
  assert.equal(state.reads, reads);
});
test('boundary re-entry and transition to a group surface do not collapse the ribbon', (t) => {
  const { state, hover, tick } = fixture(t);
  state.enabled = true;
  state.inside = true;
  hover.refresh();
  hover.pointer(false);
  tick(200); // Native leave, cursor still over the group in the ribbon.
  assert.equal(hover.displayMode, 'expanded');
  state.inside = false;
  hover.pointer(false);
  tick(100);
  state.inside = true;
  hover.pointer(true);
  tick(500);
  assert.equal(hover.displayMode, 'expanded');
  assert.equal(state.changes, 1);
});
test('hidden/blocked windows, disabled mode and disposal stop pending work', (t) => {
  const { state, hover, tick } = fixture(t);
  state.enabled = true;
  state.inside = true;
  hover.refresh();
  state.visible = false;
  hover.refresh();
  assert.equal(hover.displayMode, 'compact');
  let reads = state.reads;
  tick(5000);
  assert.equal(state.reads, reads);
  state.visible = true;
  hover.refresh();
  assert.equal(hover.displayMode, 'expanded');
  state.enabled = false;
  hover.refresh();
  state.manual = 'compact';
  assert.equal(hover.displayMode, 'compact');
  reads = state.reads;
  tick(5000);
  assert.equal(state.reads, reads);
  state.enabled = true;
  hover.refresh();
  hover.dispose();
  reads = state.reads;
  tick(5000);
  assert.equal(state.reads, reads);
});

test('a compact group opened with keyboard keeps its anchor while the group is in use', (t) => {
  const { state, hover, tick } = fixture(t);
  state.enabled = true;
  hover.refresh();
  state.group = true;
  state.inside = true;
  hover.pointer(true);
  tick(1500);
  assert.equal(hover.displayMode, 'compact');
  state.group = false;
  hover.pointer(true);
  assert.equal(hover.displayMode, 'expanded');
});

for (const fallback of [false, true]) {
  test(`long collapse delay is honored without restarting on repeated checks (fallback=${fallback})`, (t) => {
    const { state, hover, tick } = fixture(t);
    state.enabled = state.inside = true;
    state.delay = 2500;
    hover.refresh();
    state.inside = false;
    if (fallback) tick(1000);
    else hover.pointer(false);
    tick(1000);
    assert.equal(hover.displayMode, 'expanded');
    hover.pointer(false);
    tick(1000);
    assert.equal(hover.displayMode, 'expanded');
    tick(499);
    assert.equal(hover.displayMode, 'expanded');
    tick(1);
    assert.equal(hover.displayMode, 'compact');
  });
}

test('zero delay collapses at detection but still respects native group bounds', (t) => {
  const { state, hover, tick } = fixture(t);
  state.enabled = state.inside = true;
  state.delay = 0;
  hover.refresh();
  hover.pointer(false);
  assert.equal(hover.displayMode, 'expanded');
  state.inside = false;
  hover.pointer(false);
  assert.equal(hover.displayMode, 'compact');
  state.inside = true;
  hover.pointer(true);
  state.inside = false;
  tick(1000);
  assert.equal(hover.displayMode, 'compact');
});

test('fallback re-entry cancels the wait and setting edits apply at the next departure', (t) => {
  const { state, hover, tick } = fixture(t);
  state.enabled = state.inside = true;
  state.delay = 2500;
  hover.refresh();
  state.inside = false;
  hover.pointer(false);
  tick(500);
  state.inside = true;
  tick(500); // Missing enter is recovered by the poll.
  state.inside = false;
  hover.pointer(false);
  state.delay = 0;
  hover.refresh();
  tick(1000);
  tick(1000);
  assert.equal(hover.displayMode, 'expanded'); // Original deadline was cancelled.
  tick(499);
  assert.equal(hover.displayMode, 'expanded');
  tick(1);
  assert.equal(hover.displayMode, 'compact');
  state.inside = true;
  hover.pointer(true);
  state.inside = false;
  hover.pointer(false);
  assert.equal(hover.displayMode, 'compact');
});

for (const stop of ['reset', 'hide', 'disable', 'dispose']) {
  test(`${stop} cancels a pending long wait immediately`, (t) => {
    const { state, hover, tick } = fixture(t);
    state.manual = 'compact';
    state.delay = 2500;
    state.enabled = state.inside = true;
    hover.refresh();
    state.inside = false;
    hover.pointer(false);
    if (stop === 'hide') {
      state.visible = false;
      hover.refresh();
    } else if (stop === 'disable') {
      state.enabled = false;
      hover.refresh();
    } else hover[stop]();
    assert.equal(hover.displayMode, 'compact');
    const reads = state.reads;
    tick(5000);
    assert.equal(state.reads, reads);
  });
}

test('delays beyond the native timer limit are split instead of overflowing into immediate collapse', (t) => {
  const { state, hover } = fixture(t);
  const pending = [];
  t.mock.method(global, 'setTimeout', (callback, delay) => {
    assert(delay > 0 && delay <= 2 ** 31 - 1);
    pending.push({ callback, delay });
    return { unref() {} };
  });
  t.mock.method(global, 'clearTimeout', () => {});
  state.enabled = state.inside = true;
  state.delay = 2 ** 31 + 500;
  hover.refresh();
  state.inside = false;
  hover.pointer(false);
  assert.equal(pending[0].delay, 2 ** 31 - 1);
  pending.shift().callback();
  assert.equal(hover.displayMode, 'expanded');
  assert.equal(pending[0].delay, 501);
  pending.shift().callback();
  assert.equal(hover.displayMode, 'compact');
});
