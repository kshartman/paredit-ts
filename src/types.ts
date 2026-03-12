/** Range with start/end character offsets. */
export interface Range {
  start: number;
  end: number;
}

export interface TopLevelNode extends Range {
  type: "toplevel";
  errors: ErrorNode[];
  children: InnerNode[];
}

export interface ErrorNode extends Range {
  type: "error";
  error: string;
  open: string;
  close: string;
  children: InnerNode[];
}

export interface ListNode extends Range {
  type: "list";
  open: string;
  close: string;
  children: InnerNode[];
}

export interface SimpleNode extends Range {
  type: "number" | "symbol" | "char" | "special" | "comment";
  source?: string;
}

export interface StringNode extends Range {
  type: "string";
  open: string;
  close: string;
  source?: string;
}

export type InnerNode = ErrorNode | ListNode | StringNode | SimpleNode;
export type AST = TopLevelNode | InnerNode;

/** Parse options for the top-level `parse` function. */
export interface ParseOptions {
  addSourceForLeafs?: boolean;
}

/** Position tracking during reading. */
export interface Position {
  idx: number;
  column: number;
  row: number;
}

/** Reader error produced during parsing. */
export interface ReaderError<T> {
  error: string;
  start: Position;
  end: Position;
  children?: (T | number | string | ReaderError<T>)[];
}

/** Transform function for the reader. */
export type Xform<T> = (
  type: string,
  read: T[] | number | string | ReaderError<T>,
  start: Position,
  end: Position,
  args: { open: string; close: string },
) => T;

/** Editor change descriptor: [operation, offset, content-or-count]. */
export type EditorChange = ["insert", number, string] | ["remove", number, number];

/** Result of an editor operation. */
export interface EditorChanges {
  changes: EditorChange[];
  newIndex: number;
}

/** Extended result from `indentRange`. */
export interface IndentResult extends EditorChanges {
  ast: AST;
  src: string;
  idx: number;
}

/** Helper: nodes that can have children. */
export type ParentNode = TopLevelNode | ListNode | ErrorNode;

export function hasChildren(node: AST): node is ParentNode {
  return node.type === "toplevel" || node.type === "list" || (node.type === "error" && Array.isArray(node.children));
}

export function getChildren(node: AST): InnerNode[] {
  if ("children" in node && Array.isArray(node.children)) {
    return node.children;
  }
  return [];
}
