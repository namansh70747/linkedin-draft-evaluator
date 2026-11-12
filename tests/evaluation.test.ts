import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateHistory } from '../src/evaluation.js';
import type { Post, Outcome, Draft } from '../src/data.js';
const history: Post[] = [
 {id:'a1', author:'Alice', text:'alpha', likes:0, comments:0, shares:0},
 {id:'a2', author:'Alice', text:'beta', likes:3, comments:0, shares:0},
 {id:'a3', author:'Alice', text:'gamma', likes:15, comments:0, shares:0},
 {id:'b1', author:'Bob', text:'delta', likes:1, comments:0, shares:0},
 {id:'b2', author:'Bob', text:'epsilon', likes:7, comments:0, shares:0},
 {id:'b3', author:'Bob', text:'zeta', likes:31, comments:0, shares:0},
];
const drafts = new Map<string, Draft>([['01.md', {author:'Alice', text:'gamma'}], ['02.md', {author:'New', text:'unknown'}]]);
const outcomes: Outcome[] = [
 {draft:'01.md', author:'Alice', likes:15, comments:0, shares:0},
 {draft:'02.md', author:'New', likes:8, comments:0, shares:0},
];
test('evaluation covers all rows, marks eligibility and recomputes after overlap exclusion', () => {
 const report = evaluateHistory(history, drafts, outcomes);
 assert.equal(report.normal.rows.length, 2);
 assert.equal(report.normal.metrics.author_relative_count, 1);
 assert.equal(report.normal.metrics.total_count, 2);
 assert.equal(report.normal.rows[0]!.actual_engagement, 15);
 assert.equal(report.normal.rows[1]!.actual_log_lift, null);
 assert.deepEqual(report.sensitivity.rows[0]!.excluded_reference_ids, ['a3']);
 assert.equal(report.sensitivity.rows[0]!.prediction.checks.author_history_count, 2);
 assert.equal(report.sensitivity.rows[0]!.prediction.checks.eligible_reference_count, 3);
 assert.equal(report.sensitivity.metrics.author_relative_count, 0);
 assert.ok(Math.abs(report.sensitivity.rows[0]!.baseline_engagement - 1) < 1e-12);
 assert.match(report.trust_judgement, /preliminary/i);
});
test('outcome changes cannot alter predictions in either pass', () => {
 const a = evaluateHistory(history, drafts, outcomes);
 const b = evaluateHistory(history, drafts, outcomes.map(o => ({...o, likes:200})));
 for (const pass of ['normal', 'sensitivity'] as const) {
  assert.deepEqual(a[pass].rows.map(r => r.prediction), b[pass].rows.map(r => r.prediction));
  assert.notEqual(a[pass].metrics.count_mean_absolute_log_error, b[pass].metrics.count_mean_absolute_log_error);
 }
});
test('evaluation rejects missing drafts, author mismatch and exclusion of all history', () => {
 assert.throws(() => evaluateHistory(history, new Map(), outcomes), /draft/i);
 assert.throws(() => evaluateHistory(history, new Map([['01.md',{author:'Wrong',text:'gamma'}]]), outcomes), /author/i);
 const repeated = history.map(p => ({...p,text:'same words'}));
 assert.throws(() => evaluateHistory(repeated, new Map([['01.md',{author:'Alice',text:'same words'}]]), outcomes.slice(0,1)), /history/i);
});

test('count error and actual lift use the same natural-log1p baseline: hand-worked row', () => {
 const report = evaluateHistory(history, drafts, outcomes.slice(0,1));
 const row = report.normal.rows[0]!;
 // Alice history counts 0,3,15: baseline ln(4); actual ln(16); predicted lift ln(8)/2.
 assert.ok(Math.abs(row.prediction.baseline_log_engagement - 1.3862943611198906) < 1e-12);
 assert.ok(Math.abs(row.actual_log_lift! - 1.3862943611198906) < 1e-12);
 assert.ok(Math.abs(report.normal.metrics.count_mean_absolute_log_error! - 0.3465735902799727) < 1e-12);
 assert.ok(Math.abs(report.normal.metrics.baseline_count_mean_absolute_log_error! - 1.3862943611198906) < 1e-12);
});

test('zero-clamped predictions have finite log1p error', () => {
 const withSparse = [...history, {id:'s1',author:'Sparse',text:'unrelated',likes:0,comments:0,shares:0}];
 const report = evaluateHistory(withSparse, new Map([['zero.md',{author:'Sparse',text:'alpha'}]]),
  [{draft:'zero.md',author:'Sparse',likes:3,comments:0,shares:0}]);
 assert.equal(report.normal.rows[0]!.prediction.estimated_engagement,0);
 assert.ok(Math.abs(report.normal.metrics.count_mean_absolute_log_error! - 1.3862943611198906) < 1e-12);
 assert.ok(Math.abs(report.normal.metrics.baseline_count_mean_absolute_log_error! - 1.3862943611198906) < 1e-12);
});

test('sensitivity actual lift and baseline error use the rebuilt author median', () => {
 const expanded = [...history, {id:'a4',author:'Alice',text:'theta',likes:63,comments:0,shares:0}];
 const report = evaluateHistory(expanded,drafts,outcomes.slice(0,1));
 const before = report.normal.rows[0]!, after = report.sensitivity.rows[0]!;
 assert.ok(Math.abs(before.prediction.baseline_log_engagement - 2.0794415416798357) < 1e-12);
 assert.ok(Math.abs(after.prediction.baseline_log_engagement - 1.3862943611198906) < 1e-12);
 assert.equal(after.prediction.author_relative_available,true);
 assert.ok(Math.abs(after.actual_log_lift! - 1.3862943611198906) < 1e-12);
 assert.ok(Math.abs(report.sensitivity.metrics.count_mean_absolute_log_error! - 1.3862943611198906) < 1e-12);
 assert.ok(Math.abs(report.sensitivity.metrics.baseline_count_mean_absolute_log_error! - 1.3862943611198906) < 1e-12);
});

test('loaded history counts include sparse authors and normalize author identity', () => {
 const extended = [...history, {id:'s1',author:' ALICE ',text:'extra',likes:0,comments:0,shares:0},
  {id:'s2',author:'Sparse',text:'extra',likes:0,comments:0,shares:0}];
 assert.deepEqual(evaluateHistory(extended,drafts,outcomes).history_summary, {post_count:8,author_count:3});
});
