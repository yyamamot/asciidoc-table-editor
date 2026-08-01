import type { LosslessTable, WriteBackResult } from "./types";
import type { BlockCellContentReplacement, ImportedTablePasteRequest, PlainCellBlockReplacement, PlainCellContentReplacement, RectangularPasteRequest } from "./emitter-types";
import { projectGridModel } from "./grid-model";
import { parseAsciiDocTable } from "./parser";
import {
  duplicateExpansionPreservesSemantics,
  prepareBlockCellContent,
  preparePlainCellContent,
  validateCellReplacement
} from "./writeback-validation";
import {
  applyReplacements,
  blocked,
  cellNotFoundDiagnostic,
  emptyRowSource,
  expandDuplicateShorthand,
  findCell,
  findGridOriginWithSourceCell,
  getUnsafeCellDiagnostic,
  hasDuplicateShorthand,
  updateSpanSpec
} from "./emitter-utils";

export function emitNoopTable(table: LosslessTable): string {
  return table.raw;
}

export function replacePlainCellContent(table: LosslessTable, sourceCellId: string, nextContentRaw: string): WriteBackResult {
  const cell = findCell(table, sourceCellId);
  if ((cell?.duplicateCount ?? 1) > 1) {
    return replacePlainCellContents(table, [{ sourceCellId, contentRaw: nextContentRaw }]);
  }
  if (cell === undefined) {
    return blocked(table, cellNotFoundDiagnostic(sourceCellId));
  }

  const unsafeDiagnostic = getUnsafeCellDiagnostic(cell, { allowSpannedCell: true });
  if (unsafeDiagnostic !== undefined) {
    return blocked(table, unsafeDiagnostic);
  }

  const prepared = preparePlainCellContent(table, nextContentRaw);
  if (!prepared.ok) {
    return blocked(table, { ...prepared.diagnostic, nodeId: sourceCellId });
  }

  const contentStart = cell.range.end.offset - cell.contentRaw.length;
  const contentEnd = cell.range.end.offset;
  const ordinal = cellOrdinal(table, sourceCellId);
  if (ordinal === undefined) {
    return blocked(table, cellNotFoundDiagnostic(sourceCellId));
  }
  return validateCellReplacement({
    originalTable: table,
    workingTable: table,
    candidateSource: table.raw.slice(0, contentStart) + prepared.contentRaw + table.raw.slice(contentEnd),
    targets: [{ ...ordinal, expectedContentRaw: prepared.contentRaw, transition: "plain" }]
  });
}

export function replaceBlockCellContent(table: LosslessTable, replacement: BlockCellContentReplacement): WriteBackResult {
  const cell = findCell(table, replacement.sourceCellId);
  if (cell === undefined) {
    return blocked(table, cellNotFoundDiagnostic(replacement.sourceCellId));
  }

  if (!cell.isBlockContent) {
    return blocked(table, {
      code: "writeback.not-block-cell",
      severity: "error",
      message: `Cell ${replacement.sourceCellId} is not a block cell`,
      nodeId: replacement.sourceCellId
    });
  }

  if (cell.errors.length > 0) {
    return blocked(table, {
      code: "writeback.unsafe-block-cell-diagnostics",
      severity: "error",
      message: `Block cell ${replacement.sourceCellId} has diagnostics and cannot be patched safely`,
      nodeId: replacement.sourceCellId
    });
  }

  const prepared = prepareBlockCellContent(table, replacement.contentRaw);
  if (!prepared.ok) {
    return blocked(table, { ...prepared.diagnostic, nodeId: replacement.sourceCellId });
  }

  const contentStart = cell.range.end.offset - cell.contentRaw.length;
  const contentEnd = cell.range.end.offset;
  const ordinal = cellOrdinal(table, replacement.sourceCellId);
  if (ordinal === undefined) {
    return blocked(table, cellNotFoundDiagnostic(replacement.sourceCellId));
  }
  return validateCellReplacement({
    originalTable: table,
    workingTable: table,
    candidateSource: table.raw.slice(0, contentStart) + prepared.contentRaw + table.raw.slice(contentEnd),
    targets: [{ ...ordinal, expectedContentRaw: prepared.contentRaw, transition: "block" }]
  });
}

export function replacePlainCellWithBlockContent(table: LosslessTable, replacement: PlainCellBlockReplacement): WriteBackResult {
  const cell = findCell(table, replacement.sourceCellId);
  if (cell === undefined) {
    return blocked(table, cellNotFoundDiagnostic(replacement.sourceCellId));
  }

  if ((cell.duplicateCount ?? 1) > 1) {
    return blocked(table, {
      code: "writeback.block-convert-duplicate-cell",
      severity: "error",
      message: `Duplicate shorthand cell ${replacement.sourceCellId} cannot be converted to a block cell safely`,
      nodeId: replacement.sourceCellId
    });
  }

  if (cell.isBlockContent) {
    return blocked(table, {
      code: "writeback.block-convert-already-block-cell",
      severity: "error",
      message: `Cell ${replacement.sourceCellId} is already a block cell`,
      nodeId: replacement.sourceCellId
    });
  }

  if (cell.rowSpan > 1 || cell.colSpan > 1 || cell.cellSpecRaw.length > 0 || cell.errors.length > 0) {
    return blocked(table, {
      code: "writeback.unsafe-block-convert-cell",
      severity: "error",
      message: `Cell ${replacement.sourceCellId} cannot be converted to a block cell safely`,
      nodeId: replacement.sourceCellId
    });
  }

  const prepared = prepareBlockCellContent(table, replacement.contentRaw);
  if (!prepared.ok) {
    return blocked(table, { ...prepared.diagnostic, nodeId: replacement.sourceCellId });
  }

  const suffix = table.raw.slice(cell.range.end.offset);
  const separatorAfterCell = new RegExp(`^[ \\t]+(?=${escapeRegExp(cell.delimiterRaw)})`, "u");
  const multiline = /\r|\n/u.test(prepared.contentRaw);
  const normalizedSuffix = multiline ? suffix.replace(separatorAfterCell, "") : suffix;
  const cellBreak = multiline && normalizedSuffix.startsWith(cell.delimiterRaw) && !/(?:\r\n|\n|\r)$/u.test(prepared.contentRaw)
    ? tableLocalEol(table.raw, cell.range.start.offset, cell.range.end.offset)
    : "";
  const ordinal = cellOrdinal(table, replacement.sourceCellId);
  if (ordinal === undefined) {
    return blocked(table, cellNotFoundDiagnostic(replacement.sourceCellId));
  }
  return validateCellReplacement({
    originalTable: table,
    workingTable: table,
    candidateSource: table.raw.slice(0, cell.range.start.offset) + `a${cell.delimiterRaw}${prepared.contentRaw}${cellBreak}` + normalizedSuffix,
    targets: [{ ...ordinal, expectedContentRaw: prepared.contentRaw, transition: "plain-to-block" }]
  });
}

export function replacePlainCellContents(table: LosslessTable, replacements: readonly PlainCellContentReplacement[]): WriteBackResult {
  return replacePlainCellContentsInternal(table, table, replacements);
}

function replacePlainCellContentsInternal(
  originalTable: LosslessTable,
  initialWorkingTable: LosslessTable,
  replacements: readonly PlainCellContentReplacement[]
): WriteBackResult {
  if (replacements.length === 0) {
    return blocked(originalTable, {
      code: "writeback.empty-replacement-set",
      severity: "error",
      message: "No cell content replacements were provided"
    });
  }

  const seen = new Set<string>();
  const replacementMap = new Map<string, string>();
  for (const replacement of replacements) {
    if (seen.has(replacement.sourceCellId)) {
      return blocked(originalTable, {
        code: "writeback.duplicate-cell-replacement",
        severity: "error",
        message: `Cell ${replacement.sourceCellId} was targeted more than once`,
        nodeId: replacement.sourceCellId
      });
    }
    seen.add(replacement.sourceCellId);
    const prepared = preparePlainCellContent(initialWorkingTable, replacement.contentRaw);
    if (!prepared.ok) {
      return blocked(originalTable, { ...prepared.diagnostic, nodeId: replacement.sourceCellId });
    }
    replacementMap.set(replacement.sourceCellId, prepared.contentRaw);
  }

  let touchesDuplicateShorthand = false;
  for (const replacement of replacements) {
    const cell = findCell(initialWorkingTable, replacement.sourceCellId);
    if (cell === undefined) {
      return blocked(originalTable, cellNotFoundDiagnostic(replacement.sourceCellId));
    }
    const unsafeDiagnostic = getUnsafeCellDiagnostic(cell);
    if (unsafeDiagnostic !== undefined) {
      return blocked(originalTable, unsafeDiagnostic);
    }
    if ((cell.duplicateCount ?? 1) > 1) {
      touchesDuplicateShorthand = true;
    }
  }

  let workingTable = initialWorkingTable;
  if (touchesDuplicateShorthand) {
    const expandedTable = parseAsciiDocTable(expandDuplicateShorthand(initialWorkingTable));
    if (!duplicateExpansionPreservesSemantics(initialWorkingTable, expandedTable)) {
      return blocked(originalTable, {
        code: "writeback.cell-replacement-validation-failed",
        severity: "error",
        message: "Duplicate shorthand expansion would change cell style or alignment"
      });
    }
    workingTable = expandedTable;
  }

  const ranges: Array<{ start: number; end: number; contentRaw: string }> = [];
  const targets: Array<{ rowOrdinal: number; cellOrdinal: number; expectedContentRaw: string; transition: "plain" }> = [];
  for (const [sourceCellId, contentRaw] of replacementMap) {
    const cell = findCell(workingTable, sourceCellId);
    const ordinal = cellOrdinal(workingTable, sourceCellId);
    if (cell === undefined || ordinal === undefined) {
      return blocked(originalTable, cellNotFoundDiagnostic(sourceCellId));
    }
    ranges.push({ start: cell.range.end.offset - cell.contentRaw.length, end: cell.range.end.offset, contentRaw });
    targets.push({ ...ordinal, expectedContentRaw: contentRaw, transition: "plain" });
  }
  const source = ranges
    .sort((left, right) => right.start - left.start)
    .reduce(
      (current, replacement) => current.slice(0, replacement.start) + replacement.contentRaw + current.slice(replacement.end),
      workingTable.raw
    );

  return validateCellReplacement({ originalTable, workingTable, candidateSource: source, targets });
}

export function pasteRectangularPlainTable(table: LosslessTable, request: RectangularPasteRequest): WriteBackResult {
  const shapeDiagnostic = rectangularPasteShapeDiagnostic(request.rows);
  if (shapeDiagnostic !== undefined) {
    return blocked(table, shapeDiagnostic);
  }

  const safeDiagnostic = plainRectangularTableDiagnostic(table);
  if (safeDiagnostic !== undefined) {
    return blocked(table, safeDiagnostic);
  }

  const grid = projectGridModel(table);
  const located = findGridOriginWithSourceCell(table, grid.cells, request.startSourceCellId);
  if (located === undefined) {
    return blocked(table, cellNotFoundDiagnostic(request.startSourceCellId));
  }

  const pasteRowCount = request.rows.length;
  const pasteColumnCount = request.rows[0]?.length ?? 0;
  const requiredRowCount = located.row + pasteRowCount;
  const requiredColumnCount = located.col + pasteColumnCount;
  const expandedSource = expandPlainTable(table, Math.max(0, requiredRowCount - table.rows.length), Math.max(0, requiredColumnCount - grid.columnCount));
  const expandedTable = parseAsciiDocTable(expandedSource);
  const expandedGrid = projectGridModel(expandedTable);
  const replacements: PlainCellContentReplacement[] = [];

  for (let rowOffset = 0; rowOffset < pasteRowCount; rowOffset += 1) {
    for (let colOffset = 0; colOffset < pasteColumnCount; colOffset += 1) {
      const target = expandedGrid.cells[located.row + rowOffset]?.[located.col + colOffset];
      if (target?.kind !== "origin") {
        return blocked(table, {
          code: "writeback.paste-target-unsafe",
          severity: "error",
          message: "Clipboard paste target is not a plain editable cell"
        });
      }
      replacements.push({
        sourceCellId: target.sourceCellId,
        contentRaw: ` ${request.rows[rowOffset][colOffset]}`
      });
    }
  }

  return replacePlainCellContentsInternal(table, expandedTable, replacements);
}

export function pasteImportedTable(table: LosslessTable, request: ImportedTablePasteRequest): WriteBackResult {
  if (hasDuplicateShorthand(table)) {
    return pasteImportedTable(parseAsciiDocTable(expandDuplicateShorthand(table)), request);
  }

  const shapeDiagnostic = importedPasteShapeDiagnostic(request);
  if (shapeDiagnostic !== undefined) {
    return blocked(table, shapeDiagnostic);
  }

  const grid = projectGridModel(table);
  const located = findGridOriginWithSourceCell(table, grid.cells, request.startSourceCellId);
  if (located === undefined) {
    return blocked(table, cellNotFoundDiagnostic(request.startSourceCellId));
  }

  const requiredRowCount = located.row + request.rowCount;
  const requiredColumnCount = located.col + request.columnCount;
  const addRows = Math.max(0, requiredRowCount - table.rows.length);
  const addColumns = Math.max(0, requiredColumnCount - grid.columnCount);
  const expansionDiagnostic = addRows > 0 || addColumns > 0 ? pasteExpansionSafetyDiagnostic(table) : undefined;
  if (expansionDiagnostic !== undefined) {
    return blocked(table, expansionDiagnostic);
  }

  const expandedSource = expandPlainTable(table, addRows, addColumns);
  const expandedTable = parseAsciiDocTable(expandedSource);
  const expandedGrid = projectGridModel(expandedTable);
  const replacements: Array<{ start: number; end: number; text: string }> = [];
  const usedTargetSourceIds = new Set<string>();
  const importedOrigins = new Map(request.cells.map((cell) => [key(cell.row, cell.col), cell]));
  const coveredSlots = importedCoveredSlots(request);

  for (let rowOffset = 0; rowOffset < request.rowCount; rowOffset += 1) {
    for (let colOffset = 0; colOffset < request.columnCount; colOffset += 1) {
      const target = expandedGrid.cells[located.row + rowOffset]?.[located.col + colOffset];
      if (target?.kind !== "origin" || !target.editable || target.blockContent || target.rowSpan !== 1 || target.colSpan !== 1 || target.diagnostics.length > 0) {
        return blocked(table, {
          code: "writeback.imported-paste-target-unsafe",
          severity: "error",
          message: "Imported table paste target is not a plain editable cell"
        });
      }
      if (usedTargetSourceIds.has(target.sourceCellId)) {
        return blocked(table, {
          code: "writeback.imported-paste-target-overlap",
          severity: "error",
          message: "Imported table paste target overlaps an existing merged cell"
        });
      }
      usedTargetSourceIds.add(target.sourceCellId);
      const targetCell = findCell(expandedTable, target.sourceCellId);
      if (targetCell === undefined) {
        return blocked(table, cellNotFoundDiagnostic(target.sourceCellId));
      }

      const importedOrigin = importedOrigins.get(key(rowOffset, colOffset));
      if (importedOrigin !== undefined) {
        replacements.push({
          start: targetCell.range.start.offset,
          end: targetCell.range.end.offset,
          text: importedCellSource(expandedTable.delimiter.separator, importedOrigin)
        });
      } else if (coveredSlots.has(key(rowOffset, colOffset))) {
        replacements.push({
          start: targetCell.range.start.offset,
          end: targetCell.range.end.offset,
          text: ""
        });
      } else {
        return blocked(table, {
          code: "writeback.imported-paste-missing-cell",
          severity: "error",
          message: "Imported table paste has a missing cell slot"
        });
      }
    }
  }

  return {
    ok: true,
    source: applyReplacements(expandedTable.raw, replacements),
    diagnostics: []
  };
}

function rectangularPasteShapeDiagnostic(rows: readonly (readonly string[])[]) {
  if (rows.length === 0 || rows[0]?.length === 0) {
    return {
      code: "writeback.empty-paste-table",
      severity: "error" as const,
      message: "Clipboard paste table is empty"
    };
  }
  const columnCount = rows[0].length;
  if (rows.some((row) => row.length !== columnCount)) {
    return {
      code: "writeback.ragged-paste-table",
      severity: "error" as const,
      message: "Clipboard paste table must be rectangular"
    };
  }
  return undefined;
}

function importedPasteShapeDiagnostic(request: ImportedTablePasteRequest) {
  if (request.rowCount <= 0 || request.columnCount <= 0 || request.cells.length === 0) {
    return {
      code: "writeback.empty-imported-paste-table",
      severity: "error" as const,
      message: "Imported table paste table is empty"
    };
  }
  const occupied = new Set<string>();
  for (const cell of request.cells) {
    if (cell.row < 0 || cell.col < 0 || cell.rowSpan < 1 || cell.colSpan < 1) {
      return {
        code: "writeback.invalid-imported-paste-span",
        severity: "error" as const,
        message: "Imported table paste contains an invalid span"
      };
    }
    if (cell.row + cell.rowSpan > request.rowCount || cell.col + cell.colSpan > request.columnCount) {
      return {
        code: "writeback.imported-paste-span-overflow",
        severity: "error" as const,
        message: "Imported table paste span exceeds the imported table bounds"
      };
    }
    for (let rowOffset = 0; rowOffset < cell.rowSpan; rowOffset += 1) {
      for (let colOffset = 0; colOffset < cell.colSpan; colOffset += 1) {
        const slot = key(cell.row + rowOffset, cell.col + colOffset);
        if (occupied.has(slot)) {
          return {
            code: "writeback.imported-paste-overlapping-span",
            severity: "error" as const,
            message: "Imported table paste contains overlapping spans"
          };
        }
        occupied.add(slot);
      }
    }
  }
  for (let row = 0; row < request.rowCount; row += 1) {
    for (let col = 0; col < request.columnCount; col += 1) {
      if (!occupied.has(key(row, col))) {
        return {
          code: "writeback.imported-paste-ragged",
          severity: "error" as const,
          message: "Imported table paste must be rectangular"
        };
      }
    }
  }
  return undefined;
}

function importedCoveredSlots(request: ImportedTablePasteRequest): Set<string> {
  const covered = new Set<string>();
  for (const cell of request.cells) {
    for (let rowOffset = 0; rowOffset < cell.rowSpan; rowOffset += 1) {
      for (let colOffset = 0; colOffset < cell.colSpan; colOffset += 1) {
        if (rowOffset !== 0 || colOffset !== 0) {
          covered.add(key(cell.row + rowOffset, cell.col + colOffset));
        }
      }
    }
  }
  return covered;
}

function importedCellSource(separator: string, cell: { rowSpan: number; colSpan: number; text: string }): string {
  const spanSpec = updateSpanSpec("", cell.rowSpan, cell.colSpan);
  return `${spanSpec}${separator} ${cell.text}`;
}

function pasteExpansionSafetyDiagnostic(table: LosslessTable) {
  const grid = projectGridModel(table);
  const gridDiagnostic = grid.diagnostics.find((diagnostic) => diagnostic.severity === "error" || diagnostic.code === "grid.ragged-row");
  if (gridDiagnostic !== undefined) {
    return {
      ...gridDiagnostic,
      code: "writeback.unsafe-imported-paste-grid",
      message: "Imported table paste requires a source-safe table grid"
    };
  }
  for (const row of table.rows) {
    for (const cell of row.cells) {
      if (cell.rowSpan > 1 || cell.colSpan > 1 || cell.isBlockContent || cell.errors.length > 0) {
        return {
          code: "writeback.unsafe-imported-paste-expansion",
          severity: "error" as const,
          message: "Imported table paste cannot auto-expand a table that already contains merged, block, or diagnostic cells",
          nodeId: cell.nodeId
        };
      }
    }
  }
  return undefined;
}

function plainRectangularTableDiagnostic(table: LosslessTable) {
  const grid = projectGridModel(table);
  const gridDiagnostic = grid.diagnostics.find((diagnostic) => diagnostic.severity === "error" || diagnostic.code === "grid.ragged-row");
  if (gridDiagnostic !== undefined) {
    return {
      ...gridDiagnostic,
      code: "writeback.unsafe-paste-grid",
      message: "Clipboard paste requires a source-safe table grid"
    };
  }

  for (const row of table.rows) {
    for (const cell of row.cells) {
      if (cell.rowSpan > 1 || cell.colSpan > 1) {
        return {
          code: "writeback.paste-merged-cell-overlap",
          severity: "error" as const,
          message: "Clipboard paste cannot auto-expand through merged cells",
          nodeId: cell.nodeId
        };
      }
      if (cell.isBlockContent) {
        return {
          code: "writeback.paste-block-cell-overlap",
          severity: "error" as const,
          message: "Clipboard paste cannot auto-expand through block cells",
          nodeId: cell.nodeId
        };
      }
      if (cell.errors.length > 0) {
        return {
          code: "writeback.paste-cell-diagnostics",
          severity: "error" as const,
          message: "Clipboard paste target table has cell diagnostics",
          nodeId: cell.nodeId
        };
      }
    }
  }
  return undefined;
}

function expandPlainTable(table: LosslessTable, addRows: number, addColumns: number): string {
  const replacements: Array<{ start: number; end: number; text: string }> = [];
  if (addColumns > 0) {
    for (const row of table.rows) {
      const insertAt = rowContentEndOffset(row.raw, row.range.end.offset);
      replacements.push({
        start: insertAt,
        end: insertAt,
        text: Array.from({ length: addColumns }, () => ` ${table.delimiter.separator} `).join("")
      });
    }
  }
  if (addRows > 0) {
    const endDelimiterOffset = table.raw.lastIndexOf(table.delimiter.endRaw);
    const columnCount = (table.rows[0]?.cells.length ?? 0) + addColumns;
    replacements.push({
      start: endDelimiterOffset >= 0 ? endDelimiterOffset : table.raw.length,
      end: endDelimiterOffset >= 0 ? endDelimiterOffset : table.raw.length,
      text: Array.from({ length: addRows }, () => emptyRowSource(table.delimiter.separator, columnCount)).join("")
    });
  }
  return applyReplacements(table.raw, replacements);
}

function rowContentEndOffset(rowRaw: string, rowEndOffset: number): number {
  if (rowRaw.endsWith("\r\n")) {
    return rowEndOffset - 2;
  }
  if (rowRaw.endsWith("\n") || rowRaw.endsWith("\r")) {
    return rowEndOffset - 1;
  }
  return rowEndOffset;
}

function key(row: number, col: number): string {
  return `${row}:${col}`;
}

function cellOrdinal(table: LosslessTable, sourceCellId: string): { rowOrdinal: number; cellOrdinal: number } | undefined {
  for (let rowOrdinal = 0; rowOrdinal < table.rows.length; rowOrdinal += 1) {
    const cellOrdinal = table.rows[rowOrdinal].cells.findIndex((cell) => cell.nodeId === sourceCellId);
    if (cellOrdinal >= 0) {
      return { rowOrdinal, cellOrdinal };
    }
  }
  return undefined;
}

function tableLocalEol(source: string, startOffset: number, endOffset: number): string {
  const before = Array.from(source.slice(0, startOffset).matchAll(/\r\n|\n|\r/gu)).at(-1)?.[0];
  if (before !== undefined) {
    return before;
  }
  return source.slice(endOffset).match(/\r\n|\n|\r/u)?.[0] ?? "\n";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
