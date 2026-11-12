import test from 'node:test';
import assert from 'node:assert/strict';
import { median, buildReferences, scoreDraft, tokenize, jaccard, cosine, buildTextIndex, bandForLift, percentile } from '../src/scoring.js';
import type { Post } from '../src/data.js';
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
const posts: Post[] = [
  { id: 'a', author: 'Alice', text: 'alpha', likes: 0, comments: 0, shares: 0 },
  { id: 'b', author: 'Alice', text: 'beta', likes: 3, comments: 0, shares: 0 },
  { id: 'c', author: 'Alice', text: 'gamma', likes: 15, comments: 0, shares: 0 },
];
test('medians and leave-one-out lifts do not include a post in its own baseline', () => {
  assert.equal(median([9, 1, 3]), 3); assert.equal(median([4, 2]), 3);
  assert.throws(() => median([]));
  const refs = buildReferences(posts);
  close(refs[0]!.lift, -2.0794415416798357);
  close(refs[1]!.lift, 0); close(refs[2]!.lift, 2.0794415416798357);
  assert.equal(buildReferences(posts.slice(0, 2)).length, 0);
});
test('text weighting ignores unknown vocabulary and yields normalized similarities', () => {
  assert.deepEqual(tokenize('HELLO https://example.com/private A 42!'), ['hello', '42']);
  const index = buildTextIndex(['alpha alpha beta', 'beta']);
  close(cosine(index.vectors[0]!, index.vectorize('alpha alpha beta')), 1);
  close(cosine(index.vectors[0]!, index.vectorize('unknown')), 0);
  // alpha weight=2.379659285, beta=1; cosine against beta is independently 0.38741133.
  assert.ok(Math.abs(cosine(index.vectors[0]!, index.vectors[1]!) - 0.38741133) < 1e-7);
});
test('one exact reference produces the hand-calculated shrunken lift and count', () => {
  const result = scoreDraft(posts, { author: ' alice ', text: 'gamma' });
  close(result.predicted_log_lift, 1.0397207708399179);
  close(result.estimated_engagement, 10.313708498984761);
  close(result.score, 66.66666666666667);
  assert.equal(result.predicted_band, 'above_typical');
  assert.equal(result.similar_past_posts[0]!.id, 'c');
  close(result.similar_past_posts[0]!.contribution, result.predicted_log_lift);
  assert.equal(result.baseline_kind, 'author'); assert.equal(result.confidence, 'low');
  assert.equal(result.author_relative_available, true);
  assert.match(result.why, /c/);
  assert.deepEqual(result, scoreDraft(posts, { author: ' alice ', text: 'gamma' }));
});
test('unseen and sparse authors explicitly disclose baseline fallback and history counts', () => {
  const unknown = scoreDraft(posts, { author: 'New author', text: 'gamma' });
  assert.equal(unknown.baseline_kind, 'pooled'); assert.equal(unknown.author_relative_available, false);
  assert.equal(unknown.confidence, 'low'); assert.equal(unknown.checks.author_history_count, 0);
  for (const count of [1, 2]) {
    const sparse = scoreDraft(posts.slice(0, count), { author: 'Alice', text: 'alpha' });
    assert.equal(sparse.baseline_kind, 'sparse-author'); assert.equal(sparse.confidence, 'low');
    assert.equal(sparse.checks.author_history_count, count); assert.equal(sparse.score, 50);
    assert.equal(sparse.score_is_provisional, true); assert.equal(sparse.author_relative_available, false);
  }
});
test('no overlapping words produces neutral lift with an explicit evidence warning', () => {
  const result = scoreDraft(posts, { author: 'Alice', text: 'unseenword' });
  assert.equal(result.predicted_log_lift, 0); assert.equal(result.similar_past_posts.length, 0);
  assert.equal(result.confidence, 'low'); assert.ok(result.limitations.some(x => /similarity/i.test(x)));
});
test('reference limit and equal-similarity ordering are deterministic; moderate is evidence-based', () => {
  const history = Array.from({ length: 6 }, (_, i) => ({ ...posts[1]!, id: `p${5-i}`, text: 'shared words' }));
  const result = scoreDraft(history, { author: 'Alice', text: 'shared words' });
  assert.deepEqual(result.similar_past_posts.map(x => x.id), ['p0', 'p1', 'p2', 'p3', 'p4']);
  assert.equal(result.confidence, 'moderate'); assert.equal(result.score, 50);
});
test('band boundaries, midrank ties and overlap are defined independently of display rounding', () => {
  assert.equal(bandForLift(Math.log(1.25)), 'typical');
  assert.equal(bandForLift(-Math.log(1.25)), 'typical');
  assert.equal(bandForLift(-0.3), 'below_typical');
  assert.equal(percentile([0, 0, 1, 2], 0), 25);
  close(jaccard('alpha beta gamma', 'alpha beta delta'), 0.5);
  assert.equal(jaccard('', ''), 0);
});
