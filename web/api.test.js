import test from 'node:test';
import assert from 'node:assert/strict';
import { api, _cacheKeys } from './api.js';

let calls = 0;
globalThis.fetch = async () => { calls++; return { ok: true, json: async () => ({ n: calls }) }; };

test('GET is cached and concurrent GETs share one request', async () => {
  calls = 0;
  const [a, b] = await Promise.all([api('/guides'), api('/guides')]);
  assert.equal(calls, 1);
  assert.deepEqual(a, b);
  await api('/guides');
  assert.equal(calls, 1);
});

test('writes invalidate related paths only', async () => {
  await Promise.all(['/projects', '/projects/5', '/projects/5/notes?sub=a', '/projects/6', '/guides'].map(p => api(p)));
  await api('/projects/5/notes/9', { body: '{}' });
  assert.deepEqual(_cacheKeys().sort(), ['/guides', '/projects/6']);
});

test('auth calls clear everything', async () => {
  await api('/projects');
  await api('/logout', {}, 'POST');
  assert.deepEqual(_cacheKeys(), []);
});

test('failed GET is not cached', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({ error: 'boom' }) });
  await assert.rejects(api('/projects'));
  assert.deepEqual(_cacheKeys(), []);
});
