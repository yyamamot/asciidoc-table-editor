import type { SourceRange } from "./types";
import { tableDelimiterRaw } from "./table-delimiter";

export interface TableBlockMatch {
  raw: string;
  range: SourceRange;
}

export function findAsciiDocTableBlocks(source: string): TableBlockMatch[] {
  const lines = splitLines(source);
  const blocks: TableBlockMatch[] = [];
  let startIndex = -1;
  let startDelimiterRaw: string | undefined;
  let skippedDelimitedBlock: string | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].text.trim();
    if (skippedDelimitedBlock !== undefined) {
      if (trimmed === skippedDelimitedBlock) {
        skippedDelimitedBlock = undefined;
      }
      continue;
    }

    const delimitedBlock = tableOpaqueDelimitedBlock(trimmed);
    if (delimitedBlock !== undefined) {
      skippedDelimitedBlock = delimitedBlock;
      continue;
    }

    const delimiterRaw = tableDelimiterRaw(trimmed);
    if (delimiterRaw === undefined) {
      continue;
    }

    if (startIndex === -1) {
      startIndex = index;
      startDelimiterRaw = delimiterRaw;
      continue;
    }

    if (delimiterRaw !== startDelimiterRaw) {
      continue;
    }

    const rawStartIndex = tableMetadataStartIndex(lines, startIndex);
    const startOffset = lines[rawStartIndex].offset;
    const endOffset = lines[index].offset + lines[index].raw.length;
    blocks.push({
      raw: source.slice(startOffset, endOffset),
      range: {
        start: {
          offset: startOffset,
          line: rawStartIndex,
          column: 0
        },
        end: endPositionForLine(lines[index], index, endOffset)
      }
    });
    startIndex = -1;
    startDelimiterRaw = undefined;
  }

  return blocks;
}

export function findAsciiDocTableBlock(source: string, cursorOffset: number): TableBlockMatch | undefined {
  return findAsciiDocTableBlocks(source).find((block) =>
    block.range.start.offset <= cursorOffset && cursorOffset <= block.range.end.offset
  );
}

function tableMetadataStartIndex(lines: Array<{ text: string }>, delimiterIndex: number): number {
  let index = delimiterIndex;
  while (index > 0) {
    const previous = lines[index - 1].text.trim();
    if (!isTableMetadataLine(previous)) {
      break;
    }
    index -= 1;
  }
  return index;
}

function isTableMetadataLine(text: string | undefined): boolean {
  if (text === undefined || text.length === 0) {
    return false;
  }
  return (text.startsWith("[") && text.endsWith("]")) || text.startsWith(".");
}

function tableOpaqueDelimitedBlock(text: string): string | undefined {
  if (/^-{4,}$/.test(text) || /^\.{4,}$/.test(text) || /^_{4,}$/.test(text) || /^\+{4,}$/.test(text) || /^\*{4,}$/.test(text)) {
    return text;
  }
  return undefined;
}

function splitLines(source: string): Array<{ offset: number; text: string; raw: string }> {
  const lines: Array<{ offset: number; text: string; raw: string }> = [];
  const linePattern = /.*(?:\r\n|\n|\r|$)/g;
  for (const match of source.matchAll(linePattern)) {
    const raw = match[0];
    if (raw.length === 0) {
      continue;
    }
    lines.push({
      offset: match.index,
      text: raw.replace(/\r\n|\n|\r$/, ""),
      raw
    });
  }
  return lines;
}

function endPositionForLine(line: { text: string; raw: string }, lineIndex: number, offset: number): SourceRange["end"] {
  return /\r\n$|\n$|\r$/u.test(line.raw)
    ? {
        offset,
        line: lineIndex + 1,
        column: 0
      }
    : {
        offset,
        line: lineIndex,
        column: line.text.length
      };
}
