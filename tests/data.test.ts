import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parsePosts, parseOutcomes, parseDraft, loadPosts } from '../src/data.js';

const valid = { id: 'p1', author: 'Alice', text: 'A useful post', likes: 0, comments: 2, shares: 1 };
test('history validates records while ignoring envelope metadata', () => {
  assert.deepEqual(parsePosts({ posts: [valid], note: 'metadata' }), [valid]);
});
test('history rejects empty input, duplicates and invalid engagement without echoing private text', () => {
  for (const input of [null, { posts: [] }, { posts: [valid, valid] },
    ...[-1, 0.5, true, NaN, Number.MAX_SAFE_INTEGER + 1].map(likes => ({ posts: [{ ...valid, likes }] })),
    { posts: [{ ...valid, likes: Number.MAX_SAFE_INTEGER }] },
    { posts: [{ ...valid, author: '' }] }, { posts: [{ ...valid, text: '' }] }]) {
    assert.throws(() => parsePosts(input));
  }
});
test('draft requires a leading author and nonempty body; preserves display names', () => {
  assert.deepEqual(parseDraft('\n Author: Alice Smith \n\n Hello world \n'), { author: 'Alice Smith', text: 'Hello world' });
  for (const text of ['', 'hello', 'Author: \nbody', 'Author: Alice\n  ']) assert.throws(() => parseDraft(text));
});
test('outcomes reject traversal, duplicate drafts and unsafe counts', () => {
  const row = { draft: '01.md', author: 'Alice', likes: 1, comments: 0, shares: 0 };
  assert.equal(parseOutcomes({ outcomes: [row] }).length, 1);
  for (const input of [{ outcomes: [] }, { outcomes: [row, row] },
    ...['../01.md', 'folder/01.md', 'folder\\01.md', '01.txt'].map(draft => ({ outcomes: [{ ...row, draft }] })),
    { outcomes: [{ ...row, likes: true }] }]) assert.throws(() => parseOutcomes(input));
});
test('file failures identify the path and malformed JSON does not expose its contents', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'draft-data-'));
  try {
    await assert.rejects(loadPosts(join(dir, 'absent.json')), /absent.json/);
    const file = join(dir, 'broken.json');
    await writeFile(file, '{PRIVATE_INVALID');
    await assert.rejects(loadPosts(file), error => {
      assert.match(String(error), /broken.json/);
      assert.doesNotMatch(String(error), /PRIVATE_INVALID/);
      return true;
    });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
