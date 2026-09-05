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
const FORMATS = new Set(["text", "json"]);

interface Args {
  path: string;
  format: "text" | "json";
}

function parseArgs(argv: string[]): Args {
  let path: string | undefined;
  let format = "text";

  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--format=")) {
      format = arg.slice("--format=".length);
    } else if (!path) {
      path = arg;
    }
  }

  if (!path) {
    process.stderr.write("usage: formula-lint <file> [--format=text|json]\n");
    process.exit(1);
  }
  if (!FORMATS.has(format)) {
    process.stderr.write(`unknown format "${format}", expected one of: ${[...FORMATS].join(", ")}\n`);
    process.exit(1);
  }

  return { path, format: format as Args["format"] };
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

function printText(path: string, findings: LineFinding[]): void {
  if (findings.length === 0) {
    process.stdout.write(`${path}: no issues found\n`);
    return;
  }

  for (const finding of findings) {
    process.stdout.write(`${formatFinding(path, finding)}\n\n`);
  }

  const errorCount = findings.filter((f) => f.severity === "error").length;
  process.stdout.write(`${findings.length} issue(s), ${errorCount} error(s)\n`);
}

function printJson(path: string, findings: LineFinding[]): void {
  const payload = {
    path,
    issueCount: findings.length,
    errorCount: findings.filter((f) => f.severity === "error").length,
    findings: findings.map((f) => ({
      rule: f.rule,
      message: f.message,
      severity: f.severity,
      line: f.line,
      column: f.column,
    })),
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function main(): void {
  const { path, format } = parseArgs(process.argv);
  const findings = lintFile(path);

  if (format === "json") {
    printJson(path, findings);
  } else {
    printText(path, findings);
  }

  if (findings.length > 0) {
    process.exitCode = 1;
  }
}

main();
