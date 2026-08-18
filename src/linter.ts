import { tokenize, type Token } from "./lexer.js";

export interface Finding {
  rule: string;
  message: string;
  severity: "error" | "warning";
  // 1-based column within the formula body (after the leading "="). The
  // caller maps this to a column in the original source line.
  column: number;
}

const RULES: Array<(tokens: Token[]) => Finding[]> = [
  checkBalancedParens,
  checkDivisionByZero,
];

export function lintFormula(formula: string): Finding[] {
  const tokens = tokenize(formula);
  return RULES.flatMap((rule) => rule(tokens));
}

function checkBalancedParens(tokens: Token[]): Finding[] {
  const findings: Finding[] = [];
  const openStack: Token[] = [];

  for (const token of tokens) {
    if (token.type === "lparen") {
      openStack.push(token);
    } else if (token.type === "rparen") {
      if (openStack.pop() === undefined) {
        findings.push({
          rule: "unbalanced-parens",
          message: "closing parenthesis has no matching opening parenthesis",
          severity: "error",
          column: token.column,
        });
      }
    }
  }

  for (const unclosed of openStack) {
    findings.push({
      rule: "unbalanced-parens",
      message: "opening parenthesis is never closed",
      severity: "error",
      column: unclosed.column,
    });
  }

  return findings;
}

// Catches the one case that's unambiguous from the token stream alone:
// a literal zero on the right-hand side of a division. `A1/B1` where B1
// happens to evaluate to zero at runtime is a different, harder problem.
function checkDivisionByZero(tokens: Token[]): Finding[] {
  const findings: Finding[] = [];

  for (let i = 0; i < tokens.length - 1; i++) {
    const current = tokens[i] as Token;
    const next = tokens[i + 1] as Token;

    if (current.type === "operator" && current.value === "/" && next.type === "number" && Number(next.value) === 0) {
      findings.push({
        rule: "division-by-zero",
        message: "division by the literal 0 always produces #DIV/0!",
        severity: "error",
        column: current.column,
      });
    }
  }

  return findings;
}
