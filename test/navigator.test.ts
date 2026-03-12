import { describe, it, expect } from "vitest";
import { parse, navigator } from "../src/index";

describe("navigator", () => {
  describe("forwardSexp", () => {
    it("moves past a symbol", () => {
      const ast = parse("foo bar");
      expect(navigator.forwardSexp(ast, 0)).toBe(3);
    });

    it("moves past a list", () => {
      const ast = parse("(a b) c");
      expect(navigator.forwardSexp(ast, 0)).toBe(5);
    });

    it("moves from inside a symbol to end", () => {
      const ast = parse("foo bar");
      expect(navigator.forwardSexp(ast, 1)).toBe(3);
    });

    it("moves from between expressions to end of next", () => {
      const ast = parse("foo bar");
      expect(navigator.forwardSexp(ast, 4)).toBe(7);
    });

    it("stays at end of input", () => {
      const ast = parse("foo");
      expect(navigator.forwardSexp(ast, 3)).toBe(3);
    });

    it("moves past nested lists", () => {
      const ast = parse("((a b) c)");
      expect(navigator.forwardSexp(ast, 0)).toBe(9);
    });

    it("moves within a list", () => {
      const ast = parse("(foo bar baz)");
      // Inside list, after first space
      expect(navigator.forwardSexp(ast, 1)).toBe(4);
    });
  });

  describe("backwardSexp", () => {
    it("moves before a symbol", () => {
      const ast = parse("foo bar");
      expect(navigator.backwardSexp(ast, 7)).toBe(4);
    });

    it("moves before a list", () => {
      const ast = parse("a (b c)");
      expect(navigator.backwardSexp(ast, 7)).toBe(2);
    });

    it("moves from inside a symbol to start", () => {
      const ast = parse("foo bar");
      expect(navigator.backwardSexp(ast, 5)).toBe(4);
    });

    it("stays at start of input", () => {
      const ast = parse("foo");
      expect(navigator.backwardSexp(ast, 0)).toBe(0);
    });
  });

  describe("forwardDownSexp", () => {
    it("enters a list", () => {
      const ast = parse("(a b)");
      expect(navigator.forwardDownSexp(ast, 0)).toBe(1);
    });

    it("enters nested list", () => {
      const ast = parse("((inner))");
      expect(navigator.forwardDownSexp(ast, 0)).toBe(1);
    });

    it("stays if no list ahead", () => {
      const ast = parse("foo");
      expect(navigator.forwardDownSexp(ast, 0)).toBe(0);
    });
  });

  describe("backwardUpSexp", () => {
    it("exits to enclosing list start", () => {
      const ast = parse("(a b c)");
      expect(navigator.backwardUpSexp(ast, 3)).toBe(0);
    });

    it("exits nested list", () => {
      const ast = parse("(a (b c) d)");
      // Inside inner list
      expect(navigator.backwardUpSexp(ast, 5)).toBe(3);
    });

    it("stays if at top level", () => {
      const ast = parse("foo");
      expect(navigator.backwardUpSexp(ast, 1)).toBe(1);
    });
  });

  describe("sexpRange", () => {
    it("finds range of symbol", () => {
      const ast = parse("foo bar");
      expect(navigator.sexpRange(ast, 1)).toEqual([0, 3]);
    });

    it("finds range of inner content when inside list", () => {
      const ast = parse("(a b) c");
      // idx 2 is between 'a' and 'b' inside the list — selects the nearest leaf
      expect(navigator.sexpRange(ast, 2)).toEqual([1, 2]);
    });

    it("finds range of whole list from outside", () => {
      const ast = parse("(a b) c");
      expect(navigator.sexpRange(ast, 0)).toEqual([0, 5]);
    });
  });

  describe("rangeForDefun", () => {
    it("finds top-level form range", () => {
      //                  0123456789012 3 456789...
      const src = "(defn a [] 1) (defn b [] 2)";
      const ast = parse(src);
      // "(defn a [] 1)" is chars 0..13
      expect(navigator.rangeForDefun(ast, 3)).toEqual([0, 13]);
      // "(defn b [] 2)" is chars 14..27
      expect(navigator.rangeForDefun(ast, 16)).toEqual([14, 27]);
    });

    it("returns null outside any form", () => {
      const ast = parse("");
      expect(navigator.rangeForDefun(ast, 0)).toBeNull();
    });
  });
});
