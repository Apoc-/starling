import test from 'node:test';
import assert from 'node:assert/strict';
import * as storage from '../src/storage.js';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';

async function fixture(t, options = {}) {
  const indexedDB = new IDBFactory();
  const store = await storage.openStore({ indexedDB, validateState: validState, ...options });
  t.after(() => store.close());
  return { store, indexedDB };
}

test('new durable stores load empty without inventing a save', async t => {
  const { store } = await fixture(t);
  assert.equal(await store.load(), null);
  assert.equal(await store.backup(), null);
  assert.equal(store.close(), undefined);
});

test('commit persists cloned state and rotates the previous save into backup', async t => {
  const { store, indexedDB } = await fixture(t);
  const input = state(12);
  const first = await store.commit(input, 0);
  assert.deepEqual(first, envelope(12));
  assert.equal(await store.backup(), null);
  input.energy = 999;
  input.producers.scout = 999;
  first.state.energy = 888;
  assert.deepEqual(await store.load(), envelope(12));
  assert.deepEqual(await store.commit(state(20), 1), envelope(20, 2));
  assert.deepEqual(await store.backup(), envelope(12));
  await store.commit(state(30), 2);
  assert.deepEqual(await store.backup(), envelope(20, 2));
  store.close();
  const reopened = await storage.openStore({ indexedDB, validateState: validState });
  t.after(() => reopened.close());
  assert.deepEqual(await reopened.load(), envelope(30, 3));
  assert.deepEqual(await reopened.backup(), envelope(20, 2));
});

test('two handles racing on the same revision have exactly one winner', async t => {
  const { store, indexedDB } = await fixture(t);
  const other = await storage.openStore({ indexedDB, validateState: validState });
  t.after(() => other.close());
  await store.commit(state(1), 0);
  const results = await Promise.allSettled([store.commit(state(2), 1), other.commit(state(3), 1)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const failure = results.find(r => r.status === 'rejected');
  assert.equal(failure.reason.name, 'SaveConflictError');
  const winner = results.find(r => r.status === 'fulfilled').value;
  assert.deepEqual(await store.load(), winner);
  assert.deepEqual(await other.load(), winner);
  assert.deepEqual(await store.backup(), envelope(1));
  await assert.rejects(store.commit(state(5), 0), { name: 'SaveConflictError' });
  assert.deepEqual(await store.backup(), envelope(1));
});

test('commit rejects invalid bounded state without changing either record', async t => {
  const { store } = await fixture(t);
  await store.commit(state(1), 0);
  await store.commit(state(2), 1);
  for (const bad of [state(-1), state(Infinity), state(NaN), state(1e15 + 1),
    { ...state(), voyages: 0.5 }, { ...state(), checkpoint: -1 },
    { ...state(), producers: { scout: 10001, array: 0, reactor: 0 } }, null]) {
    await assert.rejects(store.commit(bad, 2), /invalid.*state/i);
    assert.deepEqual(await store.load(), envelope(2, 2));
    assert.deepEqual(await store.backup(), envelope(1));
  }
});

async function rawRecords(indexedDB, writes) {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('starling-save', 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('saves', writes ? 'readwrite' : 'readonly');
      const saves = tx.objectStore('saves');
      for (const [key, value] of Object.entries(writes || {})) saves.put(value, key);
      const current = saves.get('current');
      const backup = saves.get('backup');
      tx.oncomplete = () => resolve({ current: current.result, backup: backup.result });
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

test('corrupt or future current is rejected intact instead of falling back or resetting', async t => {
  const { store, indexedDB } = await fixture(t);
  const backup = envelope(42);
  for (const current of [null, {}, { ...envelope(), version: 99 }, { ...envelope(), revision: 0 },
    { ...envelope(), state: state(-10) }]) {
    await rawRecords(indexedDB, { current, backup });
    await assert.rejects(store.load(), /malformed|version|invalid/i);
    assert.deepEqual(await store.backup(), backup);
    await assert.rejects(store.commit(state(20), current?.revision ?? 0));
    assert.deepEqual(await rawRecords(indexedDB), { current, backup });
  }
});

test('corrupt backup is reported without touching a valid current', async t => {
  const { store, indexedDB } = await fixture(t);
  await rawRecords(indexedDB, { current: envelope(3), backup: { version: 12 } });
  await assert.rejects(store.backup(), /version/i);
  assert.deepEqual(await store.load(), envelope(3));
});

test('null expected revision denotes an empty store', async t => {
  const { store } = await fixture(t);
  assert.deepEqual(await store.commit(state(4), null), envelope(4));
  await assert.rejects(store.commit(state(9), null), { name: 'SaveConflictError' });
});

test('revision exhaustion cannot write an invalid envelope', async t => {
  const { store, indexedDB } = await fixture(t);
  const current = envelope(5, Number.MAX_SAFE_INTEGER);
  await rawRecords(indexedDB, { current, backup: envelope(4) });
  await assert.rejects(store.commit(state(6), Number.MAX_SAFE_INTEGER), /revision/i);
  assert.deepEqual(await rawRecords(indexedDB), { current, backup: envelope(4) });
});

test('opening requires IndexedDB and an explicit validator', async () => {
  await assert.rejects(storage.openStore({ indexedDB: null, validateState: validState }), /IndexedDB.*unavailable|unavailable.*IndexedDB/i);
  await assert.rejects(storage.openStore({ indexedDB: new IDBFactory() }), /validateState|validator/i);
});

test('opening surfaces asynchronous storage denial', async () => {
  const denied = new DOMException('Storage access denied', 'SecurityError');
  const indexedDB = { open() {
    const request = {};
    queueMicrotask(() => { request.error = denied; request.onerror(); });
    return request;
  } };
  await assert.rejects(storage.openStore({ indexedDB, validateState: validState }), error => error === denied);
});

test('aborting after the backup write rolls back both keys', async t => {
  const { store } = await fixture(t);
  await store.commit(state(1), 0);
  await store.commit(state(2), 1);
  const original = IDBObjectStore.prototype.put;
  const patch = t.mock.method(IDBObjectStore.prototype, 'put', function(value, key) {
    const request = original.call(this, value, key);
    if (key === 'current') this.transaction.abort();
    return request;
  });
  await assert.rejects(store.commit(state(3), 2), /abort/i);
  patch.mock.restore();
  assert.deepEqual(await store.load(), envelope(2, 2));
  assert.deepEqual(await store.backup(), envelope(1));
  assert.deepEqual(await store.commit(state(4), 2), envelope(4, 3));
});

test('quota failures roll back the already queued backup write', async t => {
  const { store } = await fixture(t);
  await store.commit(state(1), 0);
  await store.commit(state(2), 1);
  const original = IDBObjectStore.prototype.put;
  const patch = t.mock.method(IDBObjectStore.prototype, 'put', function(value, key) {
    if (key === 'current') throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
    return original.call(this, value, key);
  });
  await assert.rejects(store.commit(state(3), 2), { name: 'QuotaExceededError' });
  patch.mock.restore();
  assert.deepEqual(await store.load(), envelope(2, 2));
  assert.deepEqual(await store.backup(), envelope(1));
});

test('closed handles reject reads and writes instead of claiming success', async t => {
  const { store } = await fixture(t);
  await store.commit(state(1), 0);
  store.close();
  await assert.rejects(store.load());
  await assert.rejects(store.backup());
  await assert.rejects(store.commit(state(2), 1));
});

test('blocked opening fails visibly and closes any late successful connection', async () => {
  let closed = false;
  const indexedDB = { open() {
    const request = { result: { close() { closed = true; } } };
    queueMicrotask(() => {
      request.onblocked?.();
      request.onsuccess();
    });
    return request;
  } };
  await assert.rejects(storage.openStore({ indexedDB, validateState: validState }), /blocked|other tab/i);
  assert.equal(closed, true);
});

test('asynchronous write request failure preserves both committed records', async t => {
  const { store } = await fixture(t);
  await store.commit(state(1), 0);
  await store.commit(state(2), 1);
  const original = IDBObjectStore.prototype.put;
  const patch = t.mock.method(IDBObjectStore.prototype, 'put', function(value, key) {
    // add against the existing primary key produces a real asynchronous IDB failure.
    return key === 'current' ? this.add(value, key) : original.call(this, value, key);
  });
  await assert.rejects(store.commit(state(3), 2), { name: 'ConstraintError' });
  patch.mock.restore();
  assert.deepEqual(await store.load(), envelope(2, 2));
  assert.deepEqual(await store.backup(), envelope(1));
});

// Intentionally independent of the engine: exercise injected validation.
function validState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
  const resource = n => Number.isFinite(n) && n >= 0 && n <= 1e15;
  const count = n => Number.isInteger(n) && n >= 0 && n <= 10000;
  return ['energy', 'runEarned', 'lifetimeEarned', 'stardust', 'checkpoint'].every(k => resource(state[k]))
    && count(state.voyages)
    && state.producers && ['scout', 'array', 'reactor'].every(k => count(state.producers[k]))
    && Array.isArray(state.upgrades) && state.upgrades.length <= 10000
    && state.upgrades.every(v => typeof v === 'string' && v.length < 100);
}
function state(energy = 0) {
  return { energy, runEarned: energy, lifetimeEarned: energy,
    producers: { scout: 0, array: 0, reactor: 0 }, upgrades: [],
    stardust: 0, voyages: 0, checkpoint: 1234 };
}
function envelope(energy = 0, revision = 1) {
  return { version: 1, revision, state: state(energy) };
}

test('imports and exports reject unsupported or malformed envelopes', () => {
  for (const bad of [null, [], {}, { ...envelope(), version: 2 },
    { ...envelope(), version: 0 }, { ...envelope(), version: '1' },
    ...[0, -1, 1.5, '1', Number.MAX_SAFE_INTEGER + 1].map(revision => ({ ...envelope(), revision })),
    { ...envelope(), state: state(-1) }, { ...envelope(), state: state(1e16) },
    { ...envelope(), state: { ...state(), producers: { scout: 10001, array: 0, reactor: 0 } } },
    { ...envelope(), state: { ...state(), checkpoint: null } }]) {
    assert.throws(() => storage.parseSave(JSON.stringify(bad), validState), Error);
    assert.throws(() => storage.exportSave(bad, validState), Error);
  }
  assert.throws(() => storage.parseSave(JSON.stringify({ ...envelope(), version: 22 }), validState), /version|future|unsupported/i);
  assert.throws(() => storage.parseSave('{}', undefined), /validator|validateState/i);
  assert.throws(() => storage.exportSave(envelope(), undefined), /validator|validateState/i);
});

test('imports are bounded plain JSON and never interpret code', () => {
  const text = JSON.stringify(envelope());
  assert.deepEqual(storage.parseSave(text.padEnd(100000), validState), envelope());
  assert.throws(() => storage.parseSave(text.padEnd(100001), validState), /large|length|100000/i);
  assert.throws(() => storage.parseSave({ toString: () => text }, validState), /text|string/i);
  for (const bad of ['', '{', 'undefined', '(() => {globalThis.executed = true})()', '<script>alert(1)</script>']) {
    assert.throws(() => storage.parseSave(bad, validState), Error);
  }
  assert.equal(globalThis.executed, undefined);
  const large = { ...envelope(), extra: 'x'.repeat(100000) };
  assert.throws(() => storage.exportSave(large, validState), /large|length|100000/i);
});

test('portable version-one save round trips without changing state', () => {
  assert.equal(storage.SAVE_VERSION, 1);
  const save = envelope(42);
  const text = storage.exportSave(save, validState);
  assert.equal(typeof text, 'string');
  assert.deepEqual(storage.parseSave(text, validState), save);
});
