const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const threads = require('node:worker_threads');
const { readObservedFile } = require('../out/main/main/core/file-reader');

test('reader failure rejects outstanding work, recreates the worker and ignores an old worker exit', async (t) => {
  const workers = [];
  t.mock.method(threads, 'Worker', function () {
    const worker = Object.assign(new EventEmitter(), {
      messages: [],
      referenced: true,
      ref() {
        this.referenced = true;
      },
      unref() {
        this.referenced = false;
      },
      postMessage(message) {
        this.messages.push(message);
      },
    });
    workers.push(worker);
    return worker;
  });
  const first = readObservedFile('first.json');
  const second = readObservedFile('second.json');
  const rejected = assert.rejects(second, /reader failure/);
  workers[0].emit('message', { id: workers[0].messages[0].id, text: 'first' });
  assert.equal(await first, 'first');
  assert(workers[0].referenced);
  workers[0].emit('error', Error('reader failure'));
  await rejected;
  assert(!workers[0].referenced);
  const recovered = readObservedFile('recovered.json');
  assert.equal(workers.length, 2);
  workers[0].emit('exit', 1);
  workers[1].emit('message', { id: workers[1].messages[0].id, text: 'recovered' });
  assert.equal(await recovered, 'recovered');
  assert(!workers[1].referenced);
  const interrupted = readObservedFile('interrupted.json');
  const exited = assert.rejects(interrupted, /reader exited/);
  workers[1].emit('exit', 1);
  await exited;
});
