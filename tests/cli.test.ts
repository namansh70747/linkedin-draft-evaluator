import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const run = (entry: string, args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', resolve(entry), ...args], { encoding:'utf8', timeout:15000 });
test('actual CLI returns JSON, leaves sources unchanged, and fails without success output', async () => {
 const dir = await mkdtemp(join(tmpdir(),'draft-cli-'));
 try {
  const posts = join(dir,'posts.json'), draft = join(dir,'01.md'), outcomes = join(dir,'outcomes.json');
  const source = JSON.stringify({posts:[0,3,15].map((likes,i) => ({id:`p${i}`,author:'Alice',text:['alpha','beta','gamma'][i],likes,comments:0,shares:0}))});
  await writeFile(posts,source); await writeFile(draft,'Author: Alice\n\ngamma');
  await writeFile(outcomes,JSON.stringify({outcomes:[{draft:'01.md',author:'Alice',likes:15,comments:0,shares:0}]}));
  const score = run('eval.ts',[draft,'--posts',posts]);
  assert.equal(score.status,0,score.stderr); assert.equal(score.stderr,'');
  const parsed = JSON.parse(score.stdout); assert.equal(parsed.author,'Alice'); assert.equal(parsed.service_cost.amount,0);
  const evaluation = run('evaluate.ts',['--posts',posts,'--drafts',dir,'--outcomes',outcomes]);
  assert.equal(evaluation.status,0,evaluation.stderr); assert.equal(JSON.parse(evaluation.stdout).normal.rows.length,1);
  assert.equal(await readFile(posts,'utf8'),source); assert.equal(await readFile(draft,'utf8'),'Author: Alice\n\ngamma');
  for (const args of [[], [draft], [draft,'--posts',posts,'--bad'], [join(dir,'absent.md'),'--posts',posts]]) {
   const failed = run('eval.ts',args); assert.equal(failed.status,1); assert.equal(failed.stdout,''); assert.ok(failed.stderr.trim());
  }
  await writeFile(draft,'Author: Alice\n');
  const empty = run('eval.ts',[draft,'--posts',posts]); assert.equal(empty.status,1); assert.equal(empty.stdout,'');
  await writeFile(outcomes,'{private_invalid');
  const invalid = run('evaluate.ts',['--posts',posts,'--drafts',dir,'--outcomes',outcomes]);
  assert.equal(invalid.status,1); assert.equal(invalid.stdout,''); assert.doesNotMatch(invalid.stderr,/private_invalid/);
 } finally { await rm(dir,{recursive:true,force:true}); }
});
