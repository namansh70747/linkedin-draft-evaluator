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
