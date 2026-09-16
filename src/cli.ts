#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { lintFormula, RULE_NAMES, type Finding } from "./linter.js";

interface LineFinding extends Finding {
  line: number;
  // Overrides Finding["column"]: this one is a 1-based column in the
  // original source line, not in the isolated formula body.
  column: number;
  sourceLine: string;
}

const SEPARATOR = ": ";
const FORMATS = new Set(["text", "json"]);
const DEFAULT_CONFIG_FILE = ".formula-lint.json";

// The two structural checks in lintFile() aren't part of lintFormula's rule
// list (they run before a formula body exists to tokenize), but they still
// need rule names so a config file can turn them off like any other rule.
const CLI_RULE_NAMES = ["malformed-line", "missing-equals"];
const ALL_RULE_NAMES = new Set([...CLI_RULE_NAMES, ...RULE_NAMES]);

interface Args {
  path: string;
  format: "text" | "json";
  configPath: string | undefined;
}

function parseArgs(argv: string[]): Args {
  let path: string | undefined;
  let format = "text";
  let configPath: string | undefined;

  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--format=")) {
      format = arg.slice("--format=".length);
    } else if (arg.startsWith("--config=")) {
      configPath = arg.slice("--config=".length);
    } else if (!path) {
      path = arg;
    }
  }

  if (!path) {
    process.stderr.write("usage: formula-lint <file> [--format=text|json] [--config=<path>]\n");
    process.exit(1);
  }
  if (!FORMATS.has(format)) {
    process.stderr.write(`unknown format "${format}", expected one of: ${[...FORMATS].join(", ")}\n`);
    process.exit(1);
  }

  return { path, format: format as Args["format"], configPath };
}

// Fails the process with a message on any problem with the config file,
// rather than silently ignoring a typo that would leave a rule the user
// meant to disable still running.
function loadDisabledRules(configPath: string | undefined): Set<string> {
  const path = configPath ?? (existsSync(DEFAULT_CONFIG_FILE) ? DEFAULT_CONFIG_FILE : undefined);
  if (!path) {
    return new Set();
  }

  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    process.stderr.write(`could not read config file "${path}": ${(err as Error).message}\n`);
    process.exit(1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    process.stderr.write(`could not parse config file "${path}": ${(err as Error).message}\n`);
    process.exit(1);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    process.stderr.write(`config file "${path}" must contain a JSON object\n`);
    process.exit(1);
  }

  const { rules } = parsed as { rules?: unknown };
  const disabledRules = new Set<string>();

  if (rules === undefined) {
    return disabledRules;
  }
  if (typeof rules !== "object" || rules === null || Array.isArray(rules)) {
    process.stderr.write(`config file "${path}": "rules" must be an object\n`);
    process.exit(1);
  }

  for (const [name, value] of Object.entries(rules as Record<string, unknown>)) {
    if (!ALL_RULE_NAMES.has(name)) {
      process.stderr.write(`config file "${path}": unknown rule "${name}"\n`);
      process.exit(1);
    }
    if (typeof value !== "boolean") {
      process.stderr.write(`config file "${path}": rule "${name}" must be true or false, got ${JSON.stringify(value)}\n`);
      process.exit(1);
    }
    if (value === false) {
      disabledRules.add(name);
    }
  }

  return disabledRules;
}

function lintFile(path: string, disabledRules: ReadonlySet<string>): LineFinding[] {
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
      if (!disabledRules.has("malformed-line")) {
        findings.push({
          rule: "malformed-line",
          message: `expected "<cell>${SEPARATOR}=<formula>", found no "${SEPARATOR}" separator`,
          severity: "error",
          line: lineNumber,
          column: 1,
          sourceLine: line,
        });
      }
      return;
    }

    const formulaStart = separatorIndex + SEPARATOR.length; // 0-based index of "="
    const formula = line.slice(formulaStart);

    if (!formula.startsWith("=")) {
      if (!disabledRules.has("missing-equals")) {
        findings.push({
          rule: "missing-equals",
          message: 'formula must start with "="',
          severity: "error",
          line: lineNumber,
          column: formulaStart + 1,
          sourceLine: line,
        });
      }
      return;
    }

    const body = formula.slice(1);
    for (const finding of lintFormula(body, { disabledRules })) {
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
  const { path, format, configPath } = parseArgs(process.argv);
  const disabledRules = loadDisabledRules(configPath);
  const findings = lintFile(path, disabledRules);

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
