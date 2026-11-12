import { join } from 'node:path';
import { loadDraft, loadOutcomes, loadPosts, type Draft } from './src/data.js';
import { argumentsFor, fail } from './src/cli.js';
import { evaluateHistory } from './src/evaluation.js';
try {
  const args = argumentsFor('evaluate');
  const [posts,outcomes] = await Promise.all([loadPosts(args.posts),loadOutcomes(args.outcomes)]);
  const drafts = new Map<string,Draft>();
  for (const outcome of outcomes) drafts.set(outcome.draft,await loadDraft(join(args.drafts,outcome.draft)));
  console.log(JSON.stringify(evaluateHistory(posts,drafts,outcomes),null,2));
} catch (error) { fail(error); }
