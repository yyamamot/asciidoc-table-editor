import type { SourcePosition, SourceRange } from "./types";

export type SourceLine = { index: number; offset: number; text: string; raw: string };

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

export function range(source: string, start: number, end: number): SourceRange {
  return {
    start: positionAt(source, start),
    end: positionAt(source, end)
  };
}

export function positionAt(source: string, offset: number): SourcePosition {
  let line = 0;
  let column = 0;
  for (let index = 0; index < offset; index += 1) {
    const char = source[index];
    if (char === "\n") {
      line += 1;
      column = 0;
    } else {
      column += 1;
    }
  }
  return { offset, line, column };
}

