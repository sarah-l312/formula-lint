import { test } from "node:test";
import assert from "node:assert/strict";
import { lintFormula } from "./linter.js";

function rulesFor(formula: string): string[] {
  return lintFormula(formula).map((f) => f.rule);
}

test("a balanced, well-known formula has no findings", () => {
  assert.deepEqual(lintFormula("SUM(B1:B10)"), []);
});

test("flags a closing paren with no matching open", () => {
  const findings = lintFormula("SUM(B1)*)");
  assert.deepEqual(rulesFor("SUM(B1)*)"), ["unbalanced-parens"]);
  assert.equal(findings[0]?.column, 9);
});

test("flags an opening paren that's never closed", () => {
  const findings = lintFormula("SUM(B1:B10");
  assert.deepEqual(rulesFor("SUM(B1:B10"), ["unbalanced-parens"]);
  assert.equal(findings[0]?.column, 4);
});

test("flags an unterminated string literal", () => {
  const findings = lintFormula('CONCAT("a", "b)');
  assert.deepEqual(rulesFor('CONCAT("a", "b)'), ["unterminated-string"]);
  assert.equal(findings[0]?.column, 13);
});

test("a terminated string is not flagged", () => {
  assert.deepEqual(lintFormula('CONCAT("a", "b")'), []);
});

test("flags division by the literal 0", () => {
  const findings = lintFormula("A1/0");
  assert.deepEqual(rulesFor("A1/0"), ["division-by-zero"]);
  assert.equal(findings[0]?.column, 3);
});

test("does not flag division by a nonzero literal or a cell reference", () => {
  assert.deepEqual(lintFormula("A1/2"), []);
  assert.deepEqual(lintFormula("A1/B1"), []);
});

test("flags a call to an unrecognized function name", () => {
  const findings = lintFormula("FOOBAR(A1)");
  assert.deepEqual(rulesFor("FOOBAR(A1)"), ["unknown-function-name"]);
  assert.equal(findings[0]?.column, 1);
  assert.match(findings[0]?.message ?? "", /FOOBAR/);
});

test("known function names, checked case-insensitively, are not flagged", () => {
  assert.deepEqual(lintFormula("sum(A1:A2)"), []);
  assert.deepEqual(lintFormula("VLOOKUP(A1, B1:C10, 2, FALSE)"), []);
});

test("an identifier not followed by a paren is not treated as a function call", () => {
  assert.deepEqual(lintFormula("FOOBAR+1"), []);
});

test("flags a deprecated function and names its replacement", () => {
  const findings = lintFormula("RANK(A1, A1:A10)");
  assert.deepEqual(rulesFor("RANK(A1, A1:A10)"), ["deprecated-function"]);
  assert.match(findings[0]?.message ?? "", /RANK\.EQ/);
});

test("a deprecated function is not also reported as unknown", () => {
  assert.deepEqual(rulesFor("STDEV(A1:A10)"), ["deprecated-function"]);
});

test("a single formula can trigger findings from more than one rule", () => {
  const findings = rulesFor("FOOBAR(A1/0");
  assert.deepEqual(
    [...findings].sort(),
    ["division-by-zero", "unbalanced-parens", "unknown-function-name"].sort(),
  );
});

test("a disabled rule reports nothing even when it would otherwise fire", () => {
  const findings = lintFormula("A1/0", { disabledRules: new Set(["division-by-zero"]) });
  assert.deepEqual(findings, []);
});

test("disabling one rule leaves the others running", () => {
  const findings = lintFormula("FOOBAR(A1/0", { disabledRules: new Set(["division-by-zero"]) });
  assert.deepEqual(
    [...findings.map((f) => f.rule)].sort(),
    ["unbalanced-parens", "unknown-function-name"].sort(),
  );
});

test("an empty disabledRules set behaves like no options at all", () => {
  assert.deepEqual(lintFormula("A1/0", { disabledRules: new Set() }), lintFormula("A1/0"));
});
