import type { SourcePosition, SourceRange } from "./types";

export type SourceLine = { index: number; offset: number; text: string; raw: string };

export interface SourcePositionIndex {
  readonly lineStarts: readonly number[];
}

export function createSourcePositionIndex(source: string): SourcePositionIndex {
  const lineStarts = [0];
  for (let offset = 0; offset < source.length; offset += 1) {
    if (source[offset] === "\n") {
      lineStarts.push(offset + 1);
    }
  }
  return { lineStarts };
}

export function splitLines(source: string): SourceLine[] {
  const lines: SourceLine[] = [];
  const linePattern = /.*(?:\r\n|\n|\r|$)/g;
  let index = 0;

  for (const match of source.matchAll(linePattern)) {
    const raw = match[0];
    if (raw.length === 0) {
      continue;
    }

    lines.push({
      index,
      offset: match.index,
      text: raw.replace(/\r\n|\n|\r$/, ""),
      raw
    });
    index += 1;
  }

  return lines;
}

export function range(index: SourcePositionIndex, start: number, end: number): SourceRange {
  return {
    start: positionAt(index, start),
    end: positionAt(index, end)
  };
}

export function positionAt(index: SourcePositionIndex, offset: number): SourcePosition {
  let low = 0;
  let high = index.lineStarts.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (index.lineStarts[middle] <= offset) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  const line = Math.max(0, low - 1);
  return { offset, line, column: offset - index.lineStarts[line] };
}
