import type { ErrorNode, InnerNode, ListNode, ParseOptions, SimpleNode, StringNode, TopLevelNode } from "./types";
import * as reader from "./reader";
import * as navigatorModule from "./navigator";
import * as walkModule from "./walk";
import * as editorModule from "./editor";

export type {
  AST,
  EditorChange,
  EditorChanges,
  ErrorNode,
  IndentResult,
  InnerNode,
  ListNode,
  ParseOptions,
  ParentNode,
  Position,
  Range,
  ReaderError,
  SimpleNode,
  StringNode,
  TopLevelNode,
  Xform,
} from "./types";

/** Parse source text into an s-expression AST. */
export function parse(src: string, options?: ParseOptions): TopLevelNode {
  const addSrc = options?.addSourceForLeafs ?? true;
  const errors: ErrorNode[] = [];

  const nodes = reader.readSeq<InnerNode>(src, (type, read, start, end, args) => {
    const s = start.idx;
    const e = end.idx;
    const source = addSrc ? src.slice(s, e) : undefined;

    switch (type) {
      case "error": {
        const readErr = read as { error: string; children?: InnerNode[] };
        const node: ErrorNode = {
          type: "error",
          start: s,
          end: e,
          error: readErr.error,
          open: args?.open ?? "",
          close: args?.close ?? "",
          children: readErr.children ?? [],
        };
        errors.push(node);
        return node;
      }
      case "list":
        return {
          type: "list",
          start: s,
          end: e,
          open: args?.open ?? "(",
          close: args?.close ?? ")",
          children: read as InnerNode[],
        } satisfies ListNode;
      case "string":
        return {
          type: "string",
          start: s,
          end: e,
          open: args?.open ?? '"',
          close: args?.close ?? '"',
          ...(addSrc ? { source } : {}),
        } satisfies StringNode;
      default:
        return {
          type: type as SimpleNode["type"],
          start: s,
          end: e,
          ...(addSrc ? { source } : {}),
        } satisfies SimpleNode;
    }
  });

  const lastNode = nodes[nodes.length - 1];
  return {
    type: "toplevel",
    start: 0,
    end: lastNode ? lastNode.end : 0,
    errors,
    children: nodes,
  };
}

export { reader, navigatorModule as navigator, walkModule as walk, editorModule as editor };
export { specialForms } from "./editor";
