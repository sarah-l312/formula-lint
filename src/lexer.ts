// Tokenizes a single formula body (the part after the leading "=").
// Columns are 1-based and relative to the start of that body, which the
// caller is responsible for mapping back to a position in the source file.

export type TokenType =
  | "number"
  | "string"
  | "ident"
  | "operator"
  | "lparen"
  | "rparen"
  | "comma"
  | "colon"
  | "eof";

export interface Token {
  type: TokenType;
  value: string;
  column: number;
  // Only meaningful for "string" tokens: false when the lexer ran off the
  // end of the formula looking for a closing quote.
  terminated?: boolean;
}

const OPERATORS = new Set(["+", "-", "*", "/", "^", "&", "=", "<", ">"]);
const IDENT_START = /[A-Za-z_$]/;
const IDENT_BODY = /[A-Za-z0-9_$]/;
const DIGIT = /[0-9]/;

export function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  const len = formula.length;
  let i = 0;

  while (i < len) {
    const ch = formula[i] as string;

    if (ch === " " || ch === "\t") {
      i++;
      continue;
    }

    const column = i + 1;

    if (ch === "(") {
      tokens.push({ type: "lparen", value: ch, column });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "rparen", value: ch, column });
      i++;
      continue;
    }
    if (ch === ",") {
      tokens.push({ type: "comma", value: ch, column });
      i++;
      continue;
    }
    if (ch === ":") {
      tokens.push({ type: "colon", value: ch, column });
      i++;
      continue;
    }
    if (ch === '"') {
      // A missing closing quote just runs to the end of the formula. The
      // token still carries an accurate start column and a "terminated"
      // flag so a rule can flag it without the lexer having to error out.
      let j = i + 1;
      while (j < len && formula[j] !== '"') j++;
      const terminated = j < len;
      const end = terminated ? j + 1 : j;
      tokens.push({ type: "string", value: formula.slice(i, end), column, terminated });
      i = end;
      continue;
    }
    if (DIGIT.test(ch) || (ch === "." && DIGIT.test(formula[i + 1] ?? ""))) {
      let j = i;
      while (j < len && /[0-9.]/.test(formula[j] as string)) j++;
      tokens.push({ type: "number", value: formula.slice(i, j), column });
      i = j;
      continue;
    }
    if (IDENT_START.test(ch)) {
      let j = i;
      while (j < len && IDENT_BODY.test(formula[j] as string)) j++;
      tokens.push({ type: "ident", value: formula.slice(i, j), column });
      i = j;
      continue;
    }
    if (OPERATORS.has(ch)) {
      tokens.push({ type: "operator", value: ch, column });
      i++;
      continue;
    }

    // Unrecognized character (stray punctuation, non-ASCII, etc). Emit it
    // as its own token instead of dropping it, so a future rule can flag
    // it without the lexer silently swallowing input.
    tokens.push({ type: "operator", value: ch, column });
    i++;
  }

  tokens.push({ type: "eof", value: "", column: len + 1 });
  return tokens;
}
