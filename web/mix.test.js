import test from 'node:test';
import assert from 'node:assert/strict';
import { mix, lines } from './mix.js';

test('mixes every combination', () => {
  assert.equal(mix('n', ['a', 'b'], ['x', 'y'], ['1', '2', '3']).length, 12);
  assert.deepEqual(lines(' a\n\na\nb '), ['a', 'b']);
});
