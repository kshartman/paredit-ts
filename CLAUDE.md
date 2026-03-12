# paredit-ts

S-expression parser, navigator, and structural editor. TypeScript rewrite of paredit.js with full type safety and zero runtime dependencies.

## Development Commands

- `npm run build` — Build to dist/ (ESM + CJS via tsup)
- `npm test` — Run tests (vitest)
- `npm run check` — Type-check without emitting

## Project Structure

- `src/types.ts` — All AST node types, type guards (`hasChildren`, `getChildren`)
- `src/reader.ts` — S-expression reader with configurable parentheses
- `src/navigator.ts` — Cursor movement: `forwardSexp`, `backwardSexp`, `forwardDownSexp`, `backwardUpSexp`, `closeList`, `sexpRange`, `sexpRangeExpansion`, `rangeForDefun`
- `src/walk.ts` — Tree traversal: `containingSexpsAt`, `sexpsAt`, `nextSexp`, `prevSexp`, `stringify`, `source`
- `src/editor.ts` — Structural editing: `killSexp`, `spliceSexp`, `splitSexp`, `wrapAround`, `openList`, `barfSexp`, `slurpSexp`, `transpose`, `deleteSexp`, `rewrite`, `indentRange`
- `src/util.ts` — Internal helpers (`mapTree`, `flatFilterTree`, `last`, `times`)
- `src/index.ts` — Public API: `parse()` function + re-exports of `reader`, `navigator`, `walk`, `editor`
- `test/` — Vitest test suites

## Key API

```typescript
import { parse, navigator, editor, reader, walk } from "paredit-ts";

const ast = parse(src);                          // → TopLevelNode
navigator.forwardSexp(ast, idx);                 // → number (offset)
editor.killSexp(ast, src, idx, { count: 1 });    // → { changes, newIndex } | null
reader.setParentheses({ "(": ")", "[": "]" });   // configure bracket pairs
reader.resetParentheses();                       // restore defaults
```

## Important Notes

- Published on npm as `paredit-ts@1.0.0`
- Builds both ESM and CJS with source maps and declaration files
- `setParentheses` dynamically rebuilds the symbol regex so custom brackets work as delimiters
- Semicolons are treated as comments (lisp-style) — consumers for non-lisp languages should replace `;` with `_` before parsing
- No runtime dependencies
