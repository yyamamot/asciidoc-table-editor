import type { RetainedSegment } from "./types";
import { range, splitLines, type SourceLine } from "./parser-source";

interface OffsetRange {
  readonly start: number;
  readonly end: number;
}

interface ExplicitRetainedRange extends OffsetRange {
  readonly kind: RetainedSegment["kind"];
}

interface RetainedCandidate extends OffsetRange {
  readonly kind: RetainedSegment["kind"];
}

export function materializeRetainedSegments(
  source: string,
  scope: OffsetRange,
  ownedRanges: readonly OffsetRange[],
  nodeIdPrefix: string,
  explicitRanges: readonly ExplicitRetainedRange[] = []
): RetainedSegment[] {
  const explicit = explicitRanges
    .map((entry) => clippedCandidate(entry, scope))
    .filter((entry): entry is RetainedCandidate => entry !== undefined);
  const occupied = [...ownedRanges, ...explicitRanges]
    .map((entry) => clipRange(entry, scope))
    .filter((entry): entry is OffsetRange => entry !== undefined)
    .sort(compareRanges);
  const candidates: RetainedCandidate[] = [...explicit];
  let cursor = scope.start;

  for (const owner of occupied) {
    if (owner.start > cursor) {
      candidates.push(...classifyGap(source, cursor, owner.start));
    }
    cursor = Math.max(cursor, owner.end);
  }
  if (cursor < scope.end) {
    candidates.push(...classifyGap(source, cursor, scope.end));
  }

  return candidates
    .sort(compareRanges)
    .map((candidate, index) => ({
      nodeId: `${nodeIdPrefix}:${index}`,
      kind: candidate.kind,
      raw: source.slice(candidate.start, candidate.end),
      range: range(source, candidate.start, candidate.end)
    }));
}

export function commentLineIndexes(lines: readonly SourceLine[]): ReadonlySet<number> {
  const commentLines = new Set<number>();
  const delimiterStack: string[] = [];

  for (const line of lines) {
    const trimmed = line.text.trim();
    const delimiter = /^\/{4,}$/u.test(trimmed) ? trimmed : undefined;
    if (delimiterStack.length > 0) {
      commentLines.add(line.index);
      if (delimiter !== undefined) {
        if (delimiter === delimiterStack.at(-1)) {
          delimiterStack.pop();
        } else {
          delimiterStack.push(delimiter);
        }
      }
      continue;
    }
    if (delimiter !== undefined) {
      commentLines.add(line.index);
      delimiterStack.push(delimiter);
      continue;
    }
    if (trimmed.startsWith("//")) {
      commentLines.add(line.index);
    }
  }

  return commentLines;
}

function classifyGap(source: string, start: number, end: number): RetainedCandidate[] {
  const gap = source.slice(start, end);
  const lines = splitLines(gap);
  const commentLines = commentLineIndexes(lines);
  return lines.map((line) => {
    const lineStart = start + line.offset;
    const lineEnd = lineStart + line.raw.length;
    const completeLine = isLineStart(source, lineStart) && (hasLineEnding(line.raw) || lineEnd === source.length);
    return {
      start: lineStart,
      end: lineEnd,
      kind: completeLine ? classifyCompleteLine(line.text, commentLines.has(line.index)) : "raw"
    };
  });
}

function classifyCompleteLine(text: string, comment: boolean): RetainedSegment["kind"] {
  const trimmed = text.trim();
  if (comment) {
    return "comment";
  }
  if (trimmed.length === 0) {
    return "blank";
  }
  return "unknown";
}

function hasLineEnding(raw: string): boolean {
  return /(?:\r\n|\n|\r)$/u.test(raw);
}

function isLineStart(source: string, offset: number): boolean {
  if (offset === 0) {
    return true;
  }
  const previous = source[offset - 1];
  if (previous === "\n") {
    return true;
  }
  return previous === "\r" && source[offset] !== "\n";
}

function clippedCandidate(entry: ExplicitRetainedRange, scope: OffsetRange): RetainedCandidate | undefined {
  const clipped = clipRange(entry, scope);
  return clipped === undefined ? undefined : { ...clipped, kind: entry.kind };
}

function clipRange(entry: OffsetRange, scope: OffsetRange): OffsetRange | undefined {
  const start = Math.max(scope.start, entry.start);
  const end = Math.min(scope.end, entry.end);
  return start < end ? { start, end } : undefined;
}

function compareRanges(left: OffsetRange, right: OffsetRange): number {
  return left.start - right.start || left.end - right.end;
}
