const { test } = require('node:test');
const assert = require('node:assert/strict');
const { RibbonHover } = require('../out/main/main/core/ribbon-hover');
function fixture(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const state = {
    enabled: false,
    visible: true,
    inside: false,
    manual: 'expanded',
    reads: 0,
    changes: 0,
  };
  const hover = new RibbonHover({
    enabled: () => state.enabled,
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
