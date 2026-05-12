import { projectGridModel } from "./grid-model";
import type { GridCell, LosslessTable, LosslessTableCell, TableDiagnostic, WriteBackResult } from "./types";

export function findCell(table: LosslessTable, sourceCellId: string): LosslessTableCell | undefined {
  for (const row of table.rows) {
    const cell = row.cells.find((candidate) => candidate.nodeId === sourceCellId);
    if (cell !== undefined) {
      return cell;
    }
  }
  return undefined;
}

export function cellNotFoundDiagnostic(sourceCellId: string): TableDiagnostic {
  return {
    code: "writeback.cell-not-found",
    severity: "error",
    message: `Cell ${sourceCellId} was not found`,
    nodeId: sourceCellId
  };
}

export function getUnsafeTableStructureDiagnostic(table: LosslessTable): TableDiagnostic | undefined {
  const columnCount = table.rows[0]?.cells.length;
  if (columnCount === undefined || columnCount === 0) {
    return {
      code: "writeback.empty-table",
      severity: "error",
      message: "Cannot edit row or column structure for an empty table"
    };
  }

  for (const row of table.rows) {
    if (row.cells.length !== columnCount) {
      return {
        code: "writeback.structure-ragged",
        severity: "error",
        message: "Row and column edits require a rectangular table"
      };
    }
    for (const cell of row.cells) {
      const unsafeDiagnostic = getUnsafeCellDiagnostic(cell);
      if (unsafeDiagnostic !== undefined) {
        return {
          ...unsafeDiagnostic,
          code: "writeback.unsafe-structure-cell",
          message: `Cell ${cell.nodeId} prevents source-safe row or column edits`
        };
      }
    }
  }

  return undefined;
}

export function getUnsafeSpanAwareTableStructureDiagnostic(table: LosslessTable): TableDiagnostic | undefined {
  if (table.rows.length === 0) {
    return {
      code: "writeback.empty-table",
      severity: "error",
      message: "Cannot edit row or column structure for an empty table"
    };
  }

  const grid = projectGridModel(table);
  const gridDiagnostic = grid.diagnostics.find((diagnostic) => diagnostic.severity === "error" || diagnostic.code === "grid.ragged-row");
  if (gridDiagnostic !== undefined) {
    return {
      ...gridDiagnostic,
      code: "writeback.unsafe-grid-structure",
      message: "Row and column edits require a source-safe table grid"
    };
  }

  for (const row of table.rows) {
    for (const cell of row.cells) {
      if (cell.errors.length > 0) {
        return {
          code: "writeback.unsafe-structure-cell",
          severity: "error",
          message: `Cell ${cell.nodeId} prevents source-safe row or column edits`,
          nodeId: cell.nodeId
        };
      }
      if (cell.isBlockContent) {
        return {
          code: "writeback.unsafe-structure-cell",
          severity: "error",
          message: `Block cell ${cell.nodeId} prevents source-safe row or column edits`,
          nodeId: cell.nodeId
        };
      }
    }
  }

  return undefined;
}

export function emptyRowSource(separator: string, columnCount: number): string {
  return Array.from({ length: columnCount }, () => `${separator} `).join(" ") + "\n";
}

export function columnDeleteRange(source: string, cells: readonly LosslessTableCell[], col: number): { start: number; end: number } {
  const cell = cells[col];
  if (col === 0) {
    return {
      start: cell.range.start.offset,
      end: cells[1]?.range.start.offset ?? cell.range.end.offset
    };
  }
  return {
    start: removableCellStart(source, cell),
    end: cell.range.end.offset
  };
}

export function mergeRemoveRanges(
  table: LosslessTable,
  entries: Array<{ row: number; col: number; cell: LosslessTableCell }>
): Array<{ start: number; end: number }> {
  const groups = new Map<number, Array<{ row: number; col: number; cell: LosslessTableCell }>>();
  for (const entry of entries) {
    groups.set(entry.row, [...(groups.get(entry.row) ?? []), entry]);
  }

  return Array.from(groups.values()).map((group) => {
    const sorted = [...group].sort((left, right) => left.col - right.col);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (first.col === 0) {
      const nextCell = table.rows[first.row]?.cells.find((cell) => cell.range.start.offset > last.cell.range.end.offset);
      return {
        start: first.cell.range.start.offset,
        end: nextCell?.range.start.offset ?? last.cell.range.end.offset
      };
    }
    return {
      start: removableCellStart(table.raw, first.cell),
      end: last.cell.range.end.offset
    };
  });
}

export function applyReplacements(source: string, replacements: Array<{ start: number; end: number; text: string }>): string {
  return replacements
    .sort((left, right) => right.start - left.start)
    .reduce((current, replacement) => current.slice(0, replacement.start) + replacement.text + current.slice(replacement.end), source);
}

export function hasDuplicateShorthand(table: LosslessTable): boolean {
  return table.rows.some((row) => row.cells.some((cell) => (cell.duplicateCount ?? 1) > 1));
}

export function expandDuplicateShorthand(
  table: LosslessTable,
  replacements: ReadonlyMap<string, string> = new Map()
): string {
  const duplicateGroups = new Map<string, LosslessTableCell[]>();
  for (const row of table.rows) {
    for (const cell of row.cells) {
      if ((cell.duplicateCount ?? 1) <= 1 || cell.duplicateGroupId === undefined) {
        continue;
      }
      duplicateGroups.set(cell.duplicateGroupId, [...(duplicateGroups.get(cell.duplicateGroupId) ?? []), cell]);
    }
  }

  const sourceReplacements: Array<{ start: number; end: number; text: string }> = [];
  for (const cells of duplicateGroups.values()) {
    const sorted = [...cells].sort((left, right) => (left.duplicateIndex ?? 0) - (right.duplicateIndex ?? 0));
    const first = sorted[0];
    if (first === undefined) {
      continue;
    }
    sourceReplacements.push({
      start: first.range.start.offset,
      end: first.range.end.offset,
      text: sorted
        .map((cell) => `${table.delimiter.separator}${replacements.get(cell.nodeId) ?? cell.contentRaw}`)
        .join(" ")
    });
  }

  return applyReplacements(table.raw, sourceReplacements);
}

export function findGridOriginWithSourceCell(
  table: LosslessTable,
  cells: GridCell[][],
  sourceCellId: string
): { row: number; col: number; gridCell: Extract<GridCell, { kind: "origin" }>; cell: LosslessTableCell } | undefined {
  const cell = findCell(table, sourceCellId);
  if (cell === undefined) {
    return undefined;
  }
  for (const row of cells) {
    for (const gridCell of row) {
      if (gridCell?.kind === "origin" && gridCell.sourceCellId === sourceCellId) {
        return {
          row: gridCell.row,
          col: gridCell.col,
          gridCell,
          cell
        };
      }
    }
  }
  return undefined;
}

export function spanPrefix(rowSpan: number, colSpan: number): string {
  if (rowSpan > 1 && colSpan > 1) {
    return `${colSpan}.${rowSpan}+`;
  }
  if (rowSpan > 1) {
    return `.${rowSpan}+`;
  }
  if (colSpan > 1) {
    return `${colSpan}+`;
  }
  return "";
}

export function removeSpanSpec(cellSpecRaw: string): string {
  return cellSpecRaw.replace(/^(?:\d+)?(?:\.\d+)?\+/u, "");
}

export function updateSpanSpec(cellSpecRaw: string, rowSpan: number, colSpan: number): string {
  return `${spanPrefix(rowSpan, colSpan)}${removeSpanSpec(cellSpecRaw)}`;
}

export function emptyCellsAfter(separator: string, count: number): string {
  return Array.from({ length: count }, () => ` ${separator} `).join("");
}

export function coveredRowInsertions(
  table: LosslessTable,
  originRow: number,
  originCol: number,
  rowSpan: number,
  colSpan: number
): Array<{ start: number; end: number; text: string }> {
  if (rowSpan <= 1) {
    return [];
  }
  const grid = projectGridModel(table);
  const insertions: Array<{ start: number; end: number; text: string }> = [];
  for (let row = originRow + 1; row < originRow + rowSpan; row += 1) {
    const tableRow = table.rows[row];
    if (tableRow === undefined) {
      continue;
    }
    if (originCol === 0) {
      insertions.push({
        start: tableRow.range.start.offset,
        end: tableRow.range.start.offset,
        text: emptyCellsBefore(table.delimiter.separator, colSpan)
      });
      continue;
    }

    const previous = previousOriginInRow(grid.cells, row, originCol);
    const previousSourceCell = previous ? findCell(table, previous.sourceCellId) : undefined;
    if (previousSourceCell !== undefined) {
      insertions.push({
        start: previousSourceCell.range.end.offset,
        end: previousSourceCell.range.end.offset,
        text: emptyCellsAfter(table.delimiter.separator, colSpan)
      });
    }
  }
  return insertions;
}

export function emptyCellsBefore(separator: string, count: number): string {
  return Array.from({ length: count }, () => `${separator}  `).join("");
}

export function previousOriginInRow(cells: GridCell[][], row: number, beforeCol: number): Extract<GridCell, { kind: "origin" }> | undefined {
  const origins = (cells[row] ?? []).filter((cell): cell is Extract<GridCell, { kind: "origin" }> => cell?.kind === "origin");
  return origins
    .filter((cell) => cell.col + cell.colSpan <= beforeCol)
    .sort((left, right) => right.col + right.colSpan - (left.col + left.colSpan))[0];
}

export function findCellWithRow(table: LosslessTable, sourceCellId: string): { row: number; col: number; cell: LosslessTableCell } | undefined {
  for (const [row, tableRow] of table.rows.entries()) {
    const col = tableRow.cells.findIndex((candidate) => candidate.nodeId === sourceCellId);
    if (col >= 0) {
      return {
        row,
        col,
        cell: tableRow.cells[col]
      };
    }
  }
  return undefined;
}

export function removableCellStart(source: string, cell: LosslessTableCell): number {
  const previousOffset = cell.range.start.offset - 1;
  if (previousOffset >= 0 && source[previousOffset] !== "\n" && /\s/u.test(source[previousOffset])) {
    return previousOffset;
  }
  return cell.range.start.offset;
}

export function getUnsafeCellDiagnostic(
  cell: LosslessTableCell,
  options: { allowSpannedCell?: boolean } = {}
): TableDiagnostic | undefined {
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
      message: `Block cell ${cell.nodeId} cannot be patched with plain cell content replacement`,
      nodeId: cell.nodeId
    };
  }

  if (!options.allowSpannedCell && (cell.rowSpan > 1 || cell.colSpan > 1)) {
    return {
      code: "writeback.unsafe-spanned-cell",
      severity: "error",
      message: `Spanned cell ${cell.nodeId} cannot be patched with plain cell content replacement`,
      nodeId: cell.nodeId
    };
  }

  return undefined;
}

export function blocked(table: LosslessTable, diagnostic: TableDiagnostic): WriteBackResult {
  return {
    ok: false,
    source: table.raw,
    diagnostics: [diagnostic]
  };
}
