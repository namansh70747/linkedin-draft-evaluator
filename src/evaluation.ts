import { authorKey, InputError, type Draft, type Outcome, type Post } from './data.js';
import { meanAbsoluteError, spearman } from './metrics.js';
import { engagementTotal, jaccard, logEngagement, METHOD_VERSION, scoreDraft, type Prediction } from './scoring.js';

interface EvaluationRow {
  draft: string; author: string; prediction: Prediction; excluded_reference_ids: string[];
  actual_engagement: number; baseline_engagement: number; actual_log_lift: number | null;
}
function summarize(rows: EvaluationRow[]) {
  const eligible = rows.filter(row => row.actual_log_lift !== null);
  const actualLogs = rows.map(row => Math.log1p(row.actual_engagement));
  const actualLifts = eligible.map(row => row.actual_log_lift!);
  const predictedLifts = eligible.map(row => row.prediction.predicted_log_lift);
  return {
    total_count: rows.length, author_relative_count: eligible.length,
    author_relative_coverage: `${eligible.length}/${rows.length}`,
    count_mean_absolute_log_error: meanAbsoluteError(actualLogs, rows.map(row => Math.log1p(row.prediction.estimated_engagement))),
    baseline_count_mean_absolute_log_error: meanAbsoluteError(actualLogs, rows.map(row => row.prediction.baseline_log_engagement)),
    relative_lift_mean_absolute_error: meanAbsoluteError(actualLifts, predictedLifts),
    baseline_relative_lift_mean_absolute_error: meanAbsoluteError(actualLifts, eligible.map(() => 0)),
    relative_spearman: spearman(actualLifts, predictedLifts),
    baseline_relative_spearman: spearman(actualLifts, eligible.map(() => 0)),
  };
}
export function evaluateHistory(posts: Post[], drafts: Map<string, Draft>, outcomes: Outcome[]) {
  if (!outcomes.length) throw new InputError('evaluation: no outcomes supplied');
  // This phase uses only draft identities, never outcome engagement values.
  const predictions = outcomes.map(outcome => {
    const draft = drafts.get(outcome.draft);
    if (!draft) throw new InputError(`${outcome.draft}: draft is missing`);
    if (authorKey(draft.author) !== authorKey(outcome.author)) throw new InputError(`${outcome.draft}: outcome author does not match draft author`);
    const excluded = posts.filter(post => jaccard(post.text, draft.text) >= 0.70).map(post => post.id);
    const excludedSet = new Set(excluded);
    const remaining = posts.filter(post => !excludedSet.has(post.id));
    if (!remaining.length) throw new InputError(`${outcome.draft}: overlap exclusion leaves no history; cannot complete sensitivity evaluation`);
    return { normal: scoreDraft(posts,draft), sensitivity: scoreDraft(remaining,draft), excluded };
  });
  const pass = (kind: 'normal' | 'sensitivity') => {
    const rows: EvaluationRow[] = outcomes.map((outcome, i) => {
      const prediction = predictions[i]![kind];
      return { draft:outcome.draft, author:outcome.author, prediction,
        excluded_reference_ids:kind === 'sensitivity' ? predictions[i]!.excluded : [],
        actual_engagement:engagementTotal(outcome), baseline_engagement:Math.expm1(prediction.baseline_log_engagement),
        actual_log_lift:prediction.author_relative_available ? logEngagement(outcome) - prediction.baseline_log_engagement : null };
    });
    return {rows,metrics:summarize(rows)};
  };
  const normal = pass('normal'), sensitivity = pass('sensitivity');
  const improves = [normal.metrics,sensitivity.metrics].every(metrics =>
    metrics.count_mean_absolute_log_error! < metrics.baseline_count_mean_absolute_log_error! &&
    metrics.relative_lift_mean_absolute_error !== null &&
    metrics.relative_lift_mean_absolute_error < metrics.baseline_relative_lift_mean_absolute_error!);
  return {
    method_version:METHOD_VERSION,
    definitions: {
      engagement:'likes + comments + shares',
      count_error:'Mean absolute difference between log1p(actual engagement) and log1p(estimated engagement); lower is better.',
      relative_error:'Mean absolute log-lift error for eligible author histories only; lower is better.',
      baseline:'Zero predicted lift using the same author/sparse/pooled baseline as the corresponding prediction.',
      sensitivity:'Per draft, exclude history with token-set Jaccard >= 0.70 and rebuild all statistics and vectors.',
      correlation:'Descriptive Spearman rank correlation with average ranks for ties; no significance claim.',
    },
    normal, sensitivity,
    evaluation_limitations:[
      'Known outcomes were inspected during brief review; this is not a blind evaluation.',
      'Few outcomes and uneven history provide preliminary evidence only; unobserved audience size and post age can affect results.',
      'Pooled and sparse-baseline count comparisons do not validate author-relative performance for unsupported authors.',
      'Overlap exclusion is a robustness heuristic; chronology and independence are unknown.',
    ],
    trust_judgement: improves
      ? 'This preliminary small-sample evaluation improves count and eligible-author lift error over baseline in both passes, but I would use it only as exploratory guidance, not for autonomous publishing decisions.'
      : 'Predictive value has not been demonstrated consistently against the baseline in both passes; this preliminary small-sample result supports exploratory use only, not autonomous publishing decisions.',
  };
}
