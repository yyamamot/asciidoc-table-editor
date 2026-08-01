import type { LosslessTableCell, TableColumnSpec, TableDocument } from "./types";
import { openDelimitedBlockDelimiter } from "./parser-blocks";
import { parseRowCells, spanWidth } from "./parser-cell-spec";
import { commentLineIndexes, materializeRetainedSegments } from "./parser-retained";
import { positionAt, type SourceLine } from "./parser-source";

export function parseBodyRows(
  source: string,
  bodyLines: SourceLine[],
  options: { columns: readonly TableColumnSpec[]; expectedColumnCount?: number; separator: string }
): TableDocument["rows"] {
  const commentLines = commentLineIndexes(bodyLines);
  const firstCellLine = bodyLines.find(
    (line) =>
      line.text.trim().length > 0 &&
      !commentLines.has(line.index) &&
      parseRowCells(source, line.text, line.offset, 0, 0, 0, options.separator, options.columns).length > 0
  );
  if (firstCellLine === undefined) {
    return [];
  }

  const expectedColumnCount = Math.max(
    1,
    options.expectedColumnCount ??
      spanWidth(parseRowCells(source, firstCellLine.text, firstCellLine.offset, 0, 0, 0, options.separator, options.columns))
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
  let pendingPlainContinuationBlankLines: SourceLine[] = [];
  const tableCommentDelimiterStack: string[] = [];

  const startRow = (line: { offset: number }): NonNullable<typeof current> => ({
    rowIndex: rows.length,
    startOffset: line.offset,
    endOffset: line.offset,
    cells: [],
    occupied: activeRowSpans.map((span) => span > 0)
  });

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
    pendingPlainContinuationBlankLines = [];
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
      retained: materializeRetainedSegments(
        source,
        { start: current.startOffset, end: current.endOffset },
        current.cells
          .filter((cell) => cell.duplicateIndex === undefined || cell.duplicateIndex === 0)
          .map((cell) => ({ start: cell.range.start.offset, end: cell.range.end.offset })),
        `retained:row:${current.rowIndex}`
      ),
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
  const canContinueTrailingPlainCell = (): boolean => {
    const trailingCell = current?.cells.at(-1);
    return current !== undefined && trailingCell !== undefined && !trailingCell.isBlockContent;
  };
  const appendContinuationToTrailingPlainCell = (
    line: { offset: number; text: string; raw: string },
    options: { requireHardBreak: boolean }
  ): boolean => {
    const trailingCell = current?.cells.at(-1);
    if (
      current === undefined ||
      trailingCell === undefined ||
      trailingCell.isBlockContent ||
      (options.requireHardBreak && !trailingPlainCellWantsHardBreakContinuation())
    ) {
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
  const appendPendingPlainContinuationBlankLines = (): void => {
    if (pendingPlainContinuationBlankLines.length === 0) {
      return;
    }
    for (const blankLine of pendingPlainContinuationBlankLines) {
      appendContinuationToTrailingPlainCell(blankLine, { requireHardBreak: false });
    }
    pendingPlainContinuationBlankLines = [];
  };

  for (const line of bodyLines) {
    const trailingBlockCell = current?.cells.at(-1);
    if (trailingBlockCell?.isBlockContent) {
      const openDelimiter = openDelimitedBlockDelimiter(trailingBlockCell.contentRaw);
      if (
        (openDelimiter !== undefined || isCommentStartLine(line)) &&
        appendContinuationToTrailingBlockCell(line)
      ) {
        continue;
      }
    }
    if (updateCommentDelimiterStack(line, tableCommentDelimiterStack)) {
      if (rowComplete()) {
        flush();
      } else if (current !== undefined) {
        current.endOffset = line.offset + line.raw.length;
      }
      continue;
    }
    if (line.text.trim().length === 0) {
      if (appendContinuationToTrailingBlockCell(line)) {
        continue;
      }
      if (rowComplete() && canContinueTrailingPlainCell()) {
        pendingPlainContinuationBlankLines.push(line);
        continue;
      }
      if (rowComplete()) {
        flush();
      } else if (current !== undefined) {
        current.endOffset = line.offset + line.raw.length;
      }
      continue;
    }
    if (current === undefined) {
      const candidate = startRow(line);
      const cells = parseRowCells(source, line.text, line.offset, candidate.rowIndex, 0, firstOpenColumn(candidate.occupied), options.separator, options.columns);
      if (cells.length === 0) {
        continue;
      }
      current = candidate;
      current.cells.push(...cells);
      current.endOffset = line.offset + line.raw.length;
      for (const cell of cells) {
        placeCell(current.occupied, cell);
      }
      continue;
    }

    let cells = parseRowCells(source, line.text, line.offset, current.rowIndex, current.cells.length, nextOpenColumn(), options.separator, options.columns);
    if (cells.length > 0 && rowComplete()) {
      pendingPlainContinuationBlankLines = [];
      flush();
      current = startRow(line);
      cells = parseRowCells(source, line.text, line.offset, current.rowIndex, current.cells.length, nextOpenColumn(), options.separator, options.columns);
    }
    if (cells.length === 0 && (trailingPlainCellWantsHardBreakContinuation() || canContinueTrailingPlainCell())) {
      appendPendingPlainContinuationBlankLines();
      if (
        appendContinuationToTrailingPlainCell(line, { requireHardBreak: true }) ||
        appendContinuationToTrailingPlainCell(line, { requireHardBreak: false })
      ) {
        continue;
      }
    }
    if (cells.length === 0 && appendContinuationToTrailingBlockCell(line)) {
      continue;
    }
    current.cells.push(...cells);
    current.endOffset = line.offset + line.raw.length;
    for (const cell of cells) {
      placeCell(current.occupied, cell);
    }
  }

  flush();
  return rows;
}

function firstOpenColumn(occupied: readonly boolean[]): number {
  let column = 0;
  while (occupied[column]) {
    column += 1;
  }
  return column;
}

function isCommentStartLine(line: Pick<SourceLine, "text">): boolean {
  const trimmed = line.text.trim();
  return trimmed.startsWith("//") || /^\/{4,}$/u.test(trimmed);
}

function updateCommentDelimiterStack(line: Pick<SourceLine, "text">, stack: string[]): boolean {
  const trimmed = line.text.trim();
  const delimiter = /^\/{4,}$/u.test(trimmed) ? trimmed : undefined;
  if (stack.length > 0) {
    if (delimiter !== undefined) {
      if (delimiter === stack.at(-1)) {
        stack.pop();
      } else {
        stack.push(delimiter);
      }
    }
    return true;
  }
  if (delimiter !== undefined) {
    stack.push(delimiter);
    return true;
  }
  return trimmed.startsWith("//");
}
