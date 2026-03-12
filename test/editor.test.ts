import { describe, it, expect } from "vitest";
import { parse, editor } from "../src/index";

describe("editor", () => {
  describe("killSexp", () => {
    it("kills the next sexp forward", () => {
      const src = "(a b c)";
      const ast = parse(src);
      const result = editor.killSexp(ast, src, 1);
      expect(result).not.toBeNull();
      expect(result!.changes).toHaveLength(1);
      expect(result!.changes[0]).toEqual(["remove", 1, 1]);
      expect(result!.newIndex).toBe(1);
    });

    it("kills backward", () => {
      const src = "(a b c)";
      const ast = parse(src);
      const result = editor.killSexp(ast, src, 4, { backward: true });
      expect(result).not.toBeNull();
      expect(result!.changes).toHaveLength(1);
      expect(result!.newIndex).toBeLessThanOrEqual(4);
    });

    it("returns null when nothing to kill", () => {
      const src = "()";
      const ast = parse(src);
      const result = editor.killSexp(ast, src, 1);
      expect(result).toBeNull();
    });

    it("kills multiple sexps with count", () => {
      const src = "(a b c d)";
      const ast = parse(src);
      const result = editor.killSexp(ast, src, 1, { count: 2 });
      expect(result).not.toBeNull();
      expect(result!.changes).toHaveLength(1);
    });
  });

  describe("spliceSexp", () => {
    it("removes enclosing brackets", () => {
      const src = "(a b c)";
      const ast = parse(src);
      const result = editor.spliceSexp(ast, src, 3);
      expect(result).not.toBeNull();
      expect(result!.changes.length).toBeGreaterThanOrEqual(2);
    });

    it("returns no-op at top level", () => {
      const src = "a b c";
      const ast = parse(src);
      const result = editor.spliceSexp(ast, src, 1);
      // At top level, splice has nothing to remove — returns empty changes
      expect(result).not.toBeNull();
      expect(result!.changes).toHaveLength(0);
    });
  });

  describe("splitSexp", () => {
    it("splits a list", () => {
      const src = "(a b c)";
      const ast = parse(src);
      const result = editor.splitSexp(ast, src, 3);
      expect(result).not.toBeNull();
      expect(result!.changes).toHaveLength(1);
      expect(result!.changes[0]![0]).toBe("insert");
    });

    it("returns null at top level", () => {
      const src = "a b c";
      const ast = parse(src);
      const result = editor.splitSexp(ast, src, 1);
      expect(result).toBeNull();
    });
  });

  describe("wrapAround", () => {
    it("wraps the next sexp", () => {
      const src = "(a b c)";
      const ast = parse(src);
      const result = editor.wrapAround(ast, src, 1, "(", ")");
      expect(result).not.toBeNull();
      expect(result!.changes).toHaveLength(2);
    });
  });

  describe("transpose", () => {
    it("transposes two adjacent sexps", () => {
      const src = "(a b)";
      const ast = parse(src);
      const result = editor.transpose(ast, src, 3);
      expect(result).not.toBeNull();
      expect(result!.changes).toHaveLength(2);
    });
  });

  describe("openList", () => {
    it("opens a new list", () => {
      const src = "a b";
      const ast = parse(src);
      const result = editor.openList(ast, src, 0);
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0]![0]).toBe("insert");
    });
  });

  describe("barfSexp", () => {
    it("barfs the last element out", () => {
      const src = "(a b c)";
      const ast = parse(src);
      const result = editor.barfSexp(ast, src, 3);
      expect(result).not.toBeNull();
      expect(result!.changes).toHaveLength(2);
    });
  });

  describe("slurpSexp", () => {
    it("slurps the next element in", () => {
      const src = "((a) b)";
      const ast = parse(src);
      const result = editor.slurpSexp(ast, src, 2, { count: 1 });
      expect(result).not.toBeNull();
      expect(result!.changes).toHaveLength(2);
    });
  });

  describe("deleteSexp", () => {
    it("deletes forward at boundary", () => {
      const src = "(a b)";
      const ast = parse(src);
      const result = editor.deleteSexp(ast, src, 1);
      expect(result).not.toBeNull();
    });

    it("handles free edits mode", () => {
      const src = "a b";
      const ast = parse(src);
      // Force error in AST
      const result = editor.deleteSexp(ast, src, 0, { freeEdits: true });
      expect(result).not.toBeNull();
      expect(result!.changes).toHaveLength(1);
    });
  });
});
