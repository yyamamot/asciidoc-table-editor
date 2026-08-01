import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  emitNoopTable,
  parseAsciiDocTable,
  projectGridModel,
  replacePlainCellContent,
  replacePlainCellStyles,
  type GridModel,
  type LosslessTable,
  type SourceRange,
  type TableDiagnostic
} from "../../src/core";

const FIXTURE_ROOT = join(process.cwd(), "fixtures", "lossless");
const PROPERTY_SEED = 0x107c0de;
const PROPERTY_CASE_COUNT = 96;

describe("lossless fixture contract", () => {
  it.each(losslessFixtureIds())("enforces summary, no-op, diagnostics, ranges, and Grid invariants for %s", (fixtureId) => {
    const root = join(FIXTURE_ROOT, fixtureId);
    const source = readFileSync(join(root, "source.adoc"), "utf8");
    const summaryPath = join(root, "expect.lossless.summary.json");
    const noopPath = join(root, "expect.noop.adoc");

    expect(existsSync(noopPath), `${fixtureId}: missing expect.noop.adoc`).toBe(true);

    const table = parseAsciiDocTable(source);
    const grid = projectGridModel(table);
    expect(existsSync(summaryPath), `${fixtureId}: missing expect.lossless.summary.json`).toBe(true);
    const expectedSummary = JSON.parse(readFileSync(summaryPath, "utf8")) as unknown;
    const expectedNoop = readFileSync(noopPath, "utf8");
    const expectedDiagnostics = readExpectedDiagnostics(root);

    expect(expectedSummary).toEqual(compactLosslessSummary(table, grid));
    expect(expectedNoop).toBe(source);
    expect(emitNoopTable(table)).toBe(expectedNoop);
    expect(compactDiagnostics(grid.diagnostics)).toEqual(expectedDiagnostics);
    assertSourceOwnership(source, table);
    assertGridIntegrity(table, grid);
  });

  it("checks deterministic parser, projection, metamorphic, and write-back properties", () => {
    const cases = generatedCases(PROPERTY_SEED, PROPERTY_CASE_COUNT);
    for (const generated of cases) {
      try {
        assertGeneratedCase(generated);
      } catch (error) {
        const minimal = shrinkFailingCase(generated);
        throw new Error(
          `lossless property failed: seed=0x${PROPERTY_SEED.toString(16)} case=${generated.caseIndex}` +
          ` minimal=${JSON.stringify(minimal)} source=${JSON.stringify(renderGeneratedTable(minimal))}\n` +
          `${error instanceof Error ? error.stack ?? error.message : String(error)}`
        );
      }
    }
  });

  it.each(["malformed-unknown-cell-spec", "unsupported-csv"])(
    "keeps source unchanged when structured write-back is blocked for %s",
    (fixtureId) => {
      const source = readFileSync(join(FIXTURE_ROOT, fixtureId, "source.adoc"), "utf8");
      const result = replacePlainCellContent(parseAsciiDocTable(source), "cell:0:0", " Updated");

      expect(result.ok).toBe(false);
      expect(result.source).toBe(source);
    }
  );
});

function losslessFixtureIds(): string[] {
  return readdirSync(FIXTURE_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(FIXTURE_ROOT, entry.name, "source.adoc")))
    .map((entry) => entry.name)
    .sort();
}

function readExpectedDiagnostics(root: string): Array<{ code: string; severity: string }> {
  const path = join(root, "expect.diagnostics.json");
  if (!existsSync(path)) {
    return [];
  }
  const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
  expect(Array.isArray(value), `${path}: diagnostics expectation must be an array`).toBe(true);
  for (const entry of value as unknown[]) {
    expect(entry).toEqual({
      code: expect.any(String),
      severity: expect.stringMatching(/^(?:info|warning|error)$/u)
    });
  }
  return value as Array<{ code: string; severity: string }>;
}

function compactLosslessSummary(table: LosslessTable, grid: GridModel): unknown {
  const compactRange = (range: SourceRange): { start: number; end: number } => ({
    start: range.start.offset,
    end: range.end.offset
  });
  const compactDiagnostic = ({ code, severity }: TableDiagnostic): { code: string; severity: string } => ({ code, severity });
  const compactRetained = (segment: LosslessTable["retained"][number]): unknown => ({
    nodeId: segment.nodeId,
    kind: segment.kind,
    raw: segment.raw,
    range: compactRange(segment.range)
  });
  const ownerDiagnostics = [
    ...table.errors.map((diagnostic) => ({ owner: "table", ...compactDiagnostic(diagnostic) })),
    ...table.rows.flatMap((row) => [
      ...row.errors.map((diagnostic) => ({ owner: "row", nodeId: row.nodeId, ...compactDiagnostic(diagnostic) })),
      ...row.cells.flatMap((cell) =>
        cell.errors.map((diagnostic) => ({ owner: "cell", nodeId: cell.nodeId, ...compactDiagnostic(diagnostic) }))
      )
    ])
  ];
  const tokenKindsSeen = Array.from(new Set([
    table.kind,
    ...table.retained.map((segment) => segment.kind),
    ...table.rows.flatMap((row) => [row.kind, ...row.retained.map((segment) => segment.kind), ...row.cells.map((cell) => cell.kind)])
  ])).sort();

  return {
    schemaVersion: 1,
    table: {
      nodeId: table.nodeId,
      kind: table.kind,
      raw: table.raw,
      range: compactRange(table.range),
      delimiter: table.delimiter,
      attributes: {
        ...(table.attributes.columnCount === undefined ? {} : { columnCount: table.attributes.columnCount }),
        ...(table.attributes.format === undefined ? {} : { format: table.attributes.format }),
        ...(table.attributes.separator === undefined ? {} : { separator: table.attributes.separator }),
        options: table.attributes.options,
        columns: table.attributes.columns,
        lines: table.attributes.lines.map((line) => ({
          raw: line.raw,
          range: compactRange(line.range),
          entries: line.entries.map((entry) => ({
            kind: entry.kind,
            raw: entry.raw,
            range: compactRange(entry.range),
            ...(entry.name === undefined ? {} : { name: entry.name }),
            ...(entry.value === undefined ? {} : { value: entry.value }),
            ...(entry.valueRange === undefined ? {} : { valueRange: compactRange(entry.valueRange) }),
            ...(entry.quote === undefined ? {} : { quote: entry.quote })
          }))
        })),
        ...(table.attributes.title === undefined
          ? {}
          : {
              title: {
                raw: table.attributes.title.raw,
                text: table.attributes.title.text,
                range: compactRange(table.attributes.title.range),
                valueRange: compactRange(table.attributes.title.valueRange)
              }
            }),
        named: table.attributes.named
      }
    },
    rows: table.rows.map((row) => ({
      nodeId: row.nodeId,
      kind: row.kind,
      role: row.role,
      raw: row.raw,
      range: compactRange(row.range),
      cellOrder: row.cells.map((cell) => cell.nodeId),
      retained: row.retained.map(compactRetained),
      errors: row.errors.map(compactDiagnostic)
    })),
    cells: table.rows.flatMap((row) =>
      row.cells.map((cell) => ({
        nodeId: cell.nodeId,
        kind: cell.kind,
        raw: cell.raw,
        range: compactRange(cell.range),
        cellSpecRaw: cell.cellSpecRaw,
        delimiterRaw: cell.delimiterRaw,
        contentRaw: cell.contentRaw,
        ...(cell.duplicateCount === undefined ? {} : { duplicateCount: cell.duplicateCount }),
        ...(cell.duplicateIndex === undefined ? {} : { duplicateIndex: cell.duplicateIndex }),
        ...(cell.duplicateGroupId === undefined ? {} : { duplicateGroupId: cell.duplicateGroupId }),
        rowSpan: cell.rowSpan,
        colSpan: cell.colSpan,
        ...(cell.style === undefined ? {} : { style: cell.style }),
        ...(cell.horizontalAlign === undefined ? {} : { horizontalAlign: cell.horizontalAlign }),
        ...(cell.verticalAlign === undefined ? {} : { verticalAlign: cell.verticalAlign }),
        ...(cell.effectiveStyle === undefined ? {} : { effectiveStyle: cell.effectiveStyle }),
        ...(cell.effectiveHorizontalAlign === undefined ? {} : { effectiveHorizontalAlign: cell.effectiveHorizontalAlign }),
        ...(cell.effectiveVerticalAlign === undefined ? {} : { effectiveVerticalAlign: cell.effectiveVerticalAlign }),
        isBlockContent: cell.isBlockContent,
        errors: cell.errors.map(compactDiagnostic)
      }))
    ),
    retained: table.retained.map(compactRetained),
    ownerDiagnostics,
    tokenKindsSeen,
    grid: {
      rowCount: grid.rowCount,
      columnCount: grid.columnCount
    },
    projectable: !grid.diagnostics.some((diagnostic) => diagnostic.severity === "error")
  };
}

function compactDiagnostics(diagnostics: readonly TableDiagnostic[]): Array<{ code: string; severity: string }> {
  return diagnostics
    .map(({ code, severity }) => ({ code, severity }))
    .sort((left, right) => left.code.localeCompare(right.code) || left.severity.localeCompare(right.severity));
}

function assertSourceOwnership(source: string, table: LosslessTable): void {
  expect(table.raw).toBe(source);
  expect(source.slice(table.range.start.offset, table.range.end.offset)).toBe(table.raw);
  const nodeIds: string[] = [table.nodeId];

  if (table.attributes.title !== undefined) {
    assertOwnedSlice(source, table.attributes.title.range, table.attributes.title.raw);
  }
  for (const line of table.attributes.lines) {
    assertOwnedSlice(source, line.range, line.raw);
    for (const entry of line.entries) {
      assertOwnedSlice(source, entry.range, entry.raw);
    }
  }
  assertNonOverlapping([
    ...table.retained.map((segment) => segment.range),
    ...(table.attributes.title === undefined ? [] : [table.attributes.title.range]),
    ...table.attributes.lines.map((line) => line.range),
    ...table.rows.map((row) => row.range)
  ]);
  assertInSourceOrder(table.retained.map((segment) => segment.range));
  assertInSourceOrder(table.rows.map((row) => row.range));

  for (const row of table.rows) {
    nodeIds.push(row.nodeId, ...row.cells.map((cell) => cell.nodeId), ...row.retained.map((segment) => segment.nodeId));
    assertOwnedSlice(source, row.range, row.raw);
    for (const cell of row.cells.filter((candidate) => candidate.duplicateIndex === undefined || candidate.duplicateIndex === 0)) {
      assertOwnedSlice(source, cell.range, cell.raw);
    }
    for (const segment of row.retained) {
      assertOwnedSlice(source, segment.range, segment.raw);
    }
    assertNonOverlapping([
      ...row.retained.map((segment) => segment.range),
      ...row.cells
        .filter((cell) => cell.duplicateIndex === undefined || cell.duplicateIndex === 0)
        .map((cell) => cell.range)
    ]);
    assertInSourceOrder(row.retained.map((segment) => segment.range));
    assertInSourceOrder(
      row.cells
        .filter((cell) => cell.duplicateIndex === undefined || cell.duplicateIndex === 0)
        .map((cell) => cell.range)
    );
  }
  for (const segment of table.retained) {
    nodeIds.push(segment.nodeId);
    assertOwnedSlice(source, segment.range, segment.raw);
  }
  for (const diagnostic of [
    ...table.errors,
    ...table.rows.flatMap((row) => [...row.errors, ...row.cells.flatMap((cell) => cell.errors)])
  ]) {
    if (diagnostic.range !== undefined) assertRangePositions(source, diagnostic.range);
  }
  expect(new Set(nodeIds).size).toBe(nodeIds.length);
}

function assertOwnedSlice(source: string, range: SourceRange, raw: string): void {
  expect(Number.isInteger(range.start.offset)).toBe(true);
  expect(Number.isInteger(range.end.offset)).toBe(true);
  expect(range.start.offset).toBeGreaterThanOrEqual(0);
  expect(range.end.offset).toBeGreaterThanOrEqual(range.start.offset);
  expect(range.end.offset).toBeLessThanOrEqual(source.length);
  expect(source.slice(range.start.offset, range.end.offset)).toBe(raw);
  assertRangePositions(source, range);
}

function assertRangePositions(source: string, range: SourceRange): void {
  expect(range.start).toEqual(positionAtByPrefixScan(source, range.start.offset));
  expect(range.end).toEqual(positionAtByPrefixScan(source, range.end.offset));
}

function positionAtByPrefixScan(source: string, offset: number): { offset: number; line: number; column: number } {
  expect(Number.isInteger(offset)).toBe(true);
  expect(offset).toBeGreaterThanOrEqual(0);
  expect(offset).toBeLessThanOrEqual(source.length);
  let line = 0;
  let lineStart = 0;
  for (let index = 0; index < offset; index += 1) {
    if (source.charCodeAt(index) === 0x0a) {
      line += 1;
      lineStart = index + 1;
    }
  }
  return { offset, line, column: offset - lineStart };
}

function assertNonOverlapping(ranges: readonly SourceRange[]): void {
  const ordered = [...ranges].sort((left, right) => left.start.offset - right.start.offset || left.end.offset - right.end.offset);
  for (let index = 1; index < ordered.length; index += 1) {
    expect(ordered[index].start.offset).toBeGreaterThanOrEqual(ordered[index - 1].end.offset);
  }
}

function assertInSourceOrder(ranges: readonly SourceRange[]): void {
  for (let index = 1; index < ranges.length; index += 1) {
    expect(ranges[index].start.offset).toBeGreaterThanOrEqual(ranges[index - 1].end.offset);
  }
}

function assertGridIntegrity(table: LosslessTable, grid: GridModel): void {
  const origins = grid.cells.flat().filter((cell) => cell?.kind === "origin");
  const covered = grid.cells.flat().filter((cell) => cell?.kind === "covered");
  const sourceIds = new Set(table.rows.flatMap((row) => row.cells.map((cell) => cell.nodeId)));
  const originIds = new Set(origins.map((cell) => cell.sourceCellId));

  expect(grid.rowCount).toBeGreaterThanOrEqual(0);
  expect(grid.columnCount).toBeGreaterThanOrEqual(0);
  expect(Number.isFinite(grid.rowCount)).toBe(true);
  expect(Number.isFinite(grid.columnCount)).toBe(true);
  expect(grid.cells).toHaveLength(grid.rowCount);
  expect(origins).toHaveLength(originIds.size);
  for (const origin of origins) {
    expect(sourceIds.has(origin.sourceCellId)).toBe(true);
    expect(Number.isInteger(origin.row) && origin.row >= 0).toBe(true);
    expect(Number.isInteger(origin.col) && origin.col >= 0).toBe(true);
    expect(origin.rowSpan).toBeGreaterThan(0);
    expect(origin.colSpan).toBeGreaterThan(0);
    expect(origin.row + origin.rowSpan).toBeLessThanOrEqual(grid.rowCount);
    expect(origin.col + origin.colSpan).toBeLessThanOrEqual(grid.columnCount);
    for (let row = origin.row; row < origin.row + origin.rowSpan; row += 1) {
      for (let col = origin.col; col < origin.col + origin.colSpan; col += 1) {
        const projected = grid.cells[row]?.[col];
        if (row === origin.row && col === origin.col) {
          expect(projected).toBe(origin);
        } else {
          expect(projected).toMatchObject({
            kind: "covered",
            coveredBy: origin.cellId,
            sourceCellId: origin.sourceCellId,
            row,
            col
          });
        }
      }
    }
  }
  for (const cell of covered) {
    expect(originIds.has(cell.sourceCellId)).toBe(true);
    expect(origins.some((origin) => origin.cellId === cell.coveredBy)).toBe(true);
  }
  if (!grid.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    expect(originIds).toEqual(sourceIds);
  }
}

type GeneratedCase = {
  readonly caseIndex: number;
  readonly rows: number;
  readonly columns: number;
  readonly eol: "\n" | "\r\n";
  readonly finalNewline: boolean;
  readonly separator: "|" | "!" | "¦";
  readonly topology: "plain" | "horizontal" | "vertical" | "rectangular";
  readonly spec: "" | "m" | "^" | ".>s";
  readonly content: "ascii" | "unicode" | "emoji" | "escaped";
};

function generatedCases(seed: number, count: number): GeneratedCase[] {
  let state = seed >>> 0;
  const next = (): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
  const pick = <T>(values: readonly T[]): T => values[next() % values.length];
  return Array.from({ length: count }, (_, caseIndex) => ({
    caseIndex,
    rows: 1 + (next() % 4),
    columns: 1 + (next() % 4),
    eol: pick(["\n", "\r\n"] as const),
    finalNewline: (next() & 1) === 0,
    separator: pick(["|", "!", "¦"] as const),
    topology: pick(["plain", "horizontal", "vertical", "rectangular"] as const),
    spec: pick(["", "m", "^", ".>s"] as const),
    content: pick(["ascii", "unicode", "emoji", "escaped"] as const)
  }));
}

function renderGeneratedTable(input: GeneratedCase): string {
  const topology = normalizedTopology(input);
  const lines = [
    `[cols=${input.columns}*${input.separator === "|" ? "" : `,separator=${input.separator}`}]`,
    "|==="
  ];
  for (let row = 0; row < input.rows; row += 1) {
    const cells: string[] = [];
    for (let col = 0; col < input.columns; col += 1) {
      if (isCovered(topology, row, col)) {
        continue;
      }
      const span = row === 0 && col === 0
        ? topology === "horizontal" ? "2+" : topology === "vertical" ? ".2+" : topology === "rectangular" ? "2.2+" : ""
        : "";
      cells.push(`${span}${input.spec}${input.separator}${generatedContent(input, row, col)}`);
    }
    lines.push(cells.join(" "));
  }
  lines.push("|===");
  return `${lines.join(input.eol)}${input.finalNewline ? input.eol : ""}`;
}

function normalizedTopology(input: GeneratedCase): GeneratedCase["topology"] {
  if (input.topology === "horizontal" && input.columns < 2) return "plain";
  if (input.topology === "vertical" && (input.rows < 2 || input.columns < 2)) return "plain";
  if (input.topology === "rectangular" && (input.rows < 2 || input.columns < 3)) return "plain";
  return input.topology;
}

function isCovered(topology: GeneratedCase["topology"], row: number, col: number): boolean {
  if (row === 0 && col === 0) return false;
  if (topology === "horizontal") return row === 0 && col === 1;
  if (topology === "vertical") return row === 1 && col === 0;
  return topology === "rectangular" && row <= 1 && col <= 1;
}

function generatedContent(input: GeneratedCase, row: number, col: number): string {
  if (input.content === "unicode") return ` 日本語${row}${col}`;
  if (input.content === "emoji") return ` 🙂${row}${col}`;
  if (input.content === "escaped") return ` escaped \\${input.separator} ${row}${col}`;
  return ` R${row}C${col}`;
}

function assertGeneratedCase(input: GeneratedCase): void {
  const source = renderGeneratedTable(input);
  const table = parseAsciiDocTable(source);
  const grid = projectGridModel(table);
  expect(grid.diagnostics, `generated diagnostics for ${JSON.stringify(input)}`).toEqual([]);
  expect(emitNoopTable(table)).toBe(source);
  assertSourceOwnership(source, table);
  assertGridIntegrity(table, grid);

  const alternateEol = { ...input, eol: input.eol === "\n" ? "\r\n" as const : "\n" as const };
  const alternateSeparator = { ...input, separator: input.separator === "|" ? "!" as const : "|" as const };
  const unicodeContent = { ...input, content: input.content === "unicode" ? "emoji" as const : "unicode" as const };
  expect(gridTopology(projectGridModel(parseAsciiDocTable(renderGeneratedTable(alternateEol))))).toEqual(gridTopology(grid));
  expect(gridTopology(projectGridModel(parseAsciiDocTable(renderGeneratedTable(alternateSeparator))))).toEqual(gridTopology(grid));
  expect(gridTopology(projectGridModel(parseAsciiDocTable(renderGeneratedTable(unicodeContent))))).toEqual(gridTopology(grid));

  const target = grid.cells.flat().find((cell) => cell?.kind === "origin" && cell.editable);
  expect(target).toBeDefined();
  if (target === undefined || target.kind !== "origin") return;
  const targetCell = table.rows.flatMap((row) => row.cells).find((cell) => cell.nodeId === target.sourceCellId);
  expect(targetCell).toBeDefined();
  if (targetCell === undefined) return;

  const contentStart = targetCell.range.end.offset - targetCell.contentRaw.length;
  const replacement = ` Updated-${input.caseIndex}`;
  const contentResult = replacePlainCellContent(table, target.sourceCellId, replacement);
  expect(contentResult.ok).toBe(true);
  if (contentResult.ok) {
    expect(contentResult.diagnostics).toEqual([]);
    expect(contentResult.source.slice(0, contentStart)).toBe(source.slice(0, contentStart));
    expect(contentResult.source.slice(contentStart + replacement.length)).toBe(source.slice(targetCell.range.end.offset));
    const reparsed = parseAsciiDocTable(contentResult.source);
    expect(emitNoopTable(reparsed)).toBe(contentResult.source);
    expect(gridTopology(projectGridModel(reparsed))).toEqual(gridTopology(grid));
    expect(reparsed.rows.flatMap((row) => row.cells).find((cell) => cell.nodeId === target.sourceCellId)?.contentRaw).toBe(replacement);
  }

  const specEnd = targetCell.range.start.offset + targetCell.cellSpecRaw.length;
  const styleResult = replacePlainCellStyles(table, {
    sourceCellIds: [target.sourceCellId],
    style: "s",
    horizontalAlign: "center"
  });
  expect(styleResult.ok).toBe(true);
  if (styleResult.ok) {
    expect(styleResult.diagnostics).toEqual([]);
    expect(styleResult.source.slice(0, targetCell.range.start.offset)).toBe(source.slice(0, targetCell.range.start.offset));
    const reparsed = parseAsciiDocTable(styleResult.source);
    const styledCell = reparsed.rows.flatMap((row) => row.cells).find((cell) => cell.nodeId === target.sourceCellId);
    expect(styleResult.source.slice(targetCell.range.start.offset, targetCell.range.start.offset + styledCell!.cellSpecRaw.length)).toBe(styledCell!.cellSpecRaw);
    expect(styleResult.source.slice(targetCell.range.start.offset + styledCell!.cellSpecRaw.length)).toBe(source.slice(specEnd));
    expect(emitNoopTable(reparsed)).toBe(styleResult.source);
    expect(gridTopology(projectGridModel(reparsed))).toEqual(gridTopology(grid));
  }
}

function gridTopology(grid: GridModel): unknown {
  return {
    rowCount: grid.rowCount,
    columnCount: grid.columnCount,
    cells: grid.cells.map((row) => row.map((cell) => cell?.kind === "origin"
      ? { kind: cell.kind, row: cell.row, col: cell.col, rowSpan: cell.rowSpan, colSpan: cell.colSpan }
      : cell === undefined ? null : { kind: cell.kind, row: cell.row, col: cell.col }))
  };
}

function shrinkFailingCase(input: GeneratedCase): GeneratedCase {
  let current = input;
  const candidates: Array<(value: GeneratedCase) => GeneratedCase> = [
    (value) => ({ ...value, rows: 1 }),
    (value) => ({ ...value, columns: 1 }),
    (value) => ({ ...value, topology: "plain" }),
    (value) => ({ ...value, spec: "" }),
    (value) => ({ ...value, content: "ascii" }),
    (value) => ({ ...value, separator: "|" }),
    (value) => ({ ...value, eol: "\n" }),
    (value) => ({ ...value, finalNewline: false })
  ];
  for (const simplify of candidates) {
    const candidate = simplify(current);
    if (caseStillFails(candidate)) current = candidate;
  }
  return current;
}

function caseStillFails(input: GeneratedCase): boolean {
  try {
    assertGeneratedCase(input);
    return false;
  } catch {
    return true;
  }
}
