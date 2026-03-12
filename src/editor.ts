import type { AST, EditorChange, EditorChanges, IndentResult, InnerNode, ParentNode } from "./types";
import { getChildren, hasChildren } from "./types";
import { last, mapTree, merge, times } from "./util";
import * as walk from "./walk";

// Clojure special forms for indentation
export const specialForms: (string | RegExp)[] = [
  "&",
  "monitor-exit",
  /^case/,
  "try",
  /^reify/,
  "finally",
  /^(.*-)?loop/,
  /^do/,
  /^let/,
  /^import/,
  "new",
  /^deftype/,
  "fn",
  "recur",
  /^set.*!$/,
  ".",
  "var",
  "quote",
  "catch",
  "throw",
  "monitor-enter",
  "ns",
  "in-ns",
  /^([^/]+\/)?def/,
  /^if/,
  /^when/,
  /^unless/,
  /->$/,
  "while",
  "for",
  /(^|\/)with/,
  "testing",
  "cond",
  "condp",
  "apply",
  "binding",
  "locking",
  "proxy",
  "reify",
  /^extend/,
  "facts", // midje
];

// ── AST helpers ──

function moveNode(offset: number, n: AST): AST {
  return mapTree<AST, AST>(
    n,
    (node, children) => ({
      ...node,
      start: node.start + offset,
      end: node.end + offset,
      ...(hasChildren(node) ? { children: children as InnerNode[] } : {}),
    }),
    (node) => getChildren(node) as unknown as AST[],
  );
}

function leftSiblings(parent: ParentNode, idx: number): InnerNode[] {
  return parent.children.filter((n) => n.end <= idx);
}

function rightSiblings(parent: ParentNode, idx: number): InnerNode[] {
  return parent.children.filter((n) => idx <= n.start);
}

function isSpecialForm(parent: ParentNode, _src: string): boolean {
  if (!parent.children.length) return false;
  const first = parent.children[0];
  const srcOfFirst = first && "source" in first ? first.source : undefined;
  if (!srcOfFirst) return false;
  return specialForms.some((f) => {
    if (typeof f === "string") return f === srcOfFirst;
    if (f instanceof RegExp) return f.test(srcOfFirst);
    return false;
  });
}

function rowStartIndex(src: string, idx: number): number {
  return src.lastIndexOf("\n", idx - 1) + 1;
}

function rowColumnOfIndex(src: string, idx: number): number {
  return idx - rowStartIndex(src, idx);
}

function isEmpty(sexp: AST): boolean {
  return (
    (sexp.type === "string" || sexp.type === "list") &&
    "open" in sexp &&
    "close" in sexp &&
    sexp.end - sexp.start === sexp.open.length + sexp.close.length
  );
}

function isSafeToPartialDelete(n: AST): boolean {
  return n.type === "symbol" || n.type === "comment" || n.type === "number" || n.type === "special";
}

// ── Editor operations ──

/** Replace a node in the AST with new nodes, returning a new AST. */
export function rewrite(ast: AST, nodeToReplace: InnerNode, newNodes: InnerNode[]): AST {
  const indexOffset = newNodes.length ? last(newNodes)!.end - nodeToReplace.end : nodeToReplace.start - nodeToReplace.end;

  const parents = walk.containingSexpsAt(ast, nodeToReplace.start) as ParentNode[];

  const replaced = parents.reduceRight(
    (replacement: { original: AST; nodes: AST[] }, parent: ParentNode) => {
      const idxInParent = parent.children.indexOf(replacement.original as InnerNode);
      let childList: InnerNode[];

      if (idxInParent > -1) {
        childList = [
          ...parent.children.slice(0, idxInParent),
          ...(replacement.nodes as InnerNode[]),
          ...parent.children.slice(idxInParent + 1).map((n) => moveNode(indexOffset, n) as InnerNode),
        ];
      } else {
        childList = parent.children;
      }

      const newParent = merge<ParentNode>(parent, {
        end: parent.end + indexOffset,
        children: childList,
      });

      return { original: parent, nodes: [newParent] };
    },
    { original: nodeToReplace, nodes: newNodes },
  );

  return replaced.nodes[0]!;
}

/** Open a new list at `idx`. */
export function openList(
  ast: AST,
  _src: string,
  idx: number,
  args?: { count?: number; open?: string; close?: string; endIdx?: number; freeEdits?: boolean },
): EditorChanges {
  const open = args?.open ?? "(";
  const close = args?.close ?? ")";

  if (args?.freeEdits || (ast.type === "toplevel" && ast.errors.length)) {
    return { changes: [["insert", idx, open]], newIndex: idx + open.length };
  }

  const containing = walk.containingSexpsAt(ast, idx);
  const l = last(containing);
  if (l && (l.type === "comment" || l.type === "string")) {
    return { changes: [["insert", idx, open]], newIndex: idx + open.length };
  }

  if (!args?.endIdx) {
    return { changes: [["insert", idx, open + close]], newIndex: idx + open.length };
  }

  const parentStart = last(walk.containingSexpsAt(ast, idx, hasChildren)) as ParentNode | undefined;
  const parentEnd = last(walk.containingSexpsAt(ast, args.endIdx, hasChildren)) as ParentNode | undefined;

  if (parentStart !== parentEnd) {
    return { changes: [["insert", idx, open + close]], newIndex: idx + open.length };
  }

  if (!parentEnd || !hasChildren(parentEnd)) {
    return { changes: [["insert", idx, open + close]], newIndex: idx + open.length };
  }

  const inStart = parentEnd.children.filter((ea) => ea.start < idx && idx < ea.end);
  const inEnd = parentEnd.children.filter((ea) => ea.start < args.endIdx! && args.endIdx! < ea.end);

  const moveStart = inStart[0] && inStart[0] !== inEnd[0] && (inEnd[0] || inStart[0].type !== "symbol");
  const moveEnd = inEnd[0] && inStart[0] !== inEnd[0] && (inStart[0] || inEnd[0].type !== "symbol");
  const insertOpenAt = moveStart ? inStart[0]!.end : idx;
  const insertCloseAt = moveEnd ? inEnd[0]!.start : args.endIdx;

  return {
    changes: [
      ["insert", insertCloseAt, close],
      ["insert", insertOpenAt, open],
    ],
    newIndex: insertOpenAt + open.length,
  };
}

/** Remove the enclosing list brackets. */
export function spliceSexp(ast: AST, _src: string, idx: number): EditorChanges | null {
  const sexps = walk.containingSexpsAt(ast, idx, hasChildren) as ParentNode[];
  if (!sexps.length) return null;
  const parent = sexps.pop()!;
  const onTop = parent.type === "toplevel";

  const insideSexp = parent.children.find((n) => n.start < idx && idx < n.end);
  const insideString = insideSexp?.type === "string";

  const changes: EditorChange[] = [];
  let newIndex = idx;

  if (!onTop && "close" in parent) changes.push(["remove", parent.end - 1, parent.close.length]);
  if (insideString && insideSexp.type === "string") {
    changes.push(["remove", insideSexp.end - 1, insideSexp.close.length]);
    changes.push(["remove", insideSexp.start, insideSexp.open.length]);
    newIndex -= insideSexp.open.length;
  }
  if (!onTop && "open" in parent) {
    changes.push(["remove", parent.start, parent.open.length]);
    newIndex -= parent.open.length;
  }

  return { changes, newIndex };
}

/** Splice and kill siblings in one direction. */
export function spliceSexpKill(
  ast: AST,
  src: string,
  idx: number,
  args?: { count?: number; backward?: boolean },
): EditorChanges | null {
  const backward = args?.backward;
  const sexps = walk.containingSexpsAt(ast, idx, hasChildren) as ParentNode[];
  if (!sexps.length) return null;
  const parent = last(sexps)!;

  let killed: EditorChanges | null;
  if (backward) {
    const left = leftSiblings(parent, idx);
    killed = killSexp(ast, src, idx, { count: left.length, backward: true });
  } else {
    const right = rightSiblings(parent, idx);
    killed = killSexp(ast, src, idx, { count: right.length, backward: false });
  }

  const spliced = spliceSexp(ast, src, idx);
  if (!killed) return spliced;
  if (!spliced) return killed;

  const splicedChanges = [...spliced.changes];
  if (splicedChanges.length === 2 && killed.changes[0]) {
    splicedChanges.splice(1, 0, killed.changes[0]);
  } else if (splicedChanges.length === 4 && killed.changes[0]) {
    splicedChanges.splice(2, 0, killed.changes[0]);
  }

  return {
    changes: splicedChanges,
    newIndex: killed.newIndex - (splicedChanges.length === 3 ? 1 : 2),
  };
}

/** Split the enclosing list or string at `idx`. */
export function splitSexp(ast: AST, _src: string, idx: number): EditorChanges | null {
  const sexps = walk.containingSexpsAt(ast, idx);
  if (!sexps.length) return null;
  const sexp = sexps.pop()!;
  if (sexp.type === "toplevel") return null;
  if (!hasChildren(sexp) && sexp.type !== "string") return null;

  const closeStr = "close" in sexp ? sexp.close : ")";
  const openStr = "open" in sexp ? sexp.open : "(";
  const insertion = closeStr + " " + openStr;
  return { changes: [["insert", idx, insertion]], newIndex: idx + closeStr.length };
}

/** Kill (delete) the next s-expression(s). */
export function killSexp(
  ast: AST,
  _src: string,
  idx: number,
  args?: { count?: number; backward?: boolean },
): EditorChanges | null {
  const count = args?.count ?? 1;
  const backward = args?.backward;

  const sexps = walk.containingSexpsAt(ast, idx, hasChildren) as ParentNode[];
  if (!sexps.length) return null;
  const parent = sexps.pop()!;

  const insideSexp = parent.children.find((n) => n.start < idx && idx < n.end);

  if (insideSexp) {
    let from = backward ? insideSexp.start : idx;
    let to = backward ? idx : insideSexp.end;
    if (insideSexp.type === "string") {
      from += backward ? insideSexp.open.length : 0;
      to += backward ? 0 : -insideSexp.close.length;
    }
    return { changes: [["remove", from, to - from]], newIndex: from };
  }

  if (backward) {
    const left = leftSiblings(parent, idx);
    if (!left.length) return null;
    const remStart = left.slice(-count)[0]?.start ?? idx;
    return { changes: [["remove", remStart, idx - remStart]], newIndex: remStart };
  } else {
    const right = rightSiblings(parent, idx);
    if (!right.length) return null;
    const lastRight = last(right.slice(0, count));
    if (!lastRight) return null;
    return { changes: [["remove", idx, lastRight.end - idx]], newIndex: idx };
  }
}

/** Wrap the next sexp(s) in brackets. */
export function wrapAround(
  ast: AST,
  _src: string,
  idx: number,
  wrapWithStart: string,
  wrapWithEnd: string,
  args?: { count?: number },
): EditorChanges | null {
  const count = args?.count ?? 1;
  const sexps = walk.containingSexpsAt(ast, idx, hasChildren) as ParentNode[];
  if (!sexps.length) return null;
  const parent = last(sexps)!;
  const sexpsToWrap = parent.children.filter((c) => c.start >= idx).slice(0, count);
  const end = last(sexpsToWrap);
  return {
    changes: [
      ["insert", idx, wrapWithStart],
      ["insert", (end ? end.end : idx) + wrapWithStart.length, wrapWithEnd],
    ],
    newIndex: idx + wrapWithStart.length,
  };
}

/** Close the current list and add a newline. */
export function closeAndNewline(
  ast: AST,
  src: string,
  idx: number,
  close?: string,
): EditorChanges | null {
  const closeChar = close ?? ")";
  const sexps = walk.containingSexpsAt(ast, idx, (n) => hasChildren(n) && "close" in n && n.close === closeChar);
  if (!sexps.length) return null;
  const parent = last(sexps)!;
  const newlineIndent = times(rowColumnOfIndex(src, parent.start), " ");
  const insertion = "\n" + newlineIndent;
  return { changes: [["insert", parent.end, insertion]], newIndex: parent.end + insertion.length };
}

/** Barf (push out) the last sexp from the current list. */
export function barfSexp(ast: AST, _src: string, idx: number, args?: { backward?: boolean }): EditorChanges | null {
  const backward = args?.backward;
  const sexps = walk.containingSexpsAt(ast, idx, hasChildren) as ParentNode[];
  if (!sexps.length) return null;
  const parent = last(sexps)!;
  const inner = last(walk.containingSexpsAt(ast, idx));
  const innerOrNull = inner === parent ? null : inner;

  if (backward) {
    const left = leftSiblings(parent, idx);
    if (!left.length) return null;
    if (!("open" in parent)) return null;
    const insertAt = left[1] ? left[1].start : innerOrNull ? innerOrNull.start : idx;
    return {
      changes: [
        ["insert", insertAt, parent.open],
        ["remove", parent.start, parent.open.length],
      ],
      newIndex: idx,
    };
  } else {
    const right = rightSiblings(parent, idx);
    if (!right.length) return null;
    if (!("close" in parent)) return null;
    const insertAt =
      right.length >= 2 && right[right.length - 2] ? right[right.length - 2]!.end : innerOrNull ? innerOrNull.end : idx;
    return {
      changes: [
        ["remove", parent.end - parent.close.length, parent.close.length],
        ["insert", insertAt, parent.close],
      ],
      newIndex: idx,
    };
  }
}

/** Slurp (pull in) the next sexp into the current list. */
export function slurpSexp(
  ast: AST,
  _src: string,
  idx: number,
  args?: { count?: number; backward?: boolean },
): EditorChanges | null {
  const backward = args?.backward;
  const count = args?.count ?? 1;
  const sexps = walk.containingSexpsAt(ast, idx, hasChildren) as ParentNode[];
  if (sexps.length < 2) return null;
  const parent = sexps.pop()!;
  const parentParent = sexps.pop()!;

  if (backward) {
    const left = leftSiblings(parentParent, idx);
    if (!left.length) return null;
    if (!("open" in parent)) return null;
    const target = left.slice(-count)[0];
    if (!target) return null;
    return {
      changes: [
        ["remove", parent.start, parent.open.length],
        ["insert", target.start, parent.open],
      ],
      newIndex: idx,
    };
  } else {
    const right = rightSiblings(parentParent, idx);
    if (!right.length) return null;
    if (!("close" in parent)) return null;
    const target = last(right.slice(0, count));
    if (!target) return null;
    return {
      changes: [
        ["insert", target.end, parent.close],
        ["remove", parent.end - parent.close.length, parent.close.length],
      ],
      newIndex: idx,
    };
  }
}

/** Transpose the sexp before idx with the sexp after idx. */
export function transpose(ast: AST, src: string, idx: number): EditorChanges | null {
  const outerSexps = walk.containingSexpsAt(ast, idx, hasChildren) as ParentNode[];
  const parent = last(outerSexps);
  if (!parent) return null;

  const left = leftSiblings(parent, idx);
  let right = rightSiblings(parent, idx);
  const inside = parent.children.find((n) => n.start < idx && idx < n.end);

  if (inside) right = [inside];
  if (!left.length || !right.length) return null;

  const l = last(left)!;
  const r = right[0]!;
  const insertion = src.slice(l.end, r.start) + walk.source(src, l);

  return {
    changes: [
      ["insert", r.end, insertion],
      ["remove", l.start, r.start - l.start],
    ],
    newIndex: idx - (l.end - l.start) + (r.end - r.start),
  };
}

/** Structurally-aware delete. */
export function deleteSexp(
  ast: AST,
  _src: string,
  idx: number,
  args?: { count?: number; backward?: boolean; endIdx?: number; freeEdits?: boolean },
): EditorChanges | null {
  const count = args?.count ?? 1;
  const backward = !!args?.backward;
  const endIdx = args?.endIdx;

  if (args?.freeEdits || (ast.type === "toplevel" && ast.errors.length)) {
    return endIdx != null
      ? { changes: [["remove", idx, endIdx - idx]], newIndex: idx }
      : { changes: [["remove", backward ? idx - count : idx, count]], newIndex: backward ? idx - count : idx };
  }

  const outerSexps = walk.containingSexpsAt(ast, idx);
  const outerLists = outerSexps.filter(hasChildren) as ParentNode[];
  const parent = last(outerLists);
  const sexp = last(outerSexps);
  if (!parent || !sexp) return null;

  const noDelete: EditorChanges = { changes: [], newIndex: idx };
  const moveLeft: EditorChanges = { changes: [], newIndex: idx - 1 };
  const simpleDelete: EditorChanges = {
    changes: [["remove", backward ? idx - count : idx, count]],
    newIndex: backward ? idx - count : idx,
  };

  const deleteRange = typeof endIdx === "number";
  if (deleteRange) {
    return handleRangeDelete(ast, parent, idx, endIdx, simpleDelete);
  }

  const isInList = parent === sexp;

  if (!isInList && sexp.type === "comment") return simpleDelete;

  if (isInList) {
    const left = leftSiblings(parent, idx);
    const right = rightSiblings(parent, idx);

    if (left.length && backward) {
      const n = last(left)!;
      if (n.end !== idx || isSafeToPartialDelete(n)) return simpleDelete;
      if (isEmpty(n) || n.type === "char") return { changes: [["remove", n.start, n.end - n.start]], newIndex: n.start };
      if (count === 1) return moveLeft;
      return noDelete;
    }

    if (right.length && !backward) {
      const n = right[0]!;
      if (n.start !== idx || isSafeToPartialDelete(n)) return simpleDelete;
      if (isEmpty(n) || n.type === "char") return { changes: [["remove", n.start, n.end - n.start]], newIndex: n.start };
      return noDelete;
    }
  }

  const target = isInList ? parent : sexp;
  const openLen = "open" in target ? target.open.length : 0;
  const closeLen = "close" in target ? target.close.length : 0;
  const atStart = idx === target.start + openLen;
  const atEnd = idx === target.end - closeLen;
  const hasContent = hasChildren(target) ? target.children.length > 0 : target.end - target.start > 1;

  if (!hasContent && ((atStart && backward) || (atEnd && !backward))) {
    return { changes: [["remove", target.start, target.end - target.start]], newIndex: target.start };
  }

  if (atStart && backward && hasContent) return noDelete;
  if (atEnd && !backward && hasContent) return noDelete;

  return simpleDelete;
}

function handleRangeDelete(
  ast: AST,
  parent: ParentNode,
  idx: number,
  endIdx: number,
  simpleDelete: EditorChanges,
): EditorChanges | null {
  const endParent = last(walk.containingSexpsAt(ast, endIdx, hasChildren));
  if (parent !== endParent) return null;

  const insideNodeStart = last(walk.sexpsAt(ast, idx));
  const insideNodeEnd = last(walk.sexpsAt(ast, endIdx));
  if (!insideNodeStart || !insideNodeEnd) return simpleDelete;

  const atStartOfUnsafe = !isSafeToPartialDelete(insideNodeStart) && insideNodeStart.start === idx;
  const atEndOfUnsafe = !isSafeToPartialDelete(insideNodeEnd) && insideNodeEnd.end === endIdx;

  if (
    insideNodeStart === insideNodeEnd &&
    ((atStartOfUnsafe && !atEndOfUnsafe) || (!atStartOfUnsafe && atEndOfUnsafe))
  ) {
    return null;
  }

  if (
    ((insideNodeEnd !== parent && !isSafeToPartialDelete(insideNodeEnd) && !atEndOfUnsafe) ||
      (insideNodeStart !== parent && !isSafeToPartialDelete(insideNodeStart) && !atStartOfUnsafe)) &&
    insideNodeStart !== insideNodeEnd
  ) {
    return null;
  }

  if (
    (parent.children.indexOf(insideNodeStart as InnerNode) === -1 && insideNodeStart !== parent) ||
    (parent.children.indexOf(insideNodeEnd as InnerNode) === -1 && insideNodeEnd !== parent)
  ) {
    return null;
  }

  const delStart = Math.min(idx, endIdx);
  const delEnd = Math.max(idx, endIdx);
  return { changes: [["remove", delStart, delEnd - delStart]], newIndex: delStart };
}

/** Compute indentation changes for a range of lines. */
export function indentRange(ast: AST, src: string, start: number, end: number): IndentResult {
  const startLineIdx = rowStartIndex(src, start);
  let endLineIdx = src.indexOf("\n", end);
  if (endLineIdx === -1) endLineIdx = src.length;

  const linesToIndent = src.slice(startLineIdx, endLineIdx).split("\n");

  const result = linesToIndent.reduce(
    (indent, line) => {
      let { idx, ast: currentAst, src: currentSrc } = indent;
      const changes = indent.changes;

      const outerSexps = walk.containingSexpsAt(currentAst, idx, hasChildren) as ParentNode[];
      const parent = last(outerSexps);
      const sexpAtBol = parent ? last(walk.sexpsAt(currentAst, idx)) : undefined;

      if (!parent) {
        return {
          idx: idx + line.length + 1,
          newIndex: idx,
          changes,
          ast: currentAst,
          src: currentSrc,
        };
      }

      const wsMatch = line.match(/^\s*/);
      const ws = wsMatch ? wsMatch[0] : "";
      const indentOffset =
        sexpAtBol && sexpAtBol.type === "string" && idx > sexpAtBol.start
          ? 0
          : computeIndentOffset(currentSrc, parent, idx) - ws.length;
      const lineLength = line.length + indentOffset;

      if (indentOffset > 0) {
        const insert = times(indentOffset, " ");
        changes.push(["insert", idx, insert]);
        currentSrc = currentSrc.slice(0, idx) + insert + currentSrc.slice(idx);
      } else if (indentOffset < 0) {
        changes.push(["remove", idx, -indentOffset]);
        currentSrc = currentSrc.slice(0, idx) + currentSrc.slice(idx - indentOffset);
      }

      const right = rightSiblings(parent, idx)[0];
      if (right) {
        const indentedRight = moveNode(indentOffset, right) as InnerNode;
        currentAst = rewrite(currentAst, right, [indentedRight]);
      } else {
        currentAst = rewrite(currentAst, parent as InnerNode, [
          merge(parent, { end: parent.end + indentOffset }) as InnerNode,
        ]);
      }

      return {
        idx: idx + lineLength + 1,
        newIndex: idx + indentOffset,
        changes,
        ast: currentAst,
        src: currentSrc,
      };
    },
    { idx: startLineIdx, newIndex: 0, changes: [] as EditorChange[], ast: ast as AST, src },
  );

  return {
    changes: result.changes,
    newIndex: result.newIndex,
    ast: result.ast,
    src: result.src,
    idx: result.idx,
  };
}

function computeIndentOffset(src: string, parent: ParentNode, idx: number): number {
  if (parent.type === "toplevel") return 0;
  const left = leftSiblings(parent, idx);
  const openLen = "open" in parent ? parent.open.length : 1;
  if (isSpecialForm(parent, src)) {
    return rowColumnOfIndex(src, parent.start + openLen + 1);
  }
  if (left.length <= 1 || !("open" in parent) || parent.open !== "(") {
    return rowColumnOfIndex(src, parent.start + openLen);
  }
  return left[1] ? rowColumnOfIndex(src, left[1].start) : 0;
}
