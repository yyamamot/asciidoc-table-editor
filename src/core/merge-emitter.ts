import { projectGridModel } from "./grid-model";
import { parseAsciiDocTable } from "./parser";
import type { GridCell, LosslessTable, LosslessTableCell, WriteBackResult } from "./types";
import type { HorizontalMergeRequest, UnmergeRequest } from "./emitter-types";
import {
  blocked,
  cellNotFoundDiagnostic,
  coveredRowInsertions,
  emptyCellsAfter,
  expandDuplicateShorthand,
  findCell,
  findGridOriginWithSourceCell,
  hasDuplicateShorthand,
  mergeRemoveRanges,
  removeSpanSpec,
  updateSpanSpec
} from "./emitter-utils";

export function mergePlainCellsHorizontally(table: LosslessTable, request: HorizontalMergeRequest): WriteBackResult {
  if (hasDuplicateShorthand(table)) {
    return mergePlainCellsHorizontally(parseAsciiDocTable(expandDuplicateShorthand(table)), request);
  }

  const sourceCellIds = [...new Set(request.sourceCellIds)];
  if (sourceCellIds.length < 2) {
    return blocked(table, {
      code: "writeback.merge-too-small",
      severity: "error",
      message: "At least two cells are required for horizontal merge"
    });
  }

  const grid = projectGridModel(table);
  const gridDiagnostic = grid.diagnostics.find((diagnostic) => diagnostic.severity === "error");
  if (gridDiagnostic !== undefined) {
    return blocked(table, {
      ...gridDiagnostic,
      code: "writeback.merge-unsafe-grid",
      message: "Merge target requires a source-safe table grid"
    });
  }

  const located = sourceCellIds.map((sourceCellId) => findGridOriginWithSourceCell(table, grid.cells, sourceCellId));
  const missingIndex = located.findIndex((entry) => entry === undefined);
  if (missingIndex >= 0) {
    const sourceCellId = sourceCellIds[missingIndex];
    return blocked(table, {
      code: "writeback.cell-not-found",
      severity: "error",
      message: `Cell ${sourceCellId} was not found`,
      nodeId: sourceCellId
    });
  }

  const entries = located as Array<{ row: number; col: number; gridCell: Extract<GridCell, { kind: "origin" }>; cell: LosslessTableCell }>;
  const sorted = [...entries].sort((left, right) => left.row - right.row || left.col - right.col);
  const top = Math.min(...sorted.map((entry) => entry.row));
  const bottom = Math.max(...sorted.map((entry) => entry.row + entry.gridCell.rowSpan - 1));
  const left = Math.min(...sorted.map((entry) => entry.col));
  const right = Math.max(...sorted.map((entry) => entry.col + entry.gridCell.colSpan - 1));
  const rowSpan = bottom - top + 1;
  const colSpan = right - left + 1;
  const selectedIds = new Set(sorted.map((entry) => entry.cell.nodeId));
  if (!selectedOriginsCoverRectangle(grid.cells, selectedIds, top, bottom, left, right)) {
    return blocked(table, {
      code: "writeback.merge-non-rectangular-span-set",
      severity: "error",
      message: "Merge target cells must form a contiguous rectangle"
    });
  }

  for (const entry of sorted) {
    const unsafeDiagnostic = getUnsafeMergeCellDiagnostic(entry.cell);
    if (unsafeDiagnostic !== undefined) {
      return blocked(table, unsafeDiagnostic);
    }
  }

  const originEntry = sorted.find((entry) => entry.row === top && entry.col === left);
  if (originEntry === undefined) {
    return blocked(table, {
      code: "writeback.merge-missing-top-left-origin",
      severity: "error",
      message: "Merge target must include the top-left origin cell"
    });
  }

  const origin = originEntry.cell;
  const removeRanges = mergeRemoveRanges(table, sorted.filter((entry) => entry.cell.nodeId !== origin.nodeId));
  const replacements = [
    ...removeRanges.map((replacement) => ({ ...replacement, text: "" })),
    {
      start: origin.range.start.offset,
      end: origin.range.start.offset + origin.cellSpecRaw.length,
      text: updateSpanSpec(origin.cellSpecRaw, rowSpan, colSpan)
    }
  ];
  const source = replacements
    .sort((left, right) => right.start - left.start)
    .reduce((current, replacement) => current.slice(0, replacement.start) + replacement.text + current.slice(replacement.end), table.raw);

  return {
    ok: true,
    source,
    diagnostics: []
  };
}

function selectedOriginsCoverRectangle(
  cells: GridCell[][],
  selectedIds: ReadonlySet<string>,
  top: number,
  bottom: number,
  left: number,
  right: number
): boolean {
  for (let row = top; row <= bottom; row += 1) {
    for (let col = left; col <= right; col += 1) {
      const cell = cells[row]?.[col];
      if (cell === undefined || !selectedIds.has(cell.sourceCellId)) {
        return false;
      }
    }
  }
  return true;
}

function getUnsafeMergeCellDiagnostic(cell: LosslessTableCell): WriteBackResult["diagnostics"][number] | undefined {
  if (cell.errors.length > 0) {
    return {
      code: "writeback.unsafe-cell-diagnostics",
      severity: "error",
      message: `Cell ${cell.nodeId} has diagnostics and cannot be patched safely`,
      nodeId: cell.nodeId
    };
  }

  if (cell.isBlockContent) {
    return {
      code: "writeback.unsafe-block-cell",
      severity: "error",
      message: `Block cell ${cell.nodeId} cannot be merged safely`,
      nodeId: cell.nodeId
    };
  }

  return undefined;
}

export function unmergePlainCellHorizontally(table: LosslessTable, request: UnmergeRequest): WriteBackResult {
  if (hasDuplicateShorthand(table)) {
    return unmergePlainCellHorizontally(parseAsciiDocTable(expandDuplicateShorthand(table)), request);
  }

  const cell = findCell(table, request.sourceCellId);
  if (cell === undefined) {
    return blocked(table, {
      code: "writeback.cell-not-found",
      severity: "error",
      message: `Cell ${request.sourceCellId} was not found`,
      nodeId: request.sourceCellId
    });
  }

  if (cell.errors.length > 0) {
    return blocked(table, {
      code: "writeback.unsafe-cell-diagnostics",
      severity: "error",
      message: `Cell ${cell.nodeId} has diagnostics and cannot be patched safely`,
      nodeId: cell.nodeId
    });
  }

  if (cell.colSpan <= 1 && cell.rowSpan <= 1) {
    return blocked(table, {
      code: "writeback.unmerge-not-spanned",
      severity: "error",
      message: `Cell ${cell.nodeId} is not merged`,
      nodeId: cell.nodeId
    });
  }

  const located = findGridOriginWithSourceCell(table, projectGridModel(table).cells, request.sourceCellId);
  if (located === undefined) {
    return blocked(table, cellNotFoundDiagnostic(request.sourceCellId));
  }

  const specWithoutSpan = removeSpanSpec(cell.cellSpecRaw);
  const originEmptyCells = emptyCellsAfter(table.delimiter.separator, cell.colSpan - 1);
  const replacements = [
    {
      start: cell.range.start.offset,
      end: cell.range.start.offset + cell.cellSpecRaw.length,
      text: specWithoutSpan
    },
    {
      start: cell.range.end.offset,
      end: cell.range.end.offset,
      text: originEmptyCells
    },
    ...coveredRowInsertions(table, located.row, located.col, cell.rowSpan, cell.colSpan)
  ];
  const source = replacements
    .sort((left, right) => right.start - left.start)
    .reduce((current, replacement) => current.slice(0, replacement.start) + replacement.text + current.slice(replacement.end), table.raw);

  return {
    ok: true,
    source,
    diagnostics: []
  };
}
