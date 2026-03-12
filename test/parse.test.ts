import { describe, it, expect } from "vitest";
import { parse } from "../src/index";

describe("parse", () => {
  it("parses empty input", () => {
    const ast = parse("");
    expect(ast.type).toBe("toplevel");
    expect(ast.children).toHaveLength(0);
    expect(ast.errors).toHaveLength(0);
  });

  it("parses a simple symbol", () => {
    const ast = parse("foo");
    expect(ast.children).toHaveLength(1);
    const node = ast.children[0]!;
    expect(node.type).toBe("symbol");
    expect(node.start).toBe(0);
    expect(node.end).toBe(3);
    if (node.type === "symbol") {
      expect(node.source).toBe("foo");
    }
  });

  it("parses a number", () => {
    const ast = parse("42");
    expect(ast.children).toHaveLength(1);
    expect(ast.children[0]!.type).toBe("number");
  });

  it("parses a negative number", () => {
    const ast = parse("-3.14");
    expect(ast.children).toHaveLength(1);
    expect(ast.children[0]!.type).toBe("number");
  });

  it("parses a string", () => {
    const ast = parse('"hello world"');
    expect(ast.children).toHaveLength(1);
    const node = ast.children[0]!;
    expect(node.type).toBe("string");
    if (node.type === "string") {
      expect(node.open).toBe('"');
      expect(node.close).toBe('"');
    }
  });

  it("parses a simple list", () => {
    const ast = parse("(a b c)");
    expect(ast.children).toHaveLength(1);
    const list = ast.children[0]!;
    expect(list.type).toBe("list");
    if (list.type === "list") {
      expect(list.children).toHaveLength(3);
      expect(list.open).toBe("(");
      expect(list.close).toBe(")");
    }
  });

  it("parses nested lists", () => {
    const ast = parse("(a (b c) d)");
    expect(ast.children).toHaveLength(1);
    const outer = ast.children[0]!;
    if (outer.type === "list") {
      expect(outer.children).toHaveLength(3);
      const inner = outer.children[1]!;
      expect(inner.type).toBe("list");
      if (inner.type === "list") {
        expect(inner.children).toHaveLength(2);
      }
    }
  });

  it("parses multiple top-level expressions", () => {
    const ast = parse("foo bar baz");
    expect(ast.children).toHaveLength(3);
  });

  it("parses square brackets", () => {
    const ast = parse("[a b]");
    expect(ast.children).toHaveLength(1);
    const list = ast.children[0]!;
    if (list.type === "list") {
      expect(list.open).toBe("[");
      expect(list.close).toBe("]");
    }
  });

  it("parses curly braces", () => {
    const ast = parse("{a b}");
    expect(ast.children).toHaveLength(1);
    const list = ast.children[0]!;
    if (list.type === "list") {
      expect(list.open).toBe("{");
      expect(list.close).toBe("}");
    }
  });

  it("records errors for unmatched parens", () => {
    const ast = parse("(a b");
    expect(ast.errors.length).toBeGreaterThan(0);
  });

  it("parses comments", () => {
    const ast = parse("; this is a comment\nfoo");
    expect(ast.children).toHaveLength(2);
    expect(ast.children[0]!.type).toBe("comment");
    expect(ast.children[1]!.type).toBe("symbol");
  });

  it("parses character literals", () => {
    const ast = parse("\\x");
    expect(ast.children).toHaveLength(1);
    expect(ast.children[0]!.type).toBe("char");
  });

  it("parses string with escapes", () => {
    const ast = parse('"hello \\"world\\""');
    expect(ast.children).toHaveLength(1);
    expect(ast.children[0]!.type).toBe("string");
  });

  it("respects addSourceForLeafs option", () => {
    const ast = parse("foo", { addSourceForLeafs: false });
    const node = ast.children[0]!;
    if (node.type === "symbol") {
      expect(node.source).toBeUndefined();
    }
  });

  it("handles mixed content", () => {
    const ast = parse('(defn greet [name] (str "Hello, " name))');
    expect(ast.children).toHaveLength(1);
    const defn = ast.children[0]!;
    expect(defn.type).toBe("list");
    if (defn.type === "list") {
      expect(defn.children.length).toBeGreaterThanOrEqual(4);
    }
  });
});
