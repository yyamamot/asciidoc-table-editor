import { projectGridModel } from "./grid-model";
import { openDelimitedBlockDelimiter } from "./parser-blocks";
import { parseAsciiDocTable } from "./parser";
import type { GridCell, LosslessTable, LosslessTableCell, TableDiagnostic, WriteBackResult } from "./types";

export type CellReplacementTransition = "plain" | "block" | "plain-to-block";

export interface CellReplacementValidationRequest {
  readonly originalTable: LosslessTable;
  readonly workingTable: LosslessTable;
  readonly candidateSource: string;
  readonly targets: readonly {
    readonly rowOrdinal: number;
    readonly cellOrdinal: number;
    readonly expectedContentRaw: string;
    readonly transition: CellReplacementTransition;
  }[];
}

type PreparedContent = { readonly ok: true; readonly contentRaw: string } | { readonly ok: false; readonly diagnostic: TableDiagnostic };

export function preparePlainCellContent(table: LosslessTable, contentRaw: string): PreparedContent {
  if (/\r|\n/u.test(contentRaw)) {
    return unsafeContent("writeback.unsafe-plain-cell-content", "Plain cell content cannot contain a line break");
  }

  const separator = table.delimiter.separator;
  if (separator !== "|") {
    return contentRaw.includes(separator)
      ? unsafeContent("writeback.unsafe-plain-cell-content", `Plain cell content cannot contain custom separator ${separator}`)
      : { ok: true, contentRaw };
  }

  let escaped = "";
  for (let index = 0; index < contentRaw.length; index += 1) {
    const character = contentRaw[index];
    if (character === "|" && contentRaw[index - 1] !== "\\") {
      escaped += "\\";
    }
    escaped += character;
  }
  return { ok: true, contentRaw: escaped };
}

export function prepareBlockCellContent(table: LosslessTable, contentRaw: string): PreparedContent {
  const outerDelimiter = table.delimiter.startRaw.trim();
  if (contentRaw.split(/\r\n|\n|\r/u).some((line) => line.trim() === outerDelimiter)) {
    return unsafeContent("writeback.unsafe-block-cell-content", "Block cell content cannot contain the outer table delimiter");
  }
  if (openDelimitedBlockDelimiter(contentRaw) !== undefined) {
    return unsafeContent("writeback.unsafe-block-cell-content", "Block cell content contains an unclosed delimited block");
  }
  return { ok: true, contentRaw };
}

export function validateCellReplacement(request: CellReplacementValidationRequest): WriteBackResult {
  const candidate = parseAsciiDocTable(request.candidateSource);
  if (!sameTableStructure(request.workingTable, candidate, request.targets) ||
      !diagnosticsDoNotWorsen(request.workingTable, candidate)) {
    return validationFailed(request.originalTable);
  }
  return { ok: true, source: request.candidateSource, diagnostics: [] };
}

export function duplicateExpansionPreservesSemantics(original: LosslessTable, expanded: LosslessTable): boolean {
  const originalCells = flattenCells(original);
  const expandedCells = flattenCells(expanded);
  return originalCells.length === expandedCells.length && originalCells.every((cell, index) => {
    const candidate = expandedCells[index];
    return candidate !== undefined &&
      cell.style === candidate.style &&
      cell.horizontalAlign === candidate.horizontalAlign &&
      cell.verticalAlign === candidate.verticalAlign &&
      cell.effectiveStyle === candidate.effectiveStyle &&
      cell.effectiveHorizontalAlign === candidate.effectiveHorizontalAlign &&
      cell.effectiveVerticalAlign === candidate.effectiveVerticalAlign;
  });
}

function sameTableStructure(
  baseline: LosslessTable,
  candidate: LosslessTable,
  targets: CellReplacementValidationRequest["targets"]
): boolean {
  if (baseline.delimiter.startRaw !== candidate.delimiter.startRaw ||
      baseline.delimiter.endRaw !== candidate.delimiter.endRaw ||
      baseline.delimiter.separator !== candidate.delimiter.separator ||
      attributeSignature(baseline) !== attributeSignature(candidate) ||
      retainedSignature(baseline.retained) !== retainedSignature(candidate.retained)) {
    return false;
  }

  if (baseline.rows.length !== candidate.rows.length) {
    return false;
  }

  const targetMap = new Map(targets.map((target) => [`${target.rowOrdinal}:${target.cellOrdinal}`, target]));
  for (let rowOrdinal = 0; rowOrdinal < baseline.rows.length; rowOrdinal += 1) {
    const baselineRow = baseline.rows[rowOrdinal];
    const candidateRow = candidate.rows[rowOrdinal];
    if (candidateRow === undefined || baselineRow.role !== candidateRow.role ||
        baselineRow.cells.length !== candidateRow.cells.length ||
        retainedSignature(baselineRow.retained) !== retainedSignature(candidateRow.retained)) {
      return false;
    }
    for (let cellOrdinal = 0; cellOrdinal < baselineRow.cells.length; cellOrdinal += 1) {
      const baselineCell = baselineRow.cells[cellOrdinal];
      const candidateCell = candidateRow.cells[cellOrdinal];
      const target = targetMap.get(`${rowOrdinal}:${cellOrdinal}`);
      if (candidateCell === undefined || !sameCellStructure(baselineCell, candidateCell, target?.transition)) {
        return false;
      }
      if (target === undefined ? baselineCell.contentRaw !== candidateCell.contentRaw : target.expectedContentRaw !== candidateCell.contentRaw) {
        return false;
      }
    }
  }

  if (targetMap.size !== targets.length || targets.some((target) => baseline.rows[target.rowOrdinal]?.cells[target.cellOrdinal] === undefined)) {
    return false;
  }
  return sameGridStructure(baseline, candidate, targetMap);
}

function sameCellStructure(
  baseline: LosslessTableCell,
  candidate: LosslessTableCell,
  transition: CellReplacementTransition | undefined
): boolean {
  const plainToBlock = transition === "plain-to-block";
  return candidate.cellSpecRaw === (plainToBlock ? "a" : baseline.cellSpecRaw) &&
    candidate.delimiterRaw === baseline.delimiterRaw &&
    candidate.rowSpan === baseline.rowSpan &&
    candidate.colSpan === baseline.colSpan &&
    candidate.style === (plainToBlock ? "a" : baseline.style) &&
    candidate.horizontalAlign === baseline.horizontalAlign &&
    candidate.verticalAlign === baseline.verticalAlign &&
    candidate.effectiveStyle === (plainToBlock ? "a" : baseline.effectiveStyle) &&
    candidate.effectiveHorizontalAlign === baseline.effectiveHorizontalAlign &&
    candidate.effectiveVerticalAlign === baseline.effectiveVerticalAlign &&
    candidate.isBlockContent === (plainToBlock ? true : baseline.isBlockContent) &&
    (candidate.duplicateCount ?? 1) === (baseline.duplicateCount ?? 1);
}

function sameGridStructure(
  baselineTable: LosslessTable,
  candidateTable: LosslessTable,
  targets: ReadonlyMap<string, CellReplacementValidationRequest["targets"][number]>
): boolean {
  const baseline = projectGridModel(baselineTable);
  const candidate = projectGridModel(candidateTable);
  if (baseline.rowCount !== candidate.rowCount || baseline.columnCount !== candidate.columnCount || baseline.cells.length !== candidate.cells.length) {
    return false;
  }
  for (let row = 0; row < baseline.cells.length; row += 1) {
    if ((baseline.cells[row]?.length ?? 0) !== (candidate.cells[row]?.length ?? 0)) {
      return false;
    }
    for (let col = 0; col < (baseline.cells[row]?.length ?? 0); col += 1) {
      const baselineCell = baseline.cells[row][col];
      const candidateCell = candidate.cells[row][col];
      const sourceOrdinal = candidateCell === undefined ? undefined : sourceCellOrdinal(candidateTable, candidateCell.sourceCellId);
      const transition = sourceOrdinal === undefined ? undefined : targets.get(sourceOrdinal)?.transition;
      if (!sameGridCell(baselineCell, candidateCell, baselineTable, candidateTable, transition)) {
        return false;
      }
    }
  }
  return true;
}

function sameGridCell(
  baseline: GridCell | undefined,
  candidate: GridCell | undefined,
  baselineTable: LosslessTable,
  candidateTable: LosslessTable,
  transition: CellReplacementTransition | undefined
): boolean {
  if (baseline === undefined || candidate === undefined || baseline.kind !== candidate.kind) {
    return baseline === candidate;
  }
  const baselineOrdinal = sourceCellOrdinal(baselineTable, baseline.sourceCellId);
  const candidateOrdinal = sourceCellOrdinal(candidateTable, candidate.sourceCellId);
  if (baselineOrdinal !== candidateOrdinal || baseline.row !== candidate.row || baseline.col !== candidate.col) {
    return false;
  }
  if (baseline.kind === "covered" || candidate.kind === "covered") {
    return baseline.kind === "covered" && candidate.kind === "covered";
  }
  const plainToBlock = transition === "plain-to-block";
  return baseline.rowSpan === candidate.rowSpan && baseline.colSpan === candidate.colSpan && baseline.role === candidate.role &&
    candidate.style === (plainToBlock ? "a" : baseline.style) &&
    candidate.horizontalAlign === baseline.horizontalAlign && candidate.verticalAlign === baseline.verticalAlign &&
    candidate.blockContent === (plainToBlock ? true : baseline.blockContent);
}

function diagnosticsDoNotWorsen(baseline: LosslessTable, candidate: LosslessTable): boolean {
  const baselineGroups = diagnosticGroups(baseline);
  const candidateGroups = diagnosticGroups(candidate);
  for (const [key, candidateCount] of candidateGroups) {
    if (candidateCount > (baselineGroups.get(key) ?? 0)) {
      return false;
    }
  }
  return true;
}

function diagnosticGroups(table: LosslessTable): Map<string, number> {
  const groups = new Map<string, number>();
  const add = (layer: string, ordinal: string, diagnostic: TableDiagnostic) => {
    const key = `${layer}:${ordinal}:${diagnostic.code}:${diagnostic.severity}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  };
  table.errors.forEach((diagnostic) => add("parser", "table", diagnostic));
  table.rows.forEach((row, rowOrdinal) => {
    row.errors.forEach((diagnostic) => add("parser", `row:${rowOrdinal}`, diagnostic));
    row.cells.forEach((cell, cellOrdinal) => {
      cell.errors.forEach((diagnostic) => add("cell", `${rowOrdinal}:${cellOrdinal}`, diagnostic));
    });
  });
  projectGridModel(table).diagnostics.forEach((diagnostic) => {
    add("grid", diagnostic.nodeId === undefined ? "table" : sourceCellOrdinal(table, diagnostic.nodeId), diagnostic);
  });
  return groups;
}

function attributeSignature(table: LosslessTable): string {
  const attributes = table.attributes;
  return JSON.stringify({
    columnCount: attributes.columnCount,
    format: attributes.format,
    separator: attributes.separator,
    options: attributes.options,
    columns: attributes.columns.map(({ index, raw, widthRaw, horizontalAlign, verticalAlign, style }) => ({
      index, raw, widthRaw, horizontalAlign, verticalAlign, style
    })),
    lines: attributes.lines.map((line) => ({
      raw: line.raw,
      entries: line.entries.map(({ kind, raw, name, value, quote }) => ({ kind, raw, name, value, quote }))
    })),
    entries: attributes.entries.map(({ kind, raw, name, value, quote }) => ({ kind, raw, name, value, quote })),
    title: attributes.title === undefined ? undefined : { raw: attributes.title.raw, text: attributes.title.text },
    named: attributes.named
  });
}

function retainedSignature(retained: LosslessTable["retained"]): string {
  return JSON.stringify(retained.map(({ kind, raw }) => ({ kind, raw })));
}

function flattenCells(table: LosslessTable): LosslessTableCell[] {
  return table.rows.flatMap((row) => row.cells);
}

function sourceCellOrdinal(table: LosslessTable, nodeId: string): string {
  for (let row = 0; row < table.rows.length; row += 1) {
    const cell = table.rows[row].cells.findIndex((candidate) => candidate.nodeId === nodeId);
    if (cell >= 0) {
      return `${row}:${cell}`;
    }
  }
  return "unscoped";
}

function unsafeContent(code: string, message: string): PreparedContent {
  return { ok: false, diagnostic: { code, severity: "error", message } };
}

function validationFailed(table: LosslessTable): WriteBackResult {
  return {
    ok: false,
    source: table.raw,
    diagnostics: [{
      code: "writeback.cell-replacement-validation-failed",
      severity: "error",
      message: "Cell replacement would change the table source structure"
    }]
  };
}
