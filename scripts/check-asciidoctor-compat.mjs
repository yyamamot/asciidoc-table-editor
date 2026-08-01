#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import asciidoctorFactory from "@asciidoctor/core";

const root = process.cwd();
const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const outRoot = join(root, ".tmp", "compat", "asciidoctor", timestamp);
const manifestPath = join(root, "fixtures", "compat", "asciidoctor-table-syntax", "manifest.json");

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});

async function main() {
  const build = spawnSync("pnpm", ["run", "build:test"], {
    cwd: root,
    stdio: "inherit"
  });
  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }

  mkdirSync(outRoot, { recursive: true });
  const manifest = readManifest();
  const core = await import(pathToFileURL(join(root, "out", "src", "core", "index.js")).href);
  const asciidoctor = asciidoctorFactory();
  const results = manifest.fixtures.map((fixture) => compareFixture(core, asciidoctor, fixture));
  const summary = {
    generatedAt: new Date().toISOString(),
    manifest: relativePath(manifestPath),
    oracle: manifest.oracle,
    results,
    passed: results.every((result) => result.passed)
  };

  writeFileSync(join(outRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  writeFileSync(join(outRoot, "summary.md"), renderSummary(summary), "utf8");
  console.log(`asciidoctor compat summary: ${join(outRoot, "summary.json")}`);
  console.log(`asciidoctor compat result: ${summary.passed ? "pass" : "fail"}`);
  if (!summary.passed) {
    process.exitCode = 1;
  }
}

function readManifest() {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(manifest.fixtures)) {
    throw new Error(`Invalid compat manifest: ${manifestPath}`);
  }
  return manifest;
}

function compareFixture(core, asciidoctor, fixture) {
  const sourcePath = join(root, fixture.source);
  if (!existsSync(sourcePath)) {
    return {
      fixtureId: fixture.id,
      source: fixture.source,
      status: fixture.status,
      passed: false,
      failures: [`fixture missing: ${sourcePath}`]
    };
  }

  const source = readFileSync(sourcePath, "utf8");
  const parsed = core.parseAsciiDocTable(source);
  const grid = core.projectGridModel(parsed);
  const documentTables = core.findAsciiDocTableBlocks(source);
  const parserCells = parsed.rows.flatMap((row) => row.cells).map((cell) => ({
    rowSpan: cell.rowSpan,
    colSpan: cell.colSpan,
    style: normalizeParserStyle(cell.effectiveStyle ?? cell.style),
    blockContent: cell.isBlockContent
  }));
  const oracleCells = fixture.compareOracle === false ? [] : extractOracleCells(asciidoctor, source);
  const oracleTableFound = fixture.expectOracleTable === true ? hasOracleTable(asciidoctor, source) : false;
  const diagnostics = [...parsed.errors, ...grid.diagnostics].map((diagnostic) => ({
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message
  }));
  const failures = [];

  if (fixture.compareOracle !== false) {
    failures.push(...compareOracleCells(parserCells, oracleCells, { compareStyle: fixture.compareStyle !== false }));
  }

  if (fixture.expectNoGridDiagnostics === true && diagnostics.length > 0) {
    failures.push(`expected no diagnostics, got ${diagnostics.map((diagnostic) => diagnostic.code).join(", ")}`);
  }

  if (Array.isArray(fixture.expectGridDiagnosticCodes)) {
    const actualCodes = new Set(diagnostics.map((diagnostic) => diagnostic.code));
    for (const expectedCode of fixture.expectGridDiagnosticCodes) {
      if (!actualCodes.has(expectedCode)) {
        failures.push(`missing diagnostic ${expectedCode}`);
      }
    }
  }

  if (typeof fixture.expectParserCellCount === "number" && parserCells.length !== fixture.expectParserCellCount) {
    failures.push(`parser-cell-count ${parserCells.length} != ${fixture.expectParserCellCount}`);
  }

  if (typeof fixture.expectGridColumnCount === "number" && grid.columnCount !== fixture.expectGridColumnCount) {
    failures.push(`grid-column-count ${grid.columnCount} != ${fixture.expectGridColumnCount}`);
  }

  if (Array.isArray(fixture.expectRowRoles)) {
    const actualRoles = parsed.rows.map((row) => row.role);
    if (JSON.stringify(actualRoles) !== JSON.stringify(fixture.expectRowRoles)) {
      failures.push(`row-roles ${JSON.stringify(actualRoles)} != ${JSON.stringify(fixture.expectRowRoles)}`);
    }
  }

  if (Array.isArray(fixture.expectRawContains)) {
    for (const expectedRaw of fixture.expectRawContains) {
      if (!parsed.raw.includes(expectedRaw)) {
        failures.push(`raw does not contain ${JSON.stringify(expectedRaw)}`);
      }
    }
  }

  if (fixture.expectOracleTable === true && !oracleTableFound) {
    failures.push("oracle table was not found");
  }

  if (typeof fixture.expectBlockContentCells === "number") {
    const blockContentCount = parserCells.filter((cell) => cell.blockContent).length;
    if (blockContentCount !== fixture.expectBlockContentCells) {
      failures.push(`block-content-count ${blockContentCount} != ${fixture.expectBlockContentCells}`);
    }
  }

  if (typeof fixture.expectDocumentTableCount === "number" && documentTables.length !== fixture.expectDocumentTableCount) {
    failures.push(`document-table-count ${documentTables.length} != ${fixture.expectDocumentTableCount}`);
  }

  if (Array.isArray(fixture.expectDocumentTableRawContains)) {
    for (const expectedRaw of fixture.expectDocumentTableRawContains) {
      if (!documentTables.some((table) => table.raw.includes(expectedRaw))) {
        failures.push(`no detected document table contains ${JSON.stringify(expectedRaw)}`);
      }
    }
  }

  if (Array.isArray(fixture.expectDocumentTableRawExcludes)) {
    for (const excludedRaw of fixture.expectDocumentTableRawExcludes) {
      if (documentTables.some((table) => table.raw.includes(excludedRaw))) {
        failures.push(`detected document table contains excluded source ${JSON.stringify(excludedRaw)}`);
      }
    }
  }

  if (fixture.structuredEdit === true && diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    failures.push(`structured fixture has error diagnostics: ${diagnostics.map((diagnostic) => diagnostic.code).join(", ")}`);
  }

  return {
    fixtureId: fixture.id,
    category: fixture.category,
    source: fixture.source,
    status: fixture.status,
    structuredEdit: fixture.structuredEdit,
    checks: fixture.checks ?? [],
    parserCells,
    oracleCells,
    documentTableCount: documentTables.length,
    diagnostics,
    failures,
    passed: failures.length === 0
  };
}

function hasOracleTable(asciidoctor, source) {
  const document = asciidoctor.load(source, { sourcemap: true });
  return document.findBy({ context: "table" })[0] !== undefined;
}

function compareOracleCells(parserCells, oracleCells, options) {
  const failures = [];
  if (parserCells.length !== oracleCells.length) {
    failures.push(`cell-count ${parserCells.length} != ${oracleCells.length}`);
  }

  const length = Math.min(parserCells.length, oracleCells.length);
  for (let index = 0; index < length; index += 1) {
    const parserCell = parserCells[index];
    const oracleCell = oracleCells[index];
    const keys = options.compareStyle ? ["rowSpan", "colSpan", "style"] : ["rowSpan", "colSpan"];
    for (const key of keys) {
      if (parserCell[key] !== oracleCell[key]) {
        failures.push(`cell ${index} ${key} ${parserCell[key]} != ${oracleCell[key]}`);
      }
    }
  }
  return failures;
}

function extractOracleCells(asciidoctor, source) {
  const document = asciidoctor.load(source, { sourcemap: true });
  const table = document.findBy({ context: "table" })[0];
  if (table === undefined) {
    return [];
  }
  const rows = table.getRows();
  return ["head", "body", "foot"].flatMap((group) =>
    Array.from(rows[group] ?? []).flatMap((row) =>
      row.map((cell) => ({
        rowSpan: normalizeSpan(cell.getRowSpan?.() ?? cell.rowspan),
        colSpan: normalizeSpan(cell.getColumnSpan?.() ?? cell.colspan),
        style: normalizeOracleStyle(cell.getStyle?.() ?? cell.style)
      }))
    )
  );
}

function normalizeParserStyle(style) {
  return {
    a: "asciidoc",
    d: "none",
    e: "emphasis",
    h: "header",
    l: "literal",
    m: "monospaced",
    s: "strong"
  }[style] ?? style ?? "";
}

function normalizeOracleStyle(style) {
  return typeof style === "string" ? style : "";
}

function normalizeSpan(value) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  return 1;
}

function relativePath(path) {
  return path.startsWith(root) ? path.slice(root.length + 1) : path;
}

function renderSummary(summary) {
  return [
    "# Asciidoctor Compatibility",
    "",
    `- result: ${summary.passed ? "pass" : "fail"}`,
    `- generatedAt: ${summary.generatedAt}`,
    `- manifest: ${summary.manifest}`,
    "",
    "| Fixture | Category | Status | Structured | Result | Failures |",
    "| --- | --- | --- | --- | --- | --- |",
    ...summary.results.map(
      (result) =>
        `| ${result.fixtureId} | ${result.category ?? ""} | ${result.status} | ${String(result.structuredEdit)} | ${result.passed ? "pass" : "fail"} | ${result.failures.join("; ")} |`
    ),
    "",
    "Artifacts:",
    ...summary.results.map((result) => `- ${result.fixtureId}: ${dirname(result.source)}`),
    ""
  ].join("\n");
}
