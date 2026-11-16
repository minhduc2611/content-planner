import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, tooManyAttempts, hashToken } from './auth.js';

test('password hash round-trips and rejects wrong password', async () => {
  const h = await hashPassword('correct horse');
  assert.equal(await verifyPassword('correct horse', h), true);
  assert.equal(await verifyPassword('wrong horse', h), false);
  assert.notEqual(h, await hashPassword('correct horse')); // salted
});

test('rate limiter blocks after max attempts', () => {
  for (let i = 0; i < 3; i++) assert.equal(tooManyAttempts('k', 3), false);
  assert.equal(tooManyAttempts('k', 3), true);
});

test('token hash is stable', () => assert.equal(hashToken('a'), hashToken('a')));
