import type { Position, Xform } from "./types";

// Sentinel flags
const EOSEXP = Symbol("eosexp");
const EOINPUT = Symbol("eoinput");
type Flag = typeof EOSEXP | typeof EOINPUT;

// Configurable parentheses
let closeMap: Record<string, string> = { "[": "]", "(": ")", "{": "}" };
let openingChars: string[] = Object.keys(closeMap);
let closingChars: string[] = Object.values(closeMap);
let symRe = buildSymRe(closeMap);

const readerSpecials = /[`@^#~]/;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSymRe(brackets: Record<string, string>): RegExp {
  const allBrackets = new Set<string>();
  for (const [open, close] of Object.entries(brackets)) {
    allBrackets.add(open);
    allBrackets.add(close);
  }
  const escaped = [...allBrackets].map(escapeRegex).join("");
  return new RegExp(`[^\\s${escaped},"\\\\` + "`@^#~]");
}

interface ReadResult<T> {
  input: string;
  context: readonly T[];
  pos: Position;
  flag?: Flag;
}

/** Configure which bracket pairs the reader recognizes. */
export function setParentheses(pairs: Record<string, string>): void {
  closeMap = { ...pairs };
  openingChars = Object.keys(closeMap);
  closingChars = Object.values(closeMap);
  symRe = buildSymRe(closeMap);
}

/** Reset parentheses to defaults. */
export function resetParentheses(): void {
  closeMap = { "[": "]", "(": ")", "{": "}" };
  openingChars = Object.keys(closeMap);
  closingChars = Object.values(closeMap);
  symRe = buildSymRe(closeMap);
}

/** Read a sequence of s-expressions from `src`. */
export function readSeq<T>(src: string, xform: Xform<T>): T[] {
  return readSeqImpl(undefined, src, Object.freeze([]), startPos(), xform).context as T[];
}

/** Read a single s-expression from `src`. */
export function readSexp<T>(src: string, xform: Xform<T>): T {
  return (readSexpImpl(undefined, src, Object.freeze([]), startPos(), xform).context as T[])[0]!;
}

// ── Position helpers ──

function startPos(): Position {
  return { idx: 0, column: 0, row: 0 };
}

function clonePos(pos: Position): Position {
  return { idx: pos.idx, column: pos.column, row: pos.row };
}

function forward(pos: Position, read: string): Position {
  if (!read) return pos;
  const newPos = clonePos(pos);
  newPos.idx += read.length;
  const lines = read.split("\n");
  newPos.row += lines.length - 1;
  const lastLineLen = lines[lines.length - 1]!.length;
  newPos.column = lines.length > 1 ? lastLineLen : newPos.column + lastLineLen;
  return newPos;
}

// ── Read logic ──

function readSexpImpl<T>(
  contextStart: string | undefined,
  input: string,
  context: readonly T[],
  pos: Position,
  xform: Xform<T>,
): ReadResult<T> {
  const ch = input[0];

  // End of input while expecting close bracket
  if (!ch && contextStart && closeMap[contextStart]) {
    return { input, context, pos, flag: EOINPUT };
  }

  // Top-level end of input
  if (!ch && !contextStart) {
    return { input, context, pos, flag: EOINPUT };
  }

  if (!ch) {
    return { input, context, pos, flag: EOINPUT };
  }

  // Whitespace / comma
  if (/[\s,]/.test(ch)) {
    return { input: input.slice(1), context, pos: forward(pos, ch) };
  }

  // Reader specials
  if (readerSpecials.test(ch)) return readReaderSpecials(input, context, pos, xform);

  // Comment
  if (ch === ";") return readComment(input, context, pos, xform);

  // String
  if (ch === '"') return readString(input, context, pos, xform);

  // Character literal
  if (ch === "\\") return readChar(input, context, pos, xform);

  // Number
  if (/[0-9]/.test(ch)) return readNumber(input, context, pos, xform);
  if (ch === "-" && (/[0-9]/.test(input[1] ?? "") || (input[1] === "." && /[0-9]/.test(input[2] ?? "")))) {
    return readNumber(input, context, pos, xform);
  }
  if (ch === "." && /[0-9]/.test(input[1] ?? "")) {
    return readNumber(input, context, pos, xform);
  }

  // Symbol
  if (symRe.test(ch)) return readSymbol(input, context, pos, xform);

  // List end
  if (closingChars.includes(ch)) {
    if (!contextStart) {
      const junk = readJunk(input, context, pos, xform);
      return { input: junk.input, context: junk.context, pos: junk.pos };
    }
    return { input, context, pos, flag: EOSEXP };
  }

  // List start
  if (openingChars.includes(ch)) {
    const sPos = clonePos(pos);
    const nested = readSeqImpl(ch, input.slice(1), Object.freeze([]), forward(pos, ch), xform);
    const nextCh = nested.input[0];
    const brackets = { open: ch, close: closeMap[ch]! };

    let sexp: T;
    let endPos: Position;
    if (nextCh !== closeMap[ch]) {
      const errPos = clonePos(nested.pos);
      const errMsg = nextCh
        ? `Expected '${closeMap[ch]}' but got '${nextCh}'`
        : `Expected '${closeMap[ch]}' but reached end of input`;
      const err = readError(errMsg, sPos, errPos, nested.context as T[]);
      sexp = callTransform(xform, "error", err, sPos, errPos, brackets);
      endPos = nextCh ? forward(nested.pos, nextCh) : nested.pos;
    } else {
      endPos = nextCh ? forward(nested.pos, nextCh) : nested.pos;
      sexp = callTransform(xform, "list", nested.context as T[], sPos, endPos, brackets);
    }

    const newContext = [...context, sexp];
    const restInput = nested.input.slice(nextCh ? 1 : 0);
    return { input: restInput, context: newContext, pos: endPos };
  }

  // Unexpected character
  const sPos = clonePos(pos);
  const errPos = forward(pos, ch);
  const err = readError(`Unexpected character: ${ch}`, sPos, errPos, null);
  const errNode = callTransform(xform, "error", err, sPos, errPos, { open: "", close: "" });
  return { input: input.slice(1), context: [...context, errNode], pos: errPos };
}

function readSeqImpl<T>(
  contextStart: string | undefined,
  input: string,
  context: readonly T[],
  pos: Position,
  xform: Xform<T>,
): ReadResult<T> {
  let currentInput = input;
  let currentContext = context;
  let currentPos = pos;

  while (true) {
    const startRow = currentPos.row;
    const startCol = currentPos.column;
    const result = readSexpImpl(contextStart, currentInput, currentContext, currentPos, xform);
    currentInput = result.input;
    currentContext = result.context;
    currentPos = result.pos;

    const endReached =
      result.flag === EOINPUT || (result.flag === EOSEXP && (contextStart != null || !currentInput.length));
    if (!endReached && currentPos.row <= startRow && currentPos.column <= startCol) {
      throw new Error(`paredit reader cannot go forward at ${JSON.stringify(currentPos)} with input ${currentInput}`);
    }
    if (endReached) break;
  }

  return { input: currentInput, context: currentContext, pos: currentPos };
}

function readString<T>(input: string, context: readonly T[], pos: Position, xform: Xform<T>): ReadResult<T> {
  let escaped = false;
  const sPos = clonePos(pos);
  let str = input[0]!;
  let curPos = forward(pos, input[0]!);
  let rest = input.slice(1);

  return takeWhile(
    rest,
    curPos,
    (c) => {
      if (!escaped && c === '"') return false;
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      return true;
    },
    (read, remaining, _prevPos, newPos) => {
      let result: T;
      if (remaining[0] === '"') {
        str = str + read + '"';
        const endPos = forward(newPos, '"');
        rest = remaining.slice(1);
        result = callTransform(xform, "string", str, sPos, endPos, { open: '"', close: '"' });
        return { pos: endPos, input: rest, context: [...context, result] };
      } else {
        const err = readError('Expected \'"\' but reached end of input', sPos, newPos, null);
        result = callTransform(xform, "error", err, sPos, newPos, { open: '"', close: '"' });
        return { pos: newPos, input: remaining, context: [...context, result] };
      }
    },
  );
}

function readChar<T>(input: string, context: readonly T[], pos: Position, xform: Xform<T>): ReadResult<T> {
  const prevPos = clonePos(pos);
  const read = input.slice(0, 2);
  const newPos = forward(pos, read);
  const result = callTransform(xform, "char", read, prevPos, newPos, { open: "", close: "" });
  return { pos: newPos, input: input.slice(2), context: [...context, result] };
}

function readSymbol<T>(input: string, context: readonly T[], pos: Position, xform: Xform<T>): ReadResult<T> {
  return takeWhile(
    input,
    pos,
    (c) => symRe.test(c),
    (read, rest, prevPos, newPos) => {
      const result = callTransform(xform, "symbol", read, prevPos, newPos, { open: "", close: "" });
      return { pos: newPos, input: rest, context: [...context, result] };
    },
  );
}

function readNumber<T>(input: string, context: readonly T[], pos: Position, xform: Xform<T>): ReadResult<T> {
  let first = true;
  let seenDot = false;
  return takeWhile(
    input,
    pos,
    (c) => {
      if (first) {
        first = false;
        if (c === "-") return true;
      }
      if (!seenDot && c === ".") {
        seenDot = true;
        return true;
      }
      return /[0-9]/.test(c);
    },
    (read, rest, prevPos, newPos) => {
      const result = callTransform(xform, "number", Number(read), prevPos, newPos, { open: "", close: "" });
      return { pos: newPos, input: rest, context: [...context, result] };
    },
  );
}

function readComment<T>(input: string, context: readonly T[], pos: Position, xform: Xform<T>): ReadResult<T> {
  const prevPos = clonePos(pos);
  let comment = "";
  let rest = input;
  while (rest.length && /^\s*;/.test(rest)) {
    const nlIdx = rest.indexOf("\n");
    if (nlIdx > -1) {
      comment += rest.slice(0, nlIdx + 1);
      rest = rest.slice(nlIdx + 1);
    } else {
      comment += rest;
      rest = "";
    }
  }
  const newPos = forward(pos, comment);
  const result = callTransform(xform, "comment", comment, prevPos, newPos, { open: "", close: "" });
  return { pos: newPos, input: rest, context: [...context, result] };
}

function readReaderSpecials<T>(input: string, context: readonly T[], pos: Position, xform: Xform<T>): ReadResult<T> {
  const prevPos = clonePos(pos);
  const read = input.slice(0, 1);
  const newPos = forward(pos, read);
  const result = callTransform(xform, "special", read, prevPos, newPos, { open: "", close: "" });
  return { pos: newPos, input: input.slice(1), context: [...context, result] };
}

function readJunk<T>(input: string, context: readonly T[], pos: Position, xform: Xform<T>): ReadResult<T> {
  return takeWhile(
    input,
    pos,
    (c) => closingChars.includes(c),
    (read, rest, prevPos, newPos) => {
      const err = readError(`Unexpected input: '${read}'`, prevPos, newPos, null);
      const result = callTransform(xform, "error", err, prevPos, newPos, { open: "", close: "" });
      return { pos: newPos, input: rest, context: [...context, result] };
    },
  );
}

// ── Helpers ──

function readError<T>(msg: string, startP: Position, endP: Position, children: T[] | null) {
  return {
    error: `${msg} at line ${endP.row + 1} column ${endP.column}`,
    start: clonePos(startP),
    end: clonePos(endP),
    children,
  };
}

function callTransform<T>(
  xform: Xform<T>,
  type: string,
  read: unknown,
  start: Position,
  end: Position,
  args: { open: string; close: string },
): T {
  return xform(type, read as T[] | number | string, clonePos(start), clonePos(end), args);
}

function takeWhile<T>(
  input: string,
  pos: Position,
  predicate: (ch: string) => boolean,
  withResult: (read: string, rest: string, prevPos: Position, newPos: Position) => ReadResult<T>,
): ReadResult<T> {
  const startP = clonePos(pos);
  let result = "";
  for (let i = 0; i < input.length; i++) {
    if (predicate(input[i]!)) {
      result += input[i];
    } else {
      break;
    }
  }
  return withResult(result, input.slice(result.length), startP, forward(pos, result));
}
