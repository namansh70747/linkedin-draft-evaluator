import { readFile } from 'node:fs/promises';

export interface Engagement { likes: number; comments: number; shares: number }
export interface Post extends Engagement { id: string; author: string; text: string }
export interface Draft { author: string; text: string }
export interface Outcome extends Engagement { draft: string; author: string }
export class InputError extends Error {}
export const authorKey = (author: string): string => author.trim().toLowerCase();

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError(`${label}: expected an object`);
  return value as Record<string, unknown>;
}
function nonempty(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new InputError(`${label}: expected nonempty text`);
  return value.trim();
}
function engagement(row: Record<string, unknown>, label: string): Engagement {
  for (const field of ['likes', 'comments', 'shares'] as const) {
    if (typeof row[field] !== 'number' || !Number.isSafeInteger(row[field]) || row[field] < 0) {
      throw new InputError(`${label}.${field}: expected a nonnegative safe integer`);
    }
  }
  const result = { likes: row.likes as number, comments: row.comments as number, shares: row.shares as number };
  if (!Number.isSafeInteger(result.likes + result.comments + result.shares)) throw new InputError(`${label}: engagement sum exceeds safe integer range`);
  return result;
}
function records(value: unknown, key: string): unknown[] {
  const rows = object(value, key)[key];
  if (!Array.isArray(rows) || !rows.length) throw new InputError(`${key}: expected a nonempty array`);
  return rows;
}
export function parsePosts(value: unknown): Post[] {
  const ids = new Set<string>();
  return records(value, 'posts').map((value, index) => {
    const label = `posts[${index}]`, row = object(value, label);
    const id = nonempty(row.id, `${label}.id`);
    if (ids.has(id)) throw new InputError(`${label}.id: duplicate ID`);
    ids.add(id);
    return { id, author: nonempty(row.author, `${label}.author`), text: nonempty(row.text, `${label}.text`), ...engagement(row, label) };
  });
}
export function parseOutcomes(value: unknown): Outcome[] {
  const names = new Set<string>();
  return records(value, 'outcomes').map((value, index) => {
    const label = `outcomes[${index}]`, row = object(value, label);
    const draft = nonempty(row.draft, `${label}.draft`);
    if (!/^[a-zA-Z0-9_-]+\.md$/.test(draft)) throw new InputError(`${label}.draft: expected a simple Markdown filename`);
    if (names.has(draft)) throw new InputError(`${label}.draft: duplicate draft`);
    names.add(draft);
    return { draft, author: nonempty(row.author, `${label}.author`), ...engagement(row, label) };
  });
}
export function parseDraft(value: string): Draft {
  const lines = value.trim().split(/\r?\n/);
  const author = /^\s*Author:\s*(.+?)\s*$/.exec(lines[0] ?? '')?.[1]?.trim();
  if (!author) throw new InputError('draft: first nonempty line must be Author: <name>');
  const text = lines.slice(1).join('\n').trim();
  if (!text) throw new InputError('draft: post body is empty');
  return { author, text };
}
async function readText(path: string): Promise<string> {
  try { return await readFile(path, 'utf8'); }
  catch { throw new InputError(`${path}: cannot read file; check the path and read permissions`); }
}
async function loadJSON<T>(path: string, parse: (value: unknown) => T): Promise<T> {
  const text = await readText(path);
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new InputError(`${path}: invalid JSON`); }
  try { return parse(value); }
  catch (error) { throw new InputError(`${path}: ${(error as Error).message}`); }
}
export const loadPosts = (path: string): Promise<Post[]> => loadJSON(path, parsePosts);
export const loadOutcomes = (path: string): Promise<Outcome[]> => loadJSON(path, parseOutcomes);
export async function loadDraft(path: string): Promise<Draft> {
  const text = await readText(path);
  try { return parseDraft(text); }
  catch (error) { throw new InputError(`${path}: ${(error as Error).message}`); }
}
