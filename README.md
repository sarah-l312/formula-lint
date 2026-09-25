# formula-lint

Spreadsheets accumulate formulas that nobody re-reads until something breaks.
A `/0` that used to be a safe reference, a paren that got deleted during a
copy-paste, a stray character left over from a half-finished edit — these
sit quietly in a cell until the one day the referenced value actually hits
zero and the whole sheet fills with `#DIV/0!`. Nobody catches this by eye,
especially when the formulas were exported out of the spreadsheet into a
flat text dump for review.

`formula-lint` reads a plain-text dump of cell formulas and reports problems
with the exact line and column they occur at, the same way a compiler
would.

## Input format

One formula per line:

```
<cell>: =<formula>
```

Blank lines and lines starting with `#` are ignored. Example (`sheet.txt`):

```
# quarterly margin sheet, exported for review
A1: =SUM(B1:B10)
A2: =A1/COUNT(B1:B10
A3: =A1/0
```

## Usage

```
npx tsc
node dist/cli.js sheet.txt
```

Output:

```
sheet.txt:3:20: error [unbalanced-parens] opening parenthesis is never closed
  A2: =A1/COUNT(B1:B10
                    ^

sheet.txt:4:8: error [division-by-zero] division by the literal 0 always produces #DIV/0!
  A3: =A1/0
         ^

2 issue(s), 2 error(s)
```

Every finding points at the line and column in the source file, not just
the formula, so it's a direct jump-to in an editor even when the dump has
one cell reference per line.

Pass `--format=json` for machine-readable output instead:

```
node dist/cli.js sheet.txt --format=json
```

```json
{
  "path": "sheet.txt",
  "issueCount": 2,
  "errorCount": 2,
  "findings": [
    { "rule": "unbalanced-parens", "message": "opening parenthesis is never closed", "severity": "error", "line": 3, "column": 20 },
    { "rule": "division-by-zero", "message": "division by the literal 0 always produces #DIV/0!", "severity": "error", "line": 4, "column": 8 }
  ]
}
```

## Rules

| rule                | catches |
|----------------------|---------|
| `unbalanced-parens`  | an opening `(` with no matching `)`, or vice versa |
| `division-by-zero`   | a literal `/0` in the formula |
| `missing-equals`     | a formula that doesn't start with `=` |
| `malformed-line`     | a line that isn't `<cell>: =<formula>` |
| `unterminated-string` | a `"` with no matching closing quote |
| `unknown-function-name` | a call like `FOO(...)` where `FOO` isn't a recognized function |
| `deprecated-function` | a call to a function Excel/Sheets kept for compatibility but replaced, e.g. `RANK` → `RANK.EQ` |
| `self-reference` | a formula that refers to its own cell, e.g. `A2: =A2+1` |

## Configuring rules

Any rule can be turned off with a config file. By default `formula-lint`
looks for `.formula-lint.json` next to where it's run from; pass a
different path with `--config=<path>`:

```
node dist/cli.js sheet.txt --config=lint-config.json
```

The file is a JSON object with a `rules` key mapping rule names to
`false` to disable them (any rule not mentioned stays on):

```json
{
  "rules": {
    "unknown-function-name": false,
    "deprecated-function": false
  }
}
```

An unrecognized rule name, or a value other than `true`/`false`, is
treated as a mistake worth stopping for — `formula-lint` exits with an
error instead of silently ignoring it.

## Building

No dependencies to install. Compile with any TypeScript compiler on your
`PATH` (`tsc`) — the config targets Node's ESM module resolution and
outputs to `dist/`.

Run the tests with `npm test`, which compiles and then runs `node --test`
against `dist/`. Tests use Node's built-in test runner, so there's nothing
extra to install.

## Status

Early. The lexer and rule set are enough to be useful on real formula
dumps, but the rule set is intentionally small so far.
