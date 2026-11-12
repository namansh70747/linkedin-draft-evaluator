import { parseArgs } from 'node:util';
import { InputError } from './data.js';
export function argumentsFor(mode: 'score' | 'evaluate') {
  const usage = mode === 'score' ? 'eval.ts <draft-path> --posts <posts-path>' : 'evaluate.ts --posts <posts-path> --drafts <directory> --outcomes <outcomes-path>';
  try {
    const options: Record<string, { type: 'string' }> = {posts:{type:'string'}};
    if (mode === 'evaluate') { options.drafts = {type:'string'}; options.outcomes = {type:'string'}; }
    const {values,positionals} = parseArgs({args:process.argv.slice(2),options,allowPositionals:true,strict:true});
    const posts = values.posts;
    if (typeof posts !== 'string' || !posts.trim()) throw new Error();
    if (mode === 'score') {
      if (positionals.length !== 1) throw new Error();
      return {posts,draft:positionals[0]!,drafts:'',outcomes:''};
    }
    const drafts = values.drafts, outcomes = values.outcomes;
    if (positionals.length || typeof drafts !== 'string' || !drafts.trim() || typeof outcomes !== 'string' || !outcomes.trim()) throw new Error();
    return {posts,draft:'',drafts,outcomes};
  } catch { throw new InputError(`Usage: ${usage}`); }
}
export function fail(error: unknown): void {
  console.error(error instanceof InputError ? error.message : 'Unexpected failure; check input files and runtime compatibility.');
  process.exitCode = 1;
}
