import { InputError } from './data.js';
function validate(a: number[], b: number[]): void {
  if (a.length !== b.length || [...a, ...b].some(x => !Number.isFinite(x))) throw new InputError('metrics: vectors must have equal length and finite values');
}
export function meanAbsoluteError(actual: number[], predicted: number[]): number | null {
  validate(actual, predicted);
  return actual.length ? actual.reduce((sum, value, i) => sum + Math.abs(value - predicted[i]!), 0) / actual.length : null;
}
export function ranks(values: number[]): number[] {
  const indexed = values.map((value, index) => ({value, index})).sort((a,b) => a.value - b.value);
  const result = new Array<number>(values.length);
  for (let start = 0; start < indexed.length;) {
    let end = start + 1;
    while (end < indexed.length && indexed[end]!.value === indexed[start]!.value) end++;
    for (let i = start; i < end; i++) result[indexed[i]!.index] = (start + 1 + end) / 2;
    start = end;
  }
  return result;
}
export function spearman(actual: number[], predicted: number[]): { value: number | null; reason: string | null } {
  validate(actual, predicted);
  if (actual.length < 2) return {value:null,reason:'At least two eligible rows are required.'};
  const a = ranks(actual), b = ranks(predicted), mean = (a.length + 1) / 2;
  let cross = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]! - mean, y = b[i]! - mean;
    cross += x*y; aa += x*x; bb += y*y;
  }
  if (!aa || !bb) return {value:null,reason:'Correlation unavailable for a constant rank vector.'};
  return {value:Math.max(-1,Math.min(1,cross / Math.sqrt(aa*bb))),reason:null};
}
