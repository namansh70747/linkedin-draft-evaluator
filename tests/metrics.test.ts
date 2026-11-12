import test from 'node:test';
import assert from 'node:assert/strict';
import { meanAbsoluteError, ranks, spearman } from '../src/metrics.js';
test('error measure has independently calculated values and rejects mismatched/nonfinite vectors', () => {
  assert.equal(meanAbsoluteError([1, 3], [2, 5]), 1.5);
  assert.equal(meanAbsoluteError([], []), null);
  assert.throws(() => meanAbsoluteError([1], []));
  assert.throws(() => meanAbsoluteError([NaN], [1]));
});
test('Spearman handles perfect, reversed, tied and undefined ranks', () => {
  assert.equal(spearman([1, 2, 3], [2, 4, 6]).value, 1);
  assert.equal(spearman([1, 2, 3], [6, 4, 2]).value, -1);
  assert.deepEqual(ranks([10, 10, 30]), [1.5, 1.5, 3]);
  assert.ok(Math.abs(spearman([1, 1, 2], [1, 2, 3]).value! - 0.8660254037844387) < 1e-10);
  assert.equal(spearman([1, 1], [1, 2]).value, null);
  assert.match(spearman([1], [2]).reason!, /two/);
});
