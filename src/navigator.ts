import type { AST } from "./types";
import { hasChildren } from "./types";
import { last } from "./util";
import * as walk from "./walk";

/** Move forward past the current or next s-expression. */
export function forwardSexp(ast: AST, idx: number): number {
  const current = last(
    walk.containingSexpsAt(ast, idx, (n) => !hasChildren(n)),
  );
  if (current) return current.end;

  const next = walk.nextSexp(ast, idx);
  return next ? next.end : idx;
}

/** Move backward before the current or previous s-expression. */
export function backwardSexp(ast: AST, idx: number): number {
  const current = last(
    walk.containingSexpsAt(ast, idx, (n) => !hasChildren(n)),
  );
  if (current) return current.start;

  const prev = walk.prevSexp(ast, idx);
  return prev ? prev.start : idx;
}

/** Move forward and down into the next list. */
export function forwardDownSexp(ast: AST, idx: number): number {
  const next = walk.nextSexp(ast, idx, (n) => n.type === "list");
  if (!next) return idx;
  if (hasChildren(next) && next.children[0]) {
    return next.children[0].start;
  }
  return next.start + 1;
}

/** Move backward and up out of the current list. */
export function backwardUpSexp(ast: AST, idx: number): number {
  const containing = walk.containingSexpsAt(
    ast,
    idx,
    (n) => n.type === "list" || n.type === "string" || n.type === "comment",
  );
  if (!containing.length) return idx;
  return last(containing)!.start;
}

/** Move to the closing bracket of the containing list. */
export function closeList(ast: AST, idx: number): number | undefined {
  const containing = walk.containingSexpsAt(ast, idx);
  const l = last(containing);
  if (!l || l.type === "toplevel") return idx;
  if (l.type === "string" || l.type === "comment") return undefined;
  const lists = containing.filter(hasChildren);
  return last(lists)?.end ?? idx;
}

/** Find the range of the s-expression at `idx`. */
export function sexpRange(ast: AST, idx: number): [number, number] | null {
  return sexpRangeExpansion(ast, idx, idx);
}

/** Expand a selection range to the next enclosing s-expression. */
export function sexpRangeExpansion(ast: AST, startIdx: number, endIdx: number): [number, number] | null {
  if (startIdx !== endIdx) {
    const directMatchedStart = last(walk.sexpsAt(ast, startIdx, (n) => n.start === startIdx));
    const directMatchedEnd = directMatchedStart && last(walk.sexpsAt(ast, endIdx, (n) => n.end === endIdx));
    if (directMatchedStart && directMatchedEnd) {
      const directLeft = last(walk.sexpsAt(ast, startIdx, (n) => n.start < startIdx && !hasChildren(n)));
      if (directLeft) return [directLeft.start, endIdx];
      const directRight = last(walk.sexpsAt(ast, endIdx, (n) => endIdx < n.end && !hasChildren(n)));
      if (directRight) return [startIdx, directRight.end];
    }
  }

  const candidates = walk.sexpsAt(ast, startIdx).concat(walk.sexpsAt(ast, endIdx));
  const sexp = last(
    candidates.filter((n) => {
      if (n.type === "toplevel") return false;
      if (startIdx === endIdx) return n.start <= startIdx && endIdx <= n.end;
      if (n.start === startIdx) return endIdx < n.end;
      if (n.end === endIdx) return n.start < startIdx;
      return n.start < startIdx && endIdx < n.end;
    }),
  );

  if (!sexp) return null;

  if (sexp.type === "list" || sexp.type === "string") {
    const isBorder = sexp.start === startIdx || sexp.end === endIdx;
    if (isBorder && (startIdx === sexp.start || endIdx === sexp.end)) {
      return [sexp.start, sexp.end];
    }
    if (sexp.start + 1 < startIdx || endIdx < sexp.end - 1) {
      return [sexp.start + 1, sexp.end - 1];
    }
  }

  return [sexp.start, sexp.end];
}

/** Find the range of the top-level defun containing `idx`. */
export function rangeForDefun(ast: AST, idx: number): [number, number] | null {
  if (!hasChildren(ast)) return null;
  const node = ast.children.find((n) => n.start <= idx && idx <= n.end);
  return node ? [node.start, node.end] : null;
}
