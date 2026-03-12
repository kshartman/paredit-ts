import type { AST, InnerNode } from "./types";

/** Shallow merge of multiple objects into a new object. */
export function merge<T extends object>(...objects: Partial<T>[]): T {
  return Object.assign({} as T, ...objects);
}

/** Recursively map a tree, bottom-up. Input and output types may differ. */
export function mapTree<TIn, TOut>(
  node: TIn,
  mapFn: (node: TIn, mappedChildren: TOut[]) => TOut,
  childGetter: (node: TIn) => TIn[],
): TOut {
  const mappedChildren = (childGetter(node) ?? []).map((child) => mapTree(child, mapFn, childGetter));
  return mapFn(node, mappedChildren);
}

/** Recursively collect all nodes matching `testFn`, in tree order. */
export function flatFilterTree(
  node: AST,
  testFn: (node: AST) => boolean,
  childGetter: (node: AST) => InnerNode[],
): AST[] {
  const result: AST[] = [];
  if (testFn(node)) {
    result.push(node);
  }
  for (const child of childGetter(node)) {
    result.push(...flatFilterTree(child, testFn, childGetter));
  }
  return result;
}

/** Return the last element of an array, or undefined. */
export function last<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1];
}

/** Repeat a character `n` times. */
export function times(n: number, ch: string): string {
  return ch.repeat(Math.max(0, n));
}
