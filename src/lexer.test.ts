import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenize } from "./lexer.js";

test("empty formula produces only eof", () => {
  const tokens = tokenize("");
  assert.deepEqual(tokens, [{ type: "eof", value: "", column: 1 }]);
});

test("skips spaces and tabs between tokens", () => {
  const tokens = tokenize("  1\t+\t2  ");
  assert.deepEqual(
    tokens.map((t) => [t.type, t.value]),
    [
      ["number", "1"],
      ["operator", "+"],
      ["number", "2"],
      ["eof", ""],
    ],
  );
});

test("numbers include an integer part and a decimal part", () => {
  const tokens = tokenize("12.5");
  assert.equal(tokens[0]?.type, "number");
  assert.equal(tokens[0]?.value, "12.5");
});

test("a leading dot is only a number if followed by a digit", () => {
  const withDigit = tokenize(".5");
  assert.equal(withDigit[0]?.type, "number");
  assert.equal(withDigit[0]?.value, ".5");

  const withoutDigit = tokenize(".");
  assert.equal(withoutDigit[0]?.type, "operator");
  assert.equal(withoutDigit[0]?.value, ".");
});

test("identifiers allow letters, digits, underscore and dollar", () => {
  const tokens = tokenize("SUM_2$x");
  assert.equal(tokens[0]?.type, "ident");
  assert.equal(tokens[0]?.value, "SUM_2$x");
});

test("an identifier cannot start with a digit", () => {
  const tokens = tokenize("2FOO");
  assert.equal(tokens[0]?.type, "number");
  assert.equal(tokens[0]?.value, "2");
  assert.equal(tokens[1]?.type, "ident");
  assert.equal(tokens[1]?.value, "FOO");
});

test("terminated string carries its quotes and terminated: true", () => {
  const tokens = tokenize('"hello"');
  assert.equal(tokens[0]?.type, "string");
  assert.equal(tokens[0]?.value, '"hello"');
  assert.equal(tokens[0]?.terminated, true);
});

test("unterminated string runs to the end of input", () => {
  const tokens = tokenize('"hello');
  assert.equal(tokens[0]?.type, "string");
  assert.equal(tokens[0]?.value, '"hello');
  assert.equal(tokens[0]?.terminated, false);
});

test("recognizes parens, comma and colon", () => {
  const tokens = tokenize("(,)");
  assert.deepEqual(
    tokens.map((t) => t.type),
    ["lparen", "comma", "rparen", "eof"],
  );

  const colon = tokenize(":");
  assert.equal(colon[0]?.type, "colon");
});

test("recognizes every known operator character", () => {
  const tokens = tokenize("+-*/^&=<>");
  assert.deepEqual(
    tokens.slice(0, -1).map((t) => t.value),
    ["+", "-", "*", "/", "^", "&", "=", "<", ">"],
  );
});

test("an unrecognized character is still emitted as a token", () => {
  const tokens = tokenize("@");
  assert.equal(tokens[0]?.type, "operator");
  assert.equal(tokens[0]?.value, "@");
});

test("columns are 1-based and track skipped whitespace", () => {
  const tokens = tokenize("  A1");
  assert.equal(tokens[0]?.column, 3);
});

test("eof column is one past the end of the formula", () => {
  const tokens = tokenize("A1");
  assert.equal(tokens.at(-1)?.type, "eof");
  assert.equal(tokens.at(-1)?.column, 3);
});
