const assert = require('node:assert/strict');

function mcpReceiverSettings(initial) {
  let saved = structuredClone(initial);
  return {
    read: () => structuredClone(saved),
    save(next, previous) {
      assert.deepEqual(previous, saved);
      saved = structuredClone(next);
    },
  };
}

module.exports = { mcpReceiverSettings };
