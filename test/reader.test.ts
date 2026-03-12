import { describe, it, expect } from "vitest";
import { parse, reader } from "../src/index";
import { setParentheses, resetParentheses } from "../src/reader";

describe("reader", () => {
  describe("setParentheses", () => {
    it("allows custom bracket pairs", () => {
      setParentheses({ "(": ")", "<": ">" });
      const ast = parse("<a b>");
      expect(ast.children).toHaveLength(1);
      expect(ast.children[0]!.type).toBe("list");
      resetParentheses();
    });

    it("resets to defaults", () => {
      setParentheses({ "(": ")" });
      resetParentheses();
      const ast = parse("[a b]");
      expect(ast.children).toHaveLength(1);
      expect(ast.children[0]!.type).toBe("list");
    });
  });

  describe("readSeq", () => {
    it("reads a sequence of symbols", () => {
      const results = reader.readSeq("a b c", (type, _read, start, end) => ({
        type,
        start: start.idx,
        end: end.idx,
      }));
      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ type: "symbol", start: 0, end: 1 });
      expect(results[1]).toEqual({ type: "symbol", start: 2, end: 3 });
      expect(results[2]).toEqual({ type: "symbol", start: 4, end: 5 });
    });
  });

  describe("readSexp", () => {
    it("reads a single expression", () => {
      const result = reader.readSexp("(hello)", (type, read, start, end, args) => ({
        type,
        children: Array.isArray(read) ? read : undefined,
        start: start.idx,
        end: end.idx,
        open: args?.open,
        close: args?.close,
      }));
      expect(result.type).toBe("list");
      expect(result.start).toBe(0);
      expect(result.end).toBe(7);
    });
  });
});
