import { tokenize, type Token } from "./lexer.js";

export interface Finding {
  rule: string;
  message: string;
  severity: "error" | "warning";
  // 1-based column within the formula body (after the leading "="). The
  // caller maps this to a column in the original source line.
  column: number;
}

interface Rule {
  name: string;
  check: (tokens: Token[], options: LintOptions) => Finding[];
}

const RULES: Rule[] = [
  { name: "unbalanced-parens", check: checkBalancedParens },
  { name: "unterminated-string", check: checkUnterminatedString },
  { name: "division-by-zero", check: checkDivisionByZero },
  { name: "unknown-function-name", check: checkUnknownFunctionName },
  { name: "deprecated-function", check: checkDeprecatedFunction },
  { name: "self-reference", check: checkSelfReference },
];

// The rule names a config file's "rules" object may key on for the checks
// in this module. cli.ts adds its own two structural rule names (malformed
// lines, missing "=") to this set before validating a config file, since
// those checks run before a formula body ever reaches lintFormula.
export const RULE_NAMES: readonly string[] = RULES.map((rule) => rule.name);

// Functions Excel/Sheets kept around for backward compatibility after
// replacing them with a more precise successor — mostly the 2010
// statistical-function overhaul that split names into .INC/.EXC or .S/.P
// variants. They still work, so this is a warning, not an error.
const DEPRECATED_FUNCTIONS = new Map<string, string>([
  ["BINOMDIST", "BINOM.DIST"],
  ["CHIDIST", "CHISQ.DIST.RT"],
  ["CHIINV", "CHISQ.INV.RT"],
  ["CHITEST", "CHISQ.TEST"],
  ["CONCATENATE", "CONCAT"],
  ["COVAR", "COVARIANCE.P"],
  ["CRITBINOM", "BINOM.INV"],
  ["EXPONDIST", "EXPON.DIST"],
  ["FDIST", "F.DIST.RT"],
  ["FINV", "F.INV.RT"],
  ["FTEST", "F.TEST"],
  ["GAMMADIST", "GAMMA.DIST"],
  ["GAMMAINV", "GAMMA.INV"],
  ["HYPGEOMDIST", "HYPGEOM.DIST"],
  ["LOGINV", "LOGNORM.INV"],
  ["LOGNORMDIST", "LOGNORM.DIST"],
  ["MODE", "MODE.SNGL"],
  ["NEGBINOMDIST", "NEGBINOM.DIST"],
  ["NORMDIST", "NORM.DIST"],
  ["NORMINV", "NORM.INV"],
  ["NORMSDIST", "NORM.S.DIST"],
  ["NORMSINV", "NORM.S.INV"],
  ["PERCENTILE", "PERCENTILE.INC"],
  ["PERCENTRANK", "PERCENTRANK.INC"],
  ["POISSON", "POISSON.DIST"],
  ["QUARTILE", "QUARTILE.INC"],
  ["RANK", "RANK.EQ"],
  ["STDEV", "STDEV.S"],
  ["STDEVP", "STDEV.P"],
  ["TDIST", "T.DIST.2T"],
  ["TINV", "T.INV.2T"],
  ["TTEST", "T.TEST"],
  ["VAR", "VAR.S"],
  ["VARP", "VAR.P"],
  ["WEIBULL", "WEIBULL.DIST"],
  ["ZTEST", "Z.TEST"],
]);

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
  ...DEPRECATED_FUNCTIONS.keys(),
]);

export interface LintOptions {
  disabledRules?: ReadonlySet<string>;
  // The cell this formula lives in (e.g. "A2"), used by self-reference.
  // Left undefined, that rule simply never fires — a caller that doesn't
  // know the cell (like a standalone formula snippet) isn't penalized.
  cellRef?: string;
}

export function lintFormula(formula: string, options: LintOptions = {}): Finding[] {
  const tokens = tokenize(formula);
  const disabled = options.disabledRules;
  return RULES.filter((rule) => !disabled?.has(rule.name)).flatMap((rule) => rule.check(tokens, options));
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

// Same identifier-then-"(" shape as checkUnknownFunctionName, but flags
// names that Excel/Sheets still runs, just replaced by a successor with the
// same result and better precision or clarity.
function checkDeprecatedFunction(tokens: Token[]): Finding[] {
  const findings: Finding[] = [];

  for (let i = 0; i < tokens.length - 1; i++) {
    const current = tokens[i] as Token;
    const next = tokens[i + 1] as Token;

    if (current.type !== "ident" || next.type !== "lparen") continue;

    const replacement = DEPRECATED_FUNCTIONS.get(current.value.toUpperCase());
    if (replacement) {
      findings.push({
        rule: "deprecated-function",
        message: `"${current.value}" is deprecated, use "${replacement}" instead`,
        severity: "warning",
        column: current.column,
      });
    }
  }

  return findings;
}

// A formula that names the very cell it's written in guarantees a circular
// reference (Excel/Sheets either error immediately or loop forever with
// iterative calculation on). Only checked when the caller supplies which
// cell the formula came from; an ident is only a reference here, not a
// function call, when it isn't immediately followed by "(".
function checkSelfReference(tokens: Token[], options: LintOptions): Finding[] {
  const cellRef = options.cellRef;
  if (!cellRef) return [];

  const findings: Finding[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const current = tokens[i] as Token;
    const next = tokens[i + 1];

    if (current.type === "ident" && current.value.toUpperCase() === cellRef.toUpperCase() && next?.type !== "lparen") {
      findings.push({
        rule: "self-reference",
        message: `formula refers to its own cell "${cellRef}", which produces a circular reference`,
        severity: "error",
        column: current.column,
      });
    }
  }

  return findings;
}
