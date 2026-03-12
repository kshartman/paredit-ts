import type { AST } from "./types";
import { getChildren, hasChildren } from "./types";
import { flatFilterTree, last, mapTree } from "./util";

export type MatchFunc = (node: AST) => boolean;

export { hasChildren };

/** Find all ancestor s-expressions containing `idx`, optionally filtered. */
export function containingSexpsAt(ast: AST, idx: number, matchFunc?: MatchFunc): AST[] {
  return flatFilterTree(
    ast,
    (n) => {
      const inside =
        n.type === "toplevel" ||
        (n.type === "error" && n.start < idx && idx <= n.end) ||
        (n.start < idx && idx < n.end);
      return inside && (!matchFunc || matchFunc(n));
    },
    getChildren,
  );
}

/** Find all s-expressions whose range includes `idx`, optionally filtered. */
export function sexpsAt(ast: AST, idx: number, matchFunc?: MatchFunc): AST[] {
  return flatFilterTree(
    ast,
    (n) => n.start <= idx && idx <= n.end && (!matchFunc || matchFunc(n)),
    getChildren,
  );
}

/** Find the next s-expression after `idx`. */
export function nextSexp(ast: AST, idx: number, matchFunc?: MatchFunc): AST | null {
  const listsAt = flatFilterTree(ast, (n) => n.start <= idx && idx < n.end && hasChildren(n), getChildren);

  if (!listsAt.length) return null;

  // Direct hit: a list starting exactly at idx
  const direct = listsAt.find((n) => n.start === idx && n.type !== "toplevel");
  if (direct) return direct;

  const parent = last(listsAt);
  if (!parent || !hasChildren(parent)) return null;

  const candidates = parent.children.filter((n) => idx <= n.start && (!matchFunc || matchFunc(n)));
  return candidates[0] ?? null;
}

/** Find the previous s-expression before `idx`. */
export function prevSexp(ast: AST, idx: number, matchFunc?: MatchFunc): AST | null {
  const listsAt = flatFilterTree(ast, (n) => n.start < idx && idx <= n.end && hasChildren(n), getChildren);

  if (!listsAt.length) return null;

  const direct = listsAt.find((n) => n.end === idx && n.type !== "toplevel");
  if (direct) return direct;

  const parent = last(listsAt);
  if (!parent || !hasChildren(parent)) return null;

  const candidates = parent.children.filter((n) => n.end <= idx && (!matchFunc || matchFunc(n)));
  return last(candidates) ?? null;
}

/** Stringify an AST node back to a source-like representation. */
export function stringify(node: AST): string {
  return mapTree<AST, string>(
    node,
    (n, children) => {
      if (n.type === "list" || n.type === "toplevel") {
        return "(" + children.join(" ") + ")";
      }
      return "source" in n && n.source ? n.source : "x".repeat(n.end - n.start);
    },
    (n) => getChildren(n) as unknown as AST[],
  );
}

/** Extract source text for a node. */
export function source(src: string, node: AST): string {
  return "source" in node && node.source ? node.source : src.slice(node.start, node.end);
}
