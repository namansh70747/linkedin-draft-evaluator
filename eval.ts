import { loadDraft, loadPosts } from './src/data.js';
import { argumentsFor, fail } from './src/cli.js';
import { scoreDraft } from './src/scoring.js';
try {
  const args = argumentsFor('score');
  const [posts,draft] = await Promise.all([loadPosts(args.posts),loadDraft(args.draft)]);
  console.log(JSON.stringify(scoreDraft(posts,draft),null,2));
} catch (error) { fail(error); }
