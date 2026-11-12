import { authorKey, InputError, type Draft, type Engagement, type Post } from './data.js';

export const METHOD_VERSION = 'lexical-author-lift-v1';
export type Vector = Map<string, number>;
export interface Reference { post: Post; lift: number }
export interface SimilarPost {
  id: string; author: string; similarity: number; relative_log_lift: number; contribution: number;
}
export interface Prediction {
  method_version: string; author: string; score: number; score_meaning: string; score_is_provisional: boolean;
  predicted_band: 'below_typical' | 'typical' | 'above_typical'; predicted_log_lift: number;
  estimated_engagement: number; baseline_log_engagement: number;
  baseline_kind: 'author' | 'sparse-author' | 'pooled'; author_relative_available: boolean;
  confidence: 'low' | 'moderate'; limitations: string[];
  checks: { author_history_count: number; contributing_reference_count: number; eligible_reference_count: number };
  similar_past_posts: SimilarPost[]; why: string;
  service_cost: { amount: number; currency: string; excludes: string };
}
export function median(values: number[]): number {
  if (!values.length || values.some(x => !Number.isFinite(x))) throw new InputError('median: requires finite, nonempty values');
  const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
export const engagementTotal = (post: Engagement): number => post.likes + post.comments + post.shares;
export const logEngagement = (post: Engagement): number => Math.log1p(engagementTotal(post));
function authorGroups(posts: Post[]): Map<string, Post[]> {
  const groups = new Map<string, Post[]>();
  for (const post of posts) {
    const key = authorKey(post.author);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(post);
  }
  return groups;
}
export function buildReferences(posts: Post[]): Reference[] {
  const groups = authorGroups(posts);
  return posts.flatMap(post => {
    const siblings = groups.get(authorKey(post.author))!;
    return siblings.length < 3 ? [] : [{ post, lift: logEngagement(post) - median(siblings.filter(other => other.id !== post.id).map(logEngagement)) }];
  });
}
export function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/https?:\/\/\S+/g, ' ').match(/[a-z0-9]{2,}/g) ?? [];
}
export function jaccard(left: string, right: string): number {
  const a = new Set(tokenize(left)), b = new Set(tokenize(right));
  const union = new Set([...a, ...b]).size;
  return union ? [...a].filter(token => b.has(token)).length / union : 0;
}
export function cosine(a: Vector, b: Vector): number {
  let dot = 0;
  for (const [term, value] of a) dot += value * (b.get(term) ?? 0);
  return Math.max(0, Math.min(1, dot));
}
export function buildTextIndex(texts: string[]): { vectors: Vector[]; vectorize: (text: string) => Vector } {
  const frequencies = new Map<string, number>();
  for (const text of texts) for (const word of new Set(tokenize(text))) frequencies.set(word, (frequencies.get(word) ?? 0) + 1);
  const vectorize = (text: string): Vector => {
    const counts = new Map<string, number>();
    for (const word of tokenize(text)) if (frequencies.has(word)) counts.set(word, (counts.get(word) ?? 0) + 1);
    const vector: Vector = new Map();
    let magnitude = 0;
    for (const [word, count] of counts) {
      const value = (1 + Math.log(count)) * (Math.log((texts.length + 1) / (frequencies.get(word)! + 1)) + 1);
      vector.set(word, value); magnitude += value * value;
    }
    if (magnitude > 0) for (const [word, value] of vector) vector.set(word, value / Math.sqrt(magnitude));
    return vector;
  };
  return { vectors: texts.map(vectorize), vectorize };
}
export function percentile(values: number[], target: number): number {
  if (!values.length) return 50;
  const below = values.filter(value => value < target).length;
  const equal = values.filter(value => value === target).length;
  return 100 * (below + equal / 2) / values.length;
}
export function bandForLift(lift: number): Prediction['predicted_band'] {
  return lift < -Math.log(1.25) ? 'below_typical' : lift > Math.log(1.25) ? 'above_typical' : 'typical';
}
export function scoreDraft(posts: Post[], draft: Draft): Prediction {
  if (!posts.length) throw new InputError('history: no posts available for scoring');
  const own = posts.filter(post => authorKey(post.author) === authorKey(draft.author));
  const baseline = median((own.length ? own : posts).map(logEngagement));
  const references = buildReferences(posts), index = buildTextIndex(references.map(ref => ref.post.text));
  const query = index.vectorize(draft.text);
  const selected = references.map((ref, i) => ({ ...ref, similarity: cosine(index.vectors[i]!, query) }))
    .filter(ref => ref.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity || (a.post.id < b.post.id ? -1 : a.post.id > b.post.id ? 1 : 0)).slice(0, 5);
  const denominator = selected.reduce((sum, ref) => sum + ref.similarity, 1);
  const similar: SimilarPost[] = selected.map(ref => ({
    id: ref.post.id, author: ref.post.author, similarity: ref.similarity,
    relative_log_lift: ref.lift, contribution: ref.similarity * ref.lift / denominator,
  }));
  const lift = similar.reduce((sum, ref) => sum + ref.contribution, 0);
  const estimated = Math.max(0, Math.expm1(baseline + lift));
  if (!Number.isFinite(estimated)) throw new InputError('calculation: estimated engagement is not finite');
  const eligible = own.length >= 3;
  const baselineKind: Prediction['baseline_kind'] = eligible ? 'author' : own.length ? 'sparse-author' : 'pooled';
  const limitations = ['Exploratory lexical estimate; similarity is association, not evidence of causation.',
    'No follower, impression, or publication-date adjustment; confidence is not a calibrated probability.'];
  if (!eligible) limitations.push(own.length
    ? 'Insufficient author history: count estimate uses a sparse author baseline; author-relative comparison is unavailable.'
    : 'No author history: count estimate uses a pooled baseline; author-relative comparison is unavailable.');
  if (!references.length) limitations.push('No eligible historical references: score 50 is a provisional sentinel, not a calculated percentile.');
  if (!selected.length) limitations.push('No positive text similarity: predicted lift defaults to zero.');
  const confidence = eligible && selected.length >= 3 && selected[0]!.similarity >= 0.20 ? 'moderate' : 'low';
  const why = selected.length
    ? `Estimated ${bandForLift(lift).replaceAll('_', ' ')} from ${selected.length} lexical references, led by ${selected[0]!.post.id} (similarity ${selected[0]!.similarity.toFixed(3)}). Contributions are shrunk toward zero lift. Count baseline: ${baselineKind}; author history: ${own.length}.`
    : `No contributing lexical references; use zero lift and the ${baselineKind} count baseline. Author history: ${own.length}; confidence is low.`;
  return {
    method_version: METHOD_VERSION, author: draft.author,
    score: percentile(references.map(ref => ref.lift), lift),
    score_meaning: references.length
      ? 'Midrank percentile of predicted log lift among eligible historical reference lifts; not a probability. Typical lift need not equal score 50.'
      : 'Provisional neutral sentinel (50), because no eligible references exist; not a probability.',
    score_is_provisional: !references.length, predicted_band: bandForLift(lift), predicted_log_lift: lift,
    estimated_engagement: estimated, baseline_log_engagement: baseline,
    baseline_kind: baselineKind, author_relative_available: eligible, confidence, limitations,
    checks: { author_history_count: own.length, contributing_reference_count: selected.length, eligible_reference_count: references.length },
    similar_past_posts: similar, why,
    service_cost: { amount: 0, currency: 'USD', excludes: 'Local computing and initial dependency installation costs' },
  };
}
