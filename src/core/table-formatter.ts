import { parseAsciiDocTable } from "./parser";
import type { LosslessTable, LosslessTableCell, LosslessTableRow, TableDiagnostic } from "./types";
import { projectGridModel } from "./grid-model";
import { countTableDelimiterLines, hasTableDelimiterLine } from "./table-delimiter";

export type TableFormatMode = "table-layout" | "cell-per-line";

export interface TableFormatOptions {
  readonly mode?: TableFormatMode;
}

export interface TableFormatSummary {
  readonly mode: TableFormatMode;
  readonly changedLineCount: number;
  readonly formattedRowCount: number;
  readonly preservedRowCount: number;
}

export type TableFormatResult =
  | {
      readonly ok: true;
      readonly mode: TableFormatMode;
      readonly source: string;
      readonly changed: boolean;
      readonly summary: TableFormatSummary;
      readonly diagnostics: readonly TableDiagnostic[];
    }
  | {
      readonly ok: false;
      readonly mode: TableFormatMode;
      readonly source: string;
      readonly diagnostics: readonly TableDiagnostic[];
    };

interface Replacement {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

interface SourceLine {
  readonly offset: number;
  readonly text: string;
  readonly ending: string;
}

const CELL_PER_LINE_WIDTH_THRESHOLD = 36;

export function recommendedTableFormatMode(table: LosslessTable): TableFormatMode {
  const grid = projectGridModel(table);
  if (grid.columnCount >= 4) {
    return "cell-per-line";
  }

  for (const row of table.rows) {
    for (const cell of sourceCells(row)) {
      const content = cell.contentRaw.trim();
      if (cell.isBlockContent || content.includes("\n")) {
        return "cell-per-line";
      }
      if (content.length >= CELL_PER_LINE_WIDTH_THRESHOLD) {
        return "cell-per-line";
      }
      if (/https?:\/\/|mailto:/u.test(content)) {
        return "cell-per-line";
      }
    }
  }

  return "table-layout";
}

export function formatAsciiDocTable(
  table: LosslessTable,
  options: TableFormatOptions = {},
): TableFormatResult {
  const mode = options.mode ?? "table-layout";
  const safetyDiagnostics = collectFormatSafetyDiagnostics(table);
  if (safetyDiagnostics.length > 0) {
    return {
      ok: false,
      mode,
      source: table.raw,
      diagnostics: safetyDiagnostics,
    };
  }

  if (mode === "cell-per-line") {
    return formatCellPerLineTable(table);
  }
  return formatTableLayout(table);
}

function formatTableLayout(table: LosslessTable): TableFormatResult {
  const lineEnding = detectLineEnding(table.raw);
  const widths = formatColumnWidths(table);
  const replacements: Replacement[] = [];
  let formattedRowCount = 0;
  let preservedRowCount = 0;

  for (const row of table.rows) {
    if (shouldPreserveRowRaw(row)) {
      preservedRowCount += 1;
      continue;
    }

    const formatted = formatRowAsTableLayout(row, widths, lineEnding);
    if (formatted === undefined) {
      preservedRowCount += 1;
      continue;
    }

    formattedRowCount += 1;
    if (formatted !== row.raw) {
      replacements.push({
        start: row.range.start.offset,
        end: row.range.end.offset,
        text: formatted,
      });
    }
  }
  replacements.push(...blankInterRowGapReplacements(table.rows, table.raw));

  const source = applyReplacements(table.raw, replacements);
  return {
    ok: true,
    mode: "table-layout",
    source,
    changed: source !== table.raw,
    summary: {
      mode: "table-layout",
      changedLineCount: countChangedLines(table.raw, source),
      formattedRowCount,
      preservedRowCount,
    },
    diagnostics: [],
  };
}

function formatCellPerLineTable(table: LosslessTable): TableFormatResult {
  const replacements: Replacement[] = [];
  const columnCount = logicalColumnCount(table);
  const colsResult = ensureColumnCountAttribute(table.raw, columnCount, table.delimiter.startRaw);
  if (!colsResult.ok) {
    return {
      ok: false,
      mode: "cell-per-line",
      source: table.raw,
      diagnostics: colsResult.diagnostics,
    };
  }
  replacements.push(...colsResult.replacements);

  const layoutResult = planCellPerLineLayout(table);
  if (!layoutResult.ok) {
    return {
      ok: false,
      mode: "cell-per-line",
      source: table.raw,
      diagnostics: layoutResult.diagnostics,
    };
  }
  replacements.push(...layoutResult.replacements);

  if (!isValidReplacementPlan(table.raw, replacements)) {
    return {
      ok: false,
      mode: "cell-per-line",
      source: table.raw,
      diagnostics: [unsafeBlockCellSourceDiagnostic()],
    };
  }

  const source = applyReplacements(table.raw, replacements);
  return {
    ok: true,
    mode: "cell-per-line",
    source,
    changed: source !== table.raw,
    summary: {
      mode: "cell-per-line",
      changedLineCount: countChangedLines(table.raw, source),
      formattedRowCount: table.rows.length,
      preservedRowCount: 0,
    },
    diagnostics: [],
  };
}

function planCellPerLineLayout(
  table: LosslessTable,
):
  | { readonly ok: true; readonly replacements: readonly Replacement[] }
  | { readonly ok: false; readonly diagnostics: readonly TableDiagnostic[] } {
  const rows = table.rows
    .map((row) => ({ row, cells: sourceCells(row) }))
    .filter((entry) => entry.cells.length > 0);
  const firstCell = rows[0]?.cells[0];
  const lastCells = rows[rows.length - 1]?.cells;
  const lastCell = lastCells?.[lastCells.length - 1];

  if (firstCell !== undefined && lastCell !== undefined) {
    const unsafeRetained = [
      ...table.retained.filter(
        (segment) =>
          isUnsafeMovableRetainedSegment(segment.kind) &&
          segment.range.start.offset < lastCell.range.end.offset &&
          segment.range.end.offset > firstCell.range.start.offset,
      ),
      ...rows.flatMap(({ row }) =>
        row.retained.filter((segment) => isUnsafeMovableRetainedSegment(segment.kind)),
      ),
    ];
    if (unsafeRetained.length > 0) {
      return {
        ok: false,
        diagnostics: [
          {
            code: "format.unsafe-retained-content",
            severity: "error",
            message: "Formatter is blocked because retained comment or unknown content cannot be safely moved.",
          },
        ],
      };
    }
  }

  for (const { cells } of rows) {
    for (const cell of cells) {
      if (!shouldPreserveCellSource(cell)) {
        continue;
      }
      const sourceSlice = table.raw.slice(cell.range.start.offset, cell.range.end.offset);
      const canonicalRaw = `${cell.cellSpecRaw}${cell.delimiterRaw}${cell.contentRaw}`;
      if (sourceSlice !== cell.raw || cell.raw !== canonicalRaw) {
        return {
          ok: false,
          diagnostics: [unsafeBlockCellSourceDiagnostic()],
        };
      }
    }
  }

  const replacements: Replacement[] = [];
  for (const { cells } of rows) {
    for (const cell of cells) {
      if (shouldPreserveCellSource(cell)) {
        continue;
      }
      const formatted = formatCellAsStandaloneLine(cell);
      if (formatted !== cell.raw) {
        replacements.push({
          start: cell.range.start.offset,
          end: cell.range.end.offset,
          text: formatted,
        });
      }
    }

    for (let index = 1; index < cells.length; index += 1) {
      replacements.push(planCellBoundary(table.raw, cells[index - 1], cells[index], 1));
    }
  }

  for (let index = 1; index < rows.length; index += 1) {
    const previousCells = rows[index - 1].cells;
    const currentCells = rows[index].cells;
    replacements.push(
      planCellBoundary(
        table.raw,
        previousCells[previousCells.length - 1],
        currentCells[0],
        2,
      ),
    );
  }

  return { ok: true, replacements };
}

function planCellBoundary(
  source: string,
  previous: LosslessTableCell,
  current: LosslessTableCell,
  lineEndingCount: number,
): Replacement {
  const start = previous.range.end.offset;
  const end = current.range.start.offset;
  const lineEnding = resolveLineEndingAt(source, start);
  const previousRaw = source.slice(previous.range.start.offset, previous.range.end.offset);
  const trailingEndingCount = countTrailingLineEndings(previousRaw);
  const text = lineEnding.repeat(Math.max(0, lineEndingCount - trailingEndingCount));
  return { start, end, text };
}

function countTrailingLineEndings(source: string): number {
  let count = 0;
  let end = source.length;
  while (end > 0) {
    const match = source.slice(0, end).match(/(?:\r\n|\n|\r)$/u);
    if (match === null) {
      break;
    }
    count += 1;
    end -= match[0].length;
  }
  return count;
}

function shouldPreserveCellSource(cell: LosslessTableCell): boolean {
  return cell.isBlockContent || /\r\n|\n|\r/u.test(cell.contentRaw);
}

function isUnsafeMovableRetainedSegment(kind: string): boolean {
  return kind === "comment" || kind === "unknown";
}

function unsafeBlockCellSourceDiagnostic(): TableDiagnostic {
  return {
    code: "format.unsafe-block-cell-source",
    severity: "error",
    message: "Formatter is blocked because a block or multiline cell does not match its canonical source slice.",
  };
}

function collectFormatSafetyDiagnostics(table: LosslessTable): readonly TableDiagnostic[] {
  const diagnostics: TableDiagnostic[] = [];
  diagnostics.push(...table.errors);

  if (table.attributes.format !== undefined && table.attributes.format !== "psv") {
    diagnostics.push({
      code: "format.unsupported-data-table",
      severity: "error",
      message: "Formatter supports only pipe-separated AsciiDoc tables.",
    });
  }

  if (countTableDelimiterLines(table.raw) > 2) {
    diagnostics.push({
      code: "format.nested-table",
      severity: "error",
      message: "Formatter is blocked because this table may contain a nested table.",
    });
  }

  const grid = projectGridModel(table);
  diagnostics.push(...grid.diagnostics);

  for (const row of table.rows) {
    for (const cell of row.cells) {
      diagnostics.push(...cell.errors);
      if (cell.isBlockContent && hasTableDelimiterLine(cell.contentRaw)) {
        diagnostics.push({
          code: "format.block-nested-table",
          severity: "error",
          message: "Formatter is blocked because a block cell contains a nested table.",
        });
      }
    }
  }

  return dedupeDiagnostics(diagnostics);
}

function formatColumnWidths(table: LosslessTable): readonly number[] {
  const grid = projectGridModel(table);
  const widths = Array.from({ length: Math.max(0, grid.columnCount) }, () => 0);
  for (const row of table.rows) {
    let colIndex = 0;
    for (const cell of sourceCells(row)) {
      if (cell.isBlockContent || cell.rowSpan > 1 || cell.colSpan > 1 || cell.contentRaw.includes("\n")) {
        colIndex += Math.max(1, cell.colSpan) * Math.max(1, cell.duplicateCount ?? 1);
        continue;
      }
      const content = cell.contentRaw.trim();
      const width = cell.cellSpecRaw.length + 1 + (content.length > 0 ? 1 + content.length : 0);
      const col = Math.max(0, colIndex);
      if (col < widths.length) {
        widths[col] = Math.max(widths[col], width);
      }
      colIndex += Math.max(1, cell.colSpan) * Math.max(1, cell.duplicateCount ?? 1);
    }
  }
  return widths;
}

function shouldPreserveRowRaw(row: LosslessTableRow): boolean {
  return row.cells.some(
    (cell) =>
      (cell.duplicateIndex ?? 0) > 0 ||
      cell.isBlockContent ||
      cell.contentRaw.includes("\n") ||
      cell.rowSpan > 1 ||
      cell.colSpan > 1,
  );
}

function formatRowAsTableLayout(
  row: LosslessTableRow,
  widths: readonly number[],
  fallbackLineEnding: string,
): string | undefined {
  const cells = sourceCells(row);
  if (cells.length === 0) {
    return undefined;
  }

  const rowEnding = detectLineEnding(row.raw) || fallbackLineEnding;
  let colIndex = 0;
  const parts = cells.map((cell, index) => {
    const content = cell.contentRaw.trim();
    const rendered = `${cell.cellSpecRaw}|${content.length > 0 ? ` ${content}` : ""}`;
    const currentColIndex = colIndex;
    colIndex += Math.max(1, cell.colSpan) * Math.max(1, cell.duplicateCount ?? 1);
    if (index === cells.length - 1) {
      return rendered;
    }
    const targetWidth = widths[currentColIndex] ?? rendered.length;
    return rendered.padEnd(Math.max(rendered.length, targetWidth), " ");
  });
  return `${parts.join(" ")}${rowEnding}`;
}

function formatCellAsStandaloneLine(cell: LosslessTableCell): string {
  const content = cell.contentRaw.trim();
  return `${cell.cellSpecRaw}${cell.delimiterRaw}${content.length > 0 ? ` ${content}` : ""}`;
}

function blankInterRowGapReplacements(rows: readonly LosslessTableRow[], source: string): readonly Replacement[] {
  const replacements: Replacement[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    const gap = source.slice(previous.range.end.offset, current.range.start.offset);
    if (gap.length > 0 && gap.trim() === "") {
      replacements.push({
        start: previous.range.end.offset,
        end: current.range.start.offset,
        text: ""
      });
    }
  }
  return replacements;
}

function sourceCells(row: LosslessTableRow): readonly LosslessTableCell[] {
  return row.cells.filter((cell) => (cell.duplicateIndex ?? 0) === 0);
}

function logicalColumnCount(table: LosslessTable): number {
  const grid = projectGridModel(table);
  if (grid.columnCount > 0) {
    return grid.columnCount;
  }
  return Math.max(
    table.attributes.columnCount ?? 0,
    ...table.rows.map((row) =>
      sourceCells(row).reduce((count, cell) => count + Math.max(1, cell.colSpan) * Math.max(1, cell.duplicateCount ?? 1), 0),
    ),
    1,
  );
}

function ensureColumnCountAttribute(
  source: string,
  columnCount: number,
  delimiterRaw: string,
): { readonly ok: true; readonly replacements: readonly Replacement[] } | { readonly ok: false; readonly diagnostics: readonly TableDiagnostic[] } {
  const lines = splitLines(source);
  const delimiterLineIndex = lines.findIndex((line) => line.text.trim() === delimiterRaw);
  if (delimiterLineIndex < 0) {
    return {
      ok: false,
      diagnostics: [
        {
          code: "format.table-delimiter-not-found",
          severity: "error",
          message: "Formatter could not find the table delimiter.",
        },
      ],
    };
  }

  const attributeLine = findTableAttributeLine(lines, delimiterLineIndex);
  if (attributeLine === undefined) {
    const insertionOffset = lines[delimiterLineIndex].offset;
    return {
      ok: true,
      replacements: [
        {
          start: insertionOffset,
          end: insertionOffset,
          text: `[cols=${columnCount}*]${resolveLineEndingAt(source, insertionOffset)}`,
        },
      ],
    };
  }

  const text = attributeLine.text;
  const content = text.slice(1, -1).trim();
  let updated: string;
  if (/\bcols\s*=/u.test(content)) {
    updated = text.replace(/\bcols\s*=\s*(?:"[^"]*"|'[^']*'|[^,\]]+)/u, `cols=${columnCount}*`);
  } else {
    updated = `[cols=${columnCount}*${content.length > 0 ? `,${content}` : ""}]`;
  }

  if (updated === text) {
    return { ok: true, replacements: [] };
  }

  return {
    ok: true,
    replacements: [
      {
        start: attributeLine.offset,
        end: attributeLine.offset + attributeLine.text.length,
        text: updated,
      },
    ],
  };
}

function splitLines(source: string): readonly SourceLine[] {
  const lines: SourceLine[] = [];
  const pattern = /(.*?)(\r\n|\n|\r|$)/gu;
  let offset = 0;
  for (const match of source.matchAll(pattern)) {
    const text = match[1] ?? "";
    const ending = match[2] ?? "";
    if (text.length === 0 && ending.length === 0) {
      break;
    }
    lines.push({ offset, text, ending });
    offset += text.length + ending.length;
  }
  return lines;
}

function findTableAttributeLine(lines: readonly SourceLine[], delimiterLineIndex: number): SourceLine | undefined {
  for (let index = delimiterLineIndex - 1; index >= 0; index -= 1) {
    const text = lines[index].text.trim();
    if (text.length === 0 || text.startsWith(".")) {
      continue;
    }
    if (text.startsWith("[") && text.endsWith("]")) {
      return lines[index];
    }
    return undefined;
  }
  return undefined;
}

function applyReplacements(source: string, replacements: readonly Replacement[]): string {
  return [...replacements]
    .sort((left, right) => right.start - left.start)
    .reduce((current, replacement) => {
      return `${current.slice(0, replacement.start)}${replacement.text}${current.slice(replacement.end)}`;
    }, source);
}

function isValidReplacementPlan(source: string, replacements: readonly Replacement[]): boolean {
  const sorted = [...replacements].sort((left, right) => left.start - right.start || left.end - right.end);
  let previousEnd = 0;
  for (const replacement of sorted) {
    if (
      !Number.isInteger(replacement.start) ||
      !Number.isInteger(replacement.end) ||
      replacement.start < 0 ||
      replacement.end < replacement.start ||
      replacement.end > source.length ||
      replacement.start < previousEnd
    ) {
      return false;
    }
    previousEnd = replacement.end;
  }
  return true;
}

function countChangedLines(before: string, after: string): number {
  if (before === after) {
    return 0;
  }
  const beforeLines = before.split(/\r\n|\n|\r/u);
  const afterLines = after.split(/\r\n|\n|\r/u);
  const max = Math.max(beforeLines.length, afterLines.length);
  let changed = 0;
  for (let index = 0; index < max; index += 1) {
    if (beforeLines[index] !== afterLines[index]) {
      changed += 1;
    }
  }
  return changed;
}

function detectLineEnding(source: string): string {
  const match = source.match(/\r\n|\n|\r/u);
  return match?.[0] ?? "\n";
}

function resolveLineEndingAt(source: string, offset: number): string {
  const boundedOffset = Math.max(0, Math.min(source.length, offset));
  const before = source.slice(0, boundedOffset);
  const previous = [...before.matchAll(/\r\n|\n|\r/gu)].at(-1)?.[0];
  if (previous !== undefined) {
    return previous;
  }
  return source.slice(boundedOffset).match(/\r\n|\n|\r/u)?.[0] ?? "\n";
}

function dedupeDiagnostics(diagnostics: readonly TableDiagnostic[]): readonly TableDiagnostic[] {
  const seen = new Set<string>();
  const result: TableDiagnostic[] = [];
  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.code}:${diagnostic.message}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(diagnostic);
  }
  return result;
}

export function formatAsciiDocTableSource(source: string, options: TableFormatOptions = {}): TableFormatResult {
  return formatAsciiDocTable(parseAsciiDocTable(source), options);
}
