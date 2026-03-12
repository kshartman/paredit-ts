# paredit-ts

S-expression parser, navigator, and structural editor for TypeScript/JavaScript. A ground-up TypeScript rewrite of [paredit.js](https://www.npmjs.com/package/paredit.js) with full type safety, zero runtime dependencies, and a drop-in compatible API.

## Why

The original `paredit.js` is algorithmically sound but written in pre-ES6 JavaScript with no type safety, duplicated helpers, mutation bugs, and abandoned maintenance (last published 2022, no source repo). This rewrite preserves the same API contract while fixing those issues.

## Install

```bash
npm install paredit-ts
```

## Usage

```typescript
import { parse, navigator, editor } from "paredit-ts";

// Parse source into an AST
const ast = parse("(defn greet [name] (str \"Hello, \" name))");

// Navigate: find the end of the sexp at position 0
const endIdx = navigator.forwardSexp(ast, 0); // 40

// Navigate: move backward from position 40
const startIdx = navigator.backwardSexp(ast, 40); // 0

// Navigate: descend into a list
const innerIdx = navigator.forwardDownSexp(ast, 0); // 1

// Navigate: ascend out of a list
const outerIdx = navigator.backwardUpSexp(ast, 5); // 0

// Structural editing: kill the next sexp
const killResult = editor.killSexp(ast, src, 1);
// { changes: [["remove", 1, 4]], newIndex: 1 }
```

### Custom bracket pairs

```typescript
import { reader } from "paredit-ts";
import { setParentheses, resetParentheses } from "paredit-ts/dist/reader";

// Add angle brackets as a recognized pair
setParentheses({ "(": ")", "[": "]", "{": "}", "<": ">" });

const ast = parse("<html></html>");

// Restore defaults
resetParentheses();
```

## API

### `parse(src, options?)`

Parse source text into an s-expression AST.

- `src` — source string
- `options.addSourceForLeafs` — attach source text to leaf nodes (default: `true`)
- Returns: `TopLevelNode` with `children`, `errors`, `start`, `end`

### `navigator`

All functions take `(ast, idx)` and return a character offset.

| Function | Description |
|----------|-------------|
| `forwardSexp(ast, idx)` | Move past the current or next sexp |
| `backwardSexp(ast, idx)` | Move before the current or previous sexp |
| `forwardDownSexp(ast, idx)` | Descend into the next list |
| `backwardUpSexp(ast, idx)` | Ascend out of the enclosing list |
| `closeList(ast, idx)` | Move to the closing bracket |
| `sexpRange(ast, idx)` | Range `[start, end]` of the sexp at idx |
| `sexpRangeExpansion(ast, start, end)` | Expand selection to next enclosing sexp |
| `rangeForDefun(ast, idx)` | Range of the top-level form containing idx |

### `editor`

Structural editing operations. All return `{ changes, newIndex } | null`. Changes are `["insert", offset, text]` or `["remove", offset, count]` — they describe edits but don't mutate the source.

| Function | Description |
|----------|-------------|
| `killSexp(ast, src, idx, args?)` | Delete the next sexp(s) |
| `spliceSexp(ast, src, idx)` | Remove enclosing brackets |
| `spliceSexpKill(ast, src, idx, args?)` | Splice and kill in one direction |
| `splitSexp(ast, src, idx)` | Split the enclosing list/string at idx |
| `wrapAround(ast, src, idx, open, close, args?)` | Wrap next sexp(s) in brackets |
| `openList(ast, src, idx, args?)` | Insert a new list |
| `barfSexp(ast, src, idx, args?)` | Push last/first element out of list |
| `slurpSexp(ast, src, idx, args?)` | Pull next/prev element into list |
| `transpose(ast, src, idx)` | Swap two adjacent sexps |
| `deleteSexp(ast, src, idx, args?)` | Structurally-aware delete |
| `rewrite(ast, node, newNodes)` | Replace a node in the AST immutably |
| `indentRange(ast, src, start, end)` | Compute indentation for a line range |

### `walk`

Tree traversal utilities.

| Function | Description |
|----------|-------------|
| `containingSexpsAt(ast, idx, match?)` | All ancestors containing idx |
| `sexpsAt(ast, idx, match?)` | All nodes whose range includes idx |
| `nextSexp(ast, idx, match?)` | Next sexp after idx |
| `prevSexp(ast, idx, match?)` | Previous sexp before idx |
| `hasChildren(node)` | Type guard for parent nodes |
| `stringify(node)` | Reconstruct source-like string |
| `source(src, node)` | Extract source text for a node |

### `reader`

Low-level reader with configurable transforms.

| Function | Description |
|----------|-------------|
| `readSeq(src, xform)` | Read a sequence of sexps with custom transform |
| `readSexp(src, xform)` | Read a single sexp with custom transform |
| `setParentheses(pairs)` | Configure recognized bracket pairs |
| `resetParentheses()` | Restore default brackets `()[]{}` |

## AST Node Types

```typescript
TopLevelNode   { type: "toplevel", children, errors, start, end }
ListNode       { type: "list", open, close, children, start, end }
StringNode     { type: "string", open, close, source?, start, end }
SimpleNode     { type: "symbol" | "number" | "char" | "special" | "comment", source?, start, end }
ErrorNode      { type: "error", error, open, close, children, start, end }
```

## Differences from paredit.js

- Written in TypeScript with strict types throughout — no `any`, no type assertions
- Zero runtime dependencies (paredit.js declares `ace.improved`)
- `setParentheses` dynamically updates the symbol character class so custom brackets (e.g., `<>`) work correctly as delimiters
- Fixed: `forward()` no longer mutates position objects
- Fixed: dead code in `killSexp` (unreachable `insideSexp && insideSexp.type === 'string'` branch)
- Fixed: duplicated `last()` and `times()` helpers consolidated in `util.ts`
- Fixed: typos (`seenSeperator` → `seenDot`, `isSaveToPartialDelete` → `isSafeToPartialDelete`)
- Builds to both ESM and CJS with source maps and declaration files

## Development

```bash
npm install
npm run check    # type check
npm test         # run tests (vitest)
npm run build    # build to dist/
```

## License

MIT
