import type { GridCell, GridModel, LosslessTable, LosslessTableCell, TableDiagnostic } from "./types";

export function projectGridModel(table: LosslessTable): GridModel {
  const cells: GridCell[][] = [];
  const diagnostics: TableDiagnostic[] = [...table.errors];
  let columnCount = 0;

  table.rows.forEach((row, rowIndex) => {
    cells[rowIndex] ??= [];
    let colIndex = 0;

    for (const sourceCell of row.cells) {
      while (cells[rowIndex][colIndex] !== undefined) {
        colIndex += 1;
      }

      const rowSpan = normalizeSpan(sourceCell.rowSpan);
      const colSpan = normalizeSpan(sourceCell.colSpan);
      const origin = createOriginCell(sourceCell, row.role, rowIndex, colIndex, rowSpan, colSpan);
      diagnostics.push(...sourceCell.errors);
      if (rowIndex + rowSpan > table.rows.length) {
        diagnostics.push(spanOverflowDiagnostic(sourceCell.nodeId, rowIndex, colIndex, rowSpan, table.rows.length));
      }
      placeOrigin(cells, origin, diagnostics);
      placeCoveredCells(cells, origin, diagnostics);
      columnCount = Math.max(columnCount, colIndex + colSpan);
      colIndex += colSpan;
    }

    columnCount = Math.max(columnCount, cells[rowIndex].length);
  });

  const rowCount = cells.length;
  for (let row = 0; row < rowCount; row += 1) {
    cells[row] ??= [];
    for (let col = 0; col < columnCount; col += 1) {
      if (cells[row][col] === undefined) {
        diagnostics.push({
          code: "grid.ragged-row",
          severity: "warning",
          message: `Grid slot ${row}:${col} has no source cell`
        });
      }
    }
  }

  return {
    tableId: table.nodeId,
    rowCount,
    columnCount,
    columns: table.attributes.columns,
    cells,
    diagnostics
  };
}

function createOriginCell(
  sourceCell: LosslessTableCell,
  role: Extract<GridCell, { kind: "origin" }>["role"],
  row: number,
  col: number,
  rowSpan: number,
  colSpan: number
): Extract<GridCell, { kind: "origin" }> {
  return {
    kind: "origin",
    cellId: `grid:${sourceCell.nodeId}`,
    sourceCellId: sourceCell.nodeId,
    row,
    col,
    rowSpan,
    colSpan,
    contentRaw: sourceCell.contentRaw,
    style: sourceCell.effectiveStyle ?? sourceCell.style,
    horizontalAlign: sourceCell.effectiveHorizontalAlign ?? sourceCell.horizontalAlign,
    verticalAlign: sourceCell.effectiveVerticalAlign ?? sourceCell.verticalAlign,
    role,
    editable: !sourceCell.isBlockContent,
    blockContent: sourceCell.isBlockContent,
    diagnostics: sourceCell.errors
  };
}

function placeOrigin(
  cells: GridCell[][],
  origin: Extract<GridCell, { kind: "origin" }>,
  diagnostics: TableDiagnostic[]
): void {
  const existing = cells[origin.row]?.[origin.col];
  if (existing !== undefined) {
    diagnostics.push(overlapDiagnostic(origin.sourceCellId, origin.row, origin.col, existing.sourceCellId));
  }
  cells[origin.row] ??= [];
  cells[origin.row][origin.col] = origin;
}

function placeCoveredCells(
  cells: GridCell[][],
  origin: Extract<GridCell, { kind: "origin" }>,
  diagnostics: TableDiagnostic[]
): void {
  for (let rowOffset = 0; rowOffset < origin.rowSpan; rowOffset += 1) {
    for (let colOffset = 0; colOffset < origin.colSpan; colOffset += 1) {
      if (rowOffset === 0 && colOffset === 0) {
        continue;
      }

      const row = origin.row + rowOffset;
      const col = origin.col + colOffset;
      const existing = cells[row]?.[col];
      if (existing !== undefined) {
        diagnostics.push(overlapDiagnostic(origin.sourceCellId, row, col, existing.sourceCellId));
      }

      cells[row] ??= [];
      cells[row][col] = {
        kind: "covered",
        cellId: `grid:${origin.sourceCellId}:covered:${row}:${col}`,
        coveredBy: origin.cellId,
        sourceCellId: origin.sourceCellId,
        row,
        col
      };
    }
  }
}

function normalizeSpan(value: number): number {
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function overlapDiagnostic(
  sourceCellId: string,
  row: number,
  col: number,
  existingSourceCellId: string
): TableDiagnostic {
  return {
    code: "grid.overlapping-span",
    severity: "error",
    message: `Cell ${sourceCellId} overlaps ${existingSourceCellId} at ${row}:${col}`,
    nodeId: sourceCellId
  };
}

function spanOverflowDiagnostic(
  sourceCellId: string,
  row: number,
  col: number,
  rowSpan: number,
  rowCount: number
): TableDiagnostic {
  return {
    code: "grid.span-overflow",
    severity: "error",
    message: `Cell ${sourceCellId} at ${row}:${col} spans ${rowSpan} rows beyond row count ${rowCount}`,
    nodeId: sourceCellId
  };
}
