import type { LosslessTableCell, TableColumnSpec, TableDocument } from "./types";
import { openDelimitedBlockDelimiter } from "./parser-blocks";
import { parseRowCells, spanWidth } from "./parser-cell-spec";
import { positionAt, type SourceLine } from "./parser-source";

export function parseBodyRows(
  source: string,
  bodyLines: SourceLine[],
  options: { columns: readonly TableColumnSpec[]; expectedColumnCount?: number; separator: string }
): TableDocument["rows"] {
  const firstNonEmptyLine = bodyLines.find((line) => line.text.trim().length > 0);
  if (firstNonEmptyLine === undefined) {
    return [];
  }

  const expectedColumnCount = Math.max(
    1,
    options.expectedColumnCount ??
      spanWidth(parseRowCells(source, firstNonEmptyLine.text, firstNonEmptyLine.offset, 0, 0, 0, options.separator, options.columns))
  );
  const rows: TableDocument["rows"] = [];
  let activeRowSpans: number[] = [];
  let current:
    | {
        rowIndex: number;
        startOffset: number;
        endOffset: number;
        cells: LosslessTableCell[];
        occupied: boolean[];
      }
    | undefined;

  const startRow = (line: { offset: number }): NonNullable<typeof current> => ({
    rowIndex: rows.length,
    startOffset: line.offset,
    endOffset: line.offset,
    cells: [],
    occupied: activeRowSpans.map((span) => span > 0)
  });

  const isInsideTrailingBlockCellDelimitedBlock = (line: { text: string }): boolean => {
    const trailingCell = current?.cells.at(-1);
    if (trailingCell === undefined || !trailingCell.isBlockContent) {
      return false;
    }
    const delimiter = openDelimitedBlockDelimiter(trailingCell.contentRaw);
    return delimiter !== undefined && line.text.trim() !== delimiter;
  };

  const placeCell = (occupied: boolean[], cell: LosslessTableCell): void => {
    let col = 0;
    while (occupied[col]) {
      col += 1;
    }
    for (let offset = 0; offset < cell.colSpan; offset += 1) {
      occupied[col + offset] = true;
    }
  };

  const flush = (): void => {
    if (current === undefined) {
      return;
    }
    for (const cell of current.cells) {
      const delimiter = cell.isBlockContent ? openDelimitedBlockDelimiter(cell.contentRaw) : undefined;
      if (delimiter !== undefined) {
        cell.errors.push({
          code: "block-cell.unclosed-delimited-block",
          severity: "error",
          message: `Block cell ${cell.nodeId} has an unclosed ${delimiter} block`,
          nodeId: cell.nodeId,
          range: cell.range
        });
      }
    }
    rows.push({
      nodeId: `row:${current.rowIndex}`,
      kind: "row",
      role: "body",
      raw: source.slice(current.startOffset, current.endOffset),
      range: {
        start: positionAt(source, current.startOffset),
        end: positionAt(source, current.endOffset)
      },
      cells: current.cells,
      retained: [],
      errors: []
    });

    const nextActiveSpans = activeRowSpans.map((span) => Math.max(0, span - 1));
    const occupied = activeRowSpans.map((span) => span > 0);
    for (const cell of current.cells) {
      let col = 0;
      while (occupied[col]) {
        col += 1;
      }
      for (let offset = 0; offset < cell.colSpan; offset += 1) {
        occupied[col + offset] = true;
        nextActiveSpans[col + offset] = Math.max(nextActiveSpans[col + offset] ?? 0, cell.rowSpan - 1);
      }
    }
    activeRowSpans = nextActiveSpans;
    current = undefined;
  };
  const rowComplete = (): boolean => (current?.occupied.filter(Boolean).length ?? 0) >= expectedColumnCount;
  const nextOpenColumn = (): number => {
    let col = 0;
    while (current?.occupied[col]) {
      col += 1;
    }
    return col;
  };
  const appendContinuationToTrailingBlockCell = (line: { offset: number; text: string; raw: string }): boolean => {
    const trailingCell = current?.cells.at(-1);
    if (current === undefined || trailingCell === undefined || !trailingCell.isBlockContent) {
      return false;
    }

    const endOffset = line.text.length === 0 ? line.offset + line.raw.length : line.offset + line.text.length;
    const continuation = source.slice(trailingCell.range.end.offset, endOffset);
    trailingCell.raw += continuation;
    trailingCell.contentRaw += continuation;
    trailingCell.range.end = positionAt(source, endOffset);
    current.endOffset = line.offset + line.raw.length;
    return true;
  };
  const trailingPlainCellWantsHardBreakContinuation = (): boolean => {
    const trailingCell = current?.cells.at(-1);
    return trailingCell !== undefined && !trailingCell.isBlockContent && trailingCell.contentRaw.trimEnd().endsWith("+");
  };
  const appendContinuationToTrailingPlainCell = (line: { offset: number; text: string; raw: string }): boolean => {
    const trailingCell = current?.cells.at(-1);
    if (current === undefined || trailingCell === undefined || trailingCell.isBlockContent || !trailingPlainCellWantsHardBreakContinuation()) {
      return false;
    }

    const endOffset = line.text.length === 0 ? line.offset + line.raw.length : line.offset + line.text.length;
    const continuation = source.slice(trailingCell.range.end.offset, endOffset);
    trailingCell.raw += continuation;
    trailingCell.contentRaw += continuation;
    trailingCell.range.end = positionAt(source, endOffset);
    current.endOffset = line.offset + line.raw.length;
    return true;
  };

  for (const line of bodyLines) {
    if (line.text.trim().length === 0) {
      if (appendContinuationToTrailingBlockCell(line)) {
        continue;
      }
      if (rowComplete()) {
        flush();
      }
      continue;
    }
    current ??= startRow(line);
    if (isInsideTrailingBlockCellDelimitedBlock(line) && appendContinuationToTrailingBlockCell(line)) {
      continue;
    }
    let cells = parseRowCells(source, line.text, line.offset, current.rowIndex, current.cells.length, nextOpenColumn(), options.separator, options.columns);
    if (cells.length > 0 && rowComplete()) {
      flush();
      current = startRow(line);
      cells = parseRowCells(source, line.text, line.offset, current.rowIndex, current.cells.length, nextOpenColumn(), options.separator, options.columns);
    }
    if (cells.length === 0 && appendContinuationToTrailingPlainCell(line)) {
      if (rowComplete() && !trailingPlainCellWantsHardBreakContinuation()) {
        flush();
      }
      continue;
    }
    if (cells.length === 0 && appendContinuationToTrailingBlockCell(line)) {
      continue;
    }
    current.cells.push(...cells);
    current.endOffset = line.offset + line.raw.length;
    for (const cell of cells) {
      placeCell(current.occupied, cell);
    }
    const lastCell = current.cells.at(-1);
    if (rowComplete() && lastCell?.isBlockContent !== true && !trailingPlainCellWantsHardBreakContinuation()) {
      flush();
    }
  }

  flush();
  return rows;
}

