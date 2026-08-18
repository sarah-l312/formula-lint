#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { lintFormula, type Finding } from "./linter.js";

interface LineFinding extends Finding {
  line: number;
  // Overrides Finding["column"]: this one is a 1-based column in the
  // original source line, not in the isolated formula body.
  column: number;
  sourceLine: string;
}

const SEPARATOR = ": ";

function parseArgs(argv: string[]): string {
  const path = argv[2];
  if (!path) {
    process.stderr.write("usage: formula-lint <file>\n");
    process.exit(1);
  }
  return path;
}

function lintFile(path: string): LineFinding[] {
  const text = readFileSync(path, "utf8");
  const lines = text.split(/\r\n|\n/);
  const findings: LineFinding[] = [];

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    if (line.trim() === "" || line.trimStart().startsWith("#")) {
      return;
    }

    const separatorIndex = line.indexOf(SEPARATOR);
    if (separatorIndex === -1) {
      findings.push({
        rule: "malformed-line",
        message: `expected "<cell>${SEPARATOR}=<formula>", found no "${SEPARATOR}" separator`,
        severity: "error",
        line: lineNumber,
        column: 1,
        sourceLine: line,
      });
      return;
    }

    const formulaStart = separatorIndex + SEPARATOR.length; // 0-based index of "="
    const formula = line.slice(formulaStart);

    if (!formula.startsWith("=")) {
      findings.push({
        rule: "missing-equals",
        message: 'formula must start with "="',
        severity: "error",
        line: lineNumber,
        column: formulaStart + 1,
        sourceLine: line,
      });
      return;
    }

    const body = formula.slice(1);
    for (const finding of lintFormula(body)) {
      findings.push({
        ...finding,
        line: lineNumber,
        column: formulaStart + finding.column + 1,
        sourceLine: line,
      });
    }
  });

  return findings;
}

function formatFinding(path: string, finding: LineFinding): string {
  const location = `${path}:${finding.line}:${finding.column}`;
  const header = `${location}: ${finding.severity} [${finding.rule}] ${finding.message}`;
  const pointer = `${" ".repeat(finding.column - 1)}^`;
  return `${header}\n  ${finding.sourceLine}\n  ${pointer}`;
}

function main(): void {
  const path = parseArgs(process.argv);
  const findings = lintFile(path);

  if (findings.length === 0) {
    process.stdout.write(`${path}: no issues found\n`);
    return;
  }

  for (const finding of findings) {
    process.stdout.write(`${formatFinding(path, finding)}\n\n`);
  }

  const errorCount = findings.filter((f) => f.severity === "error").length;
  process.stdout.write(`${findings.length} issue(s), ${errorCount} error(s)\n`);
  process.exitCode = 1;
}

main();
