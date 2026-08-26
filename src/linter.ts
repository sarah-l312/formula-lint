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
  checkUnterminatedString,
  checkUnknownFunctionName,
];

// Common Excel / Google Sheets functions. Not exhaustive — the goal is to
// catch typos and made-up names, not to be a complete function reference.
// Compared case-insensitively since spreadsheet function names are.
const KNOWN_FUNCTIONS = new Set([
  "SUM", "SUMIF", "SUMIFS", "SUMPRODUCT",
  "AVERAGE", "AVERAGEA", "AVERAGEIF", "AVERAGEIFS",
  "COUNT", "COUNTA", "COUNTBLANK", "COUNTIF", "COUNTIFS",
  "MIN", "MINA", "MINIFS", "MAX", "MAXA", "MAXIFS",
  "IF", "IFS", "IFERROR", "IFNA", "AND", "OR", "NOT", "XOR", "SWITCH",
  "VLOOKUP", "HLOOKUP", "XLOOKUP", "LOOKUP", "INDEX", "MATCH", "CHOOSE",
  "OFFSET", "INDIRECT",
  "CONCATENATE", "CONCAT", "TEXTJOIN", "LEN", "LEFT", "RIGHT", "MID",
  "TRIM", "UPPER", "LOWER", "PROPER", "SUBSTITUTE", "REPLACE", "FIND",
  "SEARCH", "SPLIT", "REPT", "TEXT", "VALUE", "CLEAN", "EXACT",
  "ROUND", "ROUNDUP", "ROUNDDOWN", "CEILING", "FLOOR", "TRUNC", "INT",
  "ABS", "SIGN", "SQRT", "POWER", "EXP", "LN", "LOG", "LOG10", "MOD",
  "PI", "RAND", "RANDBETWEEN",
  "ISERROR", "ISERR", "ISNA", "ISBLANK", "ISNUMBER", "ISTEXT",
  "ISNONTEXT", "ISLOGICAL", "ISREF", "ISFORMULA", "ISEVEN", "ISODD",
  "TODAY", "NOW", "DATE", "DATEVALUE", "TIME", "TIMEVALUE",
  "YEAR", "MONTH", "DAY", "HOUR", "MINUTE", "SECOND", "WEEKDAY",
  "WEEKNUM", "EDATE", "EOMONTH", "DATEDIF", "NETWORKDAYS", "WORKDAY",
  "TRUE", "FALSE", "N", "NA", "TYPE", "CELL", "ROW", "COLUMN",
  "ROWS", "COLUMNS", "TRANSPOSE", "UNIQUE", "SORT", "SORTBY", "FILTER",
  "SEQUENCE", "ARRAYFORMULA",
  "NPV", "IRR", "PMT", "PV", "FV", "RATE", "NPER",
]);

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

function checkUnterminatedString(tokens: Token[]): Finding[] {
  const findings: Finding[] = [];

  for (const token of tokens) {
    if (token.type === "string" && token.terminated === false) {
      findings.push({
        rule: "unterminated-string",
        message: "string literal is missing its closing quote",
        severity: "error",
        column: token.column,
      });
    }
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

// An identifier immediately followed by "(" is a function call, not a cell
// or named-range reference. Flag ones that aren't in KNOWN_FUNCTIONS —
// this is a warning, not an error, since the list can't cover every
// custom or newer function a real spreadsheet might use.
function checkUnknownFunctionName(tokens: Token[]): Finding[] {
  const findings: Finding[] = [];

  for (let i = 0; i < tokens.length - 1; i++) {
    const current = tokens[i] as Token;
    const next = tokens[i + 1] as Token;

    if (current.type === "ident" && next.type === "lparen" && !KNOWN_FUNCTIONS.has(current.value.toUpperCase())) {
      findings.push({
        rule: "unknown-function-name",
        message: `"${current.value}" is not a recognized function name`,
        severity: "warning",
        column: current.column,
      });
    }
  }

  return findings;
}
