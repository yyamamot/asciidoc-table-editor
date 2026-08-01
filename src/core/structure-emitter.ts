import { projectGridModel } from "./grid-model";
import { parseAsciiDocTable } from "./parser";
import { planColumnMetadataEdit } from "./column-structure";
import type { GridCell, LosslessTable, LosslessTableCell, WriteBackResult } from "./types";
import type { RowColumnEditRequest } from "./emitter-types";
import {
  applyReplacements,
  blocked,
  cellNotFoundDiagnostic,
  columnDeleteRange,
  emptyRowSource,
  expandDuplicateShorthand,
  findCell,
  findCellWithRow,
  getUnsafeSpanAwareTableStructureDiagnostic,
  hasDuplicateShorthand,
  updateSpanSpec
} from "./emitter-utils";

export function insertPlainRowAfter(table: LosslessTable, request: RowColumnEditRequest): WriteBackResult {
  return insertPlainRow(table, request, "after");
}

export function insertPlainRowBefore(table: LosslessTable, request: RowColumnEditRequest): WriteBackResult {
  return insertPlainRow(table, request, "before");
}

function insertPlainRow(table: LosslessTable, request: RowColumnEditRequest, position: "before" | "after"): WriteBackResult {
  if (hasDuplicateShorthand(table)) {
    return insertPlainRow(parseAsciiDocTable(expandDuplicateShorthand(table)), request, position);
  }

  const located = findCellWithRow(table, request.sourceCellId);
  if (located === undefined) {
    return blocked(table, cellNotFoundDiagnostic(request.sourceCellId));
  }

  const safeDiagnostic = getUnsafeSpanAwareTableStructureDiagnostic(table);
  if (safeDiagnostic !== undefined) {
    return blocked(table, safeDiagnostic);
  }

  const grid = projectGridModel(table);
  const insertRow = located.row + (position === "after" ? 1 : 0);
  const crossing = rowSpansCrossing(grid.cells, insertRow);
  const coveredColumns = coveredColumnsFor(crossing);
  const uncoveredColumnCount = Math.max(0, grid.columnCount - coveredColumns.size);
  const offset = insertRow < table.rows.length
    ? table.rows[insertRow].range.start.offset
    : table.rows.at(-1)?.range.end.offset ?? table.raw.length;
  const replacements = [
    ...spanUpdateReplacements(crossing.map((origin) => ({ origin, rowSpan: origin.rowSpan + 1, colSpan: origin.colSpan })), table),
    ...(uncoveredColumnCount > 0
      ? [{ start: offset, end: offset, text: emptyRowSource(table.delimiter.separator, uncoveredColumnCount) }]
      : [])
  ];

  return {
    ok: true,
    source: applyReplacements(table.raw, replacements),
    diagnostics: []
  };
}

export function deletePlainRow(table: LosslessTable, request: RowColumnEditRequest): WriteBackResult {
  if (hasDuplicateShorthand(table)) {
    return deletePlainRow(parseAsciiDocTable(expandDuplicateShorthand(table)), request);
  }

  const located = findCellWithRow(table, request.sourceCellId);
  if (located === undefined) {
    return blocked(table, cellNotFoundDiagnostic(request.sourceCellId));
  }

  const safeDiagnostic = getUnsafeSpanAwareTableStructureDiagnostic(table);
  if (safeDiagnostic !== undefined) {
    return blocked(table, safeDiagnostic);
  }
  const grid = projectGridModel(table);
  if (grid.rowCount <= 1) {
    return blocked(table, {
      code: "writeback.delete-last-row",
      severity: "error",
      message: "Cannot delete the last table row",
      nodeId: request.sourceCellId
    });
  }

  const originStartingInDeletedRow = uniqueOrigins(grid.cells[located.row] ?? [])
    .find((origin) => origin.row === located.row && origin.rowSpan > 1);
  if (originStartingInDeletedRow !== undefined) {
    return blocked(table, {
      code: "writeback.delete-row-span-origin",
      severity: "error",
      message: `Cannot delete row ${located.row} because merged cell ${originStartingInDeletedRow.sourceCellId} starts there`,
      nodeId: originStartingInDeletedRow.sourceCellId
    });
  }

  const crossing = rowSpansCovering(grid.cells, located.row);
  const row = table.rows[located.row];
  const replacements = [
    { start: row.range.start.offset, end: row.range.end.offset, text: "" },
    ...spanUpdateReplacements(crossing.map((origin) => ({ origin, rowSpan: origin.rowSpan - 1, colSpan: origin.colSpan })), table)
  ];
  return {
    ok: true,
    source: applyReplacements(table.raw, replacements),
    diagnostics: []
  };
}

export function insertPlainColumnAfter(table: LosslessTable, request: RowColumnEditRequest): WriteBackResult {
  return insertPlainColumn(table, request, "after");
}

export function insertPlainColumnBefore(table: LosslessTable, request: RowColumnEditRequest): WriteBackResult {
  return insertPlainColumn(table, request, "before");
}

function insertPlainColumn(table: LosslessTable, request: RowColumnEditRequest, position: "before" | "after"): WriteBackResult {
  if (hasDuplicateShorthand(table)) {
    const result = insertPlainColumn(parseAsciiDocTable(expandDuplicateShorthand(table)), request, position);
    return result.ok ? result : { ...result, source: table.raw };
  }

  if (findCell(table, request.sourceCellId) === undefined) {
    return blocked(table, cellNotFoundDiagnostic(request.sourceCellId));
  }

  const grid = projectGridModel(table);
  const origins = uniqueOrigins(grid.cells.flat());
  const selectedOrigin = origins.find((origin) => origin.sourceCellId === request.sourceCellId);
  if (selectedOrigin === undefined) {
    return blocked(table, unresolvedGridOriginDiagnostic(request.sourceCellId));
  }
  const currentColumnCount = logicalColumnCount(origins);
  const insertCol = selectedOrigin.col + (position === "after" ? 1 : 0);
  const metadataPlan = planColumnMetadataEdit(table, currentColumnCount, {
    kind: "insert",
    anchorColumn: selectedOrigin.col,
    insertColumn: insertCol
  });
  if (!metadataPlan.ok) {
    return blocked(table, metadataPlan.diagnostic);
  }

  const safeDiagnostic = getUnsafeSpanAwareTableStructureDiagnostic(table);
  if (safeDiagnostic !== undefined) {
    return blocked(table, safeDiagnostic);
  }

  const crossing = colSpansCrossing(grid.cells, insertCol);
  const replacements = [
    ...spanUpdateReplacements(crossing.map((origin) => ({ origin, rowSpan: origin.rowSpan, colSpan: origin.colSpan + 1 })), table),
    ...columnInsertReplacements(table, grid.cells, insertCol),
    ...(metadataPlan.replacement === undefined ? [] : [metadataPlan.replacement])
  ];

  return {
    ok: true,
    source: applyReplacements(table.raw, replacements),
    diagnostics: []
  };
}

export function deletePlainColumn(table: LosslessTable, request: RowColumnEditRequest): WriteBackResult {
  if (hasDuplicateShorthand(table)) {
    const result = deletePlainColumn(parseAsciiDocTable(expandDuplicateShorthand(table)), request);
    return result.ok ? result : { ...result, source: table.raw };
  }

  if (findCell(table, request.sourceCellId) === undefined) {
    return blocked(table, cellNotFoundDiagnostic(request.sourceCellId));
  }

  const grid = projectGridModel(table);
  const origins = uniqueOrigins(grid.cells.flat());
  const selectedOrigin = origins.find((origin) => origin.sourceCellId === request.sourceCellId);
  if (selectedOrigin === undefined) {
    return blocked(table, unresolvedGridOriginDiagnostic(request.sourceCellId));
  }
  const currentColumnCount = logicalColumnCount(origins);
  if (currentColumnCount <= 1) {
    return blocked(table, {
      code: "writeback.delete-last-column",
      severity: "error",
      message: "Cannot delete the last table column",
      nodeId: request.sourceCellId
    });
  }
  const metadataPlan = planColumnMetadataEdit(table, currentColumnCount, {
    kind: "delete",
    deleteColumn: selectedOrigin.col
  });
  if (!metadataPlan.ok) {
    return blocked(table, metadataPlan.diagnostic);
  }

  const safeDiagnostic = getUnsafeSpanAwareTableStructureDiagnostic(table);
  if (safeDiagnostic !== undefined) {
    return blocked(table, safeDiagnostic);
  }

  const replacements = [
    ...columnDeleteReplacements(table, grid.cells, selectedOrigin.col),
    ...(metadataPlan.replacement === undefined ? [] : [metadataPlan.replacement])
  ];
  return {
    ok: true,
    source: applyReplacements(table.raw, replacements),
    diagnostics: []
  };
}

function rowSpansCrossing(cells: GridCell[][], insertRow: number): Array<Extract<GridCell, { kind: "origin" }>> {
  return uniqueOrigins(cells.flat()).filter((origin) => origin.row < insertRow && origin.row + origin.rowSpan > insertRow);
}

function rowSpansCovering(cells: GridCell[][], row: number): Array<Extract<GridCell, { kind: "origin" }>> {
  return uniqueOrigins(cells.flat()).filter((origin) => origin.row < row && origin.row + origin.rowSpan > row);
}

function colSpansCrossing(cells: GridCell[][], insertCol: number): Array<Extract<GridCell, { kind: "origin" }>> {
  return uniqueOrigins(cells.flat()).filter((origin) => origin.col < insertCol && origin.col + origin.colSpan > insertCol);
}

function uniqueOrigins(cells: readonly GridCell[]): Array<Extract<GridCell, { kind: "origin" }>> {
  const origins = new Map<string, Extract<GridCell, { kind: "origin" }>>();
  for (const cell of cells) {
    if (cell.kind === "origin") {
      origins.set(cell.sourceCellId, cell);
    }
  }
  return [...origins.values()];
}

function logicalColumnCount(origins: Array<Extract<GridCell, { kind: "origin" }>>): number {
  return origins.reduce((count, origin) => Math.max(count, origin.col + origin.colSpan), 0);
}

function unresolvedGridOriginDiagnostic(sourceCellId: string) {
  return {
    code: "writeback.unsafe-grid-structure",
    severity: "error" as const,
    message: `Cell ${sourceCellId} cannot be resolved to a logical grid origin`,
    nodeId: sourceCellId
  };
}

function coveredColumnsFor(origins: Array<Extract<GridCell, { kind: "origin" }>>): Set<number> {
  const columns = new Set<number>();
  for (const origin of origins) {
    for (let col = origin.col; col < origin.col + origin.colSpan; col += 1) {
      columns.add(col);
    }
  }
  return columns;
}

function spanUpdateReplacements(
  updates: Array<{ origin: Extract<GridCell, { kind: "origin" }>; rowSpan: number; colSpan: number }>,
  table: LosslessTable
): Array<{ start: number; end: number; text: string }> {
  const replacements = new Map<string, { start: number; end: number; text: string }>();
  for (const update of updates) {
    const cell = findCell(table, update.origin.sourceCellId);
    if (cell === undefined) {
      continue;
    }
    replacements.set(cell.nodeId, {
      start: cell.range.start.offset,
      end: cell.range.start.offset + cell.cellSpecRaw.length,
      text: updateSpanSpec(cell.cellSpecRaw, update.rowSpan, update.colSpan)
    });
  }
  return [...replacements.values()];
}

function columnInsertReplacements(
  table: LosslessTable,
  cells: GridCell[][],
  insertCol: number
): Array<{ start: number; end: number; text: string }> {
  const allOrigins = uniqueOrigins(cells.flat());
  return table.rows.flatMap((row, rowIndex) => {
    const rowOrigins = uniqueOrigins(cells[rowIndex] ?? []).sort((left, right) => left.col - right.col);
    if (allOrigins.some((origin) =>
      origin.row <= rowIndex &&
      origin.row + origin.rowSpan > rowIndex &&
      origin.col < insertCol &&
      origin.col + origin.colSpan > insertCol
    )) {
      return [];
    }

    const next = rowOrigins.find((origin) => origin.col >= insertCol);
    if (next !== undefined) {
      const nextCell = findCell(table, next.sourceCellId);
      return nextCell === undefined ? [] : [{
        start: nextCell.range.start.offset,
        end: nextCell.range.start.offset,
        text: `${table.delimiter.separator}  `
      }];
    }

    const previous = [...rowOrigins].reverse().find((origin) => origin.col + origin.colSpan <= insertCol);
    if (previous !== undefined) {
      const previousCell = findCell(table, previous.sourceCellId);
      return previousCell === undefined ? [] : [{
        start: previousCell.range.end.offset,
        end: previousCell.range.end.offset,
        text: ` ${table.delimiter.separator} `
      }];
    }

    return [{
      start: row.range.start.offset,
      end: row.range.start.offset,
      text: `${table.delimiter.separator}  `
    }];
  });
}

function columnDeleteReplacements(
  table: LosslessTable,
  cells: GridCell[][],
  deleteCol: number
): Array<{ start: number; end: number; text: string }> {
  const replacements = new Map<string, { start: number; end: number; text: string }>();
  for (const row of cells) {
    const gridCell = row[deleteCol];
    if (gridCell === undefined || replacements.has(gridCell.sourceCellId)) {
      continue;
    }
    const origin = gridCell.kind === "origin"
      ? gridCell
      : uniqueOrigins(cells.flat()).find((candidate) => candidate.sourceCellId === gridCell.sourceCellId);
    const sourceCell = findCell(table, gridCell.sourceCellId);
    if (origin === undefined || sourceCell === undefined) {
      continue;
    }
    if (origin.colSpan > 1) {
      replacements.set(sourceCell.nodeId, {
        start: sourceCell.range.start.offset,
        end: sourceCell.range.start.offset + sourceCell.cellSpecRaw.length,
        text: updateSpanSpec(sourceCell.cellSpecRaw, origin.rowSpan, origin.colSpan - 1)
      });
      continue;
    }
    if (gridCell.kind === "origin") {
      replacements.set(sourceCell.nodeId, {
        ...columnDeleteRange(table.raw, table.rows[origin.row].cells, table.rows[origin.row].cells.indexOf(sourceCell)),
        text: ""
      });
    }
  }
  return [...replacements.values()];
}
