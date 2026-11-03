const { test } = require('node:test');
const assert = require('node:assert/strict');
const { NavigationHistory } = require('../out/main/main/core/navigation-history');
const { NavigationCoordinator } = require('../out/main/main/core/ui-presentation');
const { hostCommandsForApplets } = require('../out/main/shared/commands');

test('ten steps in either direction, duplicate visits and branches', () => {
  const place = (n) => ({ route: 'settings', pageId: 'general', itemId: 'item-' + n });
  const history = new NavigationHistory(place(0));
  for (let i = 1; i <= 14; i++) history.visit(place(i));
  function step(direction, i) {
    const next = history.target(direction);
    assert.deepEqual(next, place(i));
    assert(history.arrive(direction, next));
  }
  for (let i = 13; i >= 4; i--) step('back', i);
  assert.equal(history.availability.back, false);
  for (let i = 5; i <= 14; i++) step('forward', i);
  assert.equal(history.availability.forward, false);
  step('back', 13);
  assert.equal(history.visit(place(13)), false);
  assert(history.availability.forward);
  history.visit(place(20));
  assert.equal(history.availability.forward, false);
  step('back', 13);
});
test('pruning a stopped destination preserves cursor and merges adjacent equal places', () => {
  const history = new NavigationHistory({ route: 'logs' });
  for (const route of ['stopped', 'logs', 'notifications']) history.visit({ route });
  history.arrive('back', history.target('back'));
  history.prune((p) => p.route !== 'stopped');
  assert.deepEqual(history.availability, { back: false, forward: true });
  assert.equal(history.target('forward').route, 'notifications');
});
test('restore seeds one place, failed flush or a superseding navigation does not commit travel', async () => {
  let flush = async () => {},
    opened = 0,
    valid = true;
  const nav = new NavigationCoordinator(
    () => {},
    () => flush(),
    undefined,
    undefined,
    {
      open: async () => {
        opened++;
      },
      settingsPlace: () => ({ route: 'settings', pageId: 'about' }),
      valid: () => valid,
    },
  );
  await nav.restore('logs');
  assert.deepEqual(nav.history.availability, { back: false, forward: false });
  await nav.navigate('notifications');
  flush = async () => {
    throw Error('pending input');
  };
  await assert.rejects(nav.travel('back'), /pending input/);
  let release;
  flush = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const travelling = nav.travel('back');
  flush = async () => {};
  await nav.navigate('text-library');
  release();
  await travelling;
  assert.equal(opened, 0);
  assert.equal(nav.state.route, 'text-library');
  valid = false;
  await nav.travel('back');
  assert.equal(opened, 0);
  assert.equal(nav.history.availability.back, false);
});
test('both commands remain assignable and carry their current availability', () => {
  const all = hostCommandsForApplets([], { back: true, forward: false });
  const [back, forward] = ['back', 'forward'].map((key) =>
    all.find((c) => c.id === 'appdock.navigation.' + key),
  );
  assert.equal(back.available, true);
  assert.equal(forward.available, false);
  assert.match(forward.disabledReason, /進める/);
});
