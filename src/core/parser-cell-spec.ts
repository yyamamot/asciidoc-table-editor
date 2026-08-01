import type { LosslessTableCell, TableColumnSpec, TableDiagnostic } from "./types";
import { range, type SourcePositionIndex } from "./parser-source";
import { isKnownCellStyle } from "./cell-style";

export function parseRowCells(
  source: string,
  lineText: string,
  lineOffset: number,
  rowIndex: number,
  startCellIndex: number,
  startColumnIndex: number,
  separator: string,
  columns: readonly TableColumnSpec[],
  positionIndex: SourcePositionIndex
): LosslessTableCell[] {
  const markers = scanCellMarkers(lineText, separator);
  const cells: LosslessTableCell[] = [];
  let logicalColumn = startColumnIndex;

  for (const [index, marker] of markers.entries()) {
    const nextMarker = markers[index + 1];
    const rawEndColumn = nextMarker?.markerStart ?? lineText.length;
    const rawStartOffset = lineOffset + marker.specStart;
    const rawEndOffset = lineOffset + rawEndColumn;
    const parsedSpec = parseCellSpec(marker.cellSpecRaw, source, rawStartOffset, positionIndex);
    const contentStartColumn = marker.delimiterColumn + 1;
    const duplicateCount = parsedSpec.duplicateCount;
    const duplicateGroupId = duplicateCount > 1 ? `duplicate:${rowIndex}:${startCellIndex + cells.length}` : undefined;
    const baseCell = {
      kind: "cell" as const,
      raw: source.slice(rawStartOffset, rawEndOffset),
      range: range(positionIndex, rawStartOffset, rawEndOffset),
      cellSpecRaw: marker.cellSpecRaw,
      delimiterRaw: separator,
      contentRaw: lineText.slice(contentStartColumn, rawEndColumn),
      rowSpan: parsedSpec.rowSpan,
      colSpan: parsedSpec.colSpan,
      style: parsedSpec.style,
      horizontalAlign: parsedSpec.horizontalAlign,
      verticalAlign: parsedSpec.verticalAlign,
      errors: parsedSpec.errors
    };

    for (let duplicateIndex = 0; duplicateIndex < duplicateCount; duplicateIndex += 1) {
      const column = columns[logicalColumn];
      const effectiveStyle = parsedSpec.style ?? column?.style;
      const effectiveHorizontalAlign = parsedSpec.horizontalAlign ?? column?.horizontalAlign;
      const effectiveVerticalAlign = parsedSpec.verticalAlign ?? column?.verticalAlign;
      cells.push({
        ...baseCell,
        nodeId: `cell:${rowIndex}:${startCellIndex + cells.length}`,
        style: parsedSpec.style,
        horizontalAlign: parsedSpec.horizontalAlign,
        verticalAlign: parsedSpec.verticalAlign,
        effectiveStyle,
        effectiveHorizontalAlign,
        effectiveVerticalAlign,
        isBlockContent: effectiveStyle === "a",
        duplicateCount: duplicateCount > 1 ? duplicateCount : undefined,
        duplicateIndex: duplicateCount > 1 ? duplicateIndex : undefined,
        duplicateGroupId
      });
      logicalColumn += parsedSpec.colSpan;
    }
  }

  return cells;
}

export function spanWidth(cells: readonly LosslessTableCell[]): number {
  return cells.reduce((sum, cell) => sum + cell.colSpan, 0);
}

function scanCellMarkers(lineText: string, separator: string): Array<{ markerStart: number; specStart: number; delimiterColumn: number; cellSpecRaw: string }> {
  const markers: Array<{ markerStart: number; specStart: number; delimiterColumn: number; cellSpecRaw: string }> = [];
  for (let column = 0; column < lineText.length; column += 1) {
    if (lineText[column] !== separator || lineText[column - 1] === "\\") {
      continue;
    }

    const specStart = cellSpecStart(lineText, column);
    const cellSpecRaw = lineText.slice(specStart, column);
    const hasBoundary = cellSpecRaw.length === 0 || specStart === 0 || /\s/u.test(lineText[specStart - 1]);
    if (!hasBoundary || !isCellSpecCandidate(cellSpecRaw)) {
      markers.push({
        markerStart: column,
        specStart: column,
        delimiterColumn: column,
        cellSpecRaw: ""
      });
      continue;
    }

    markers.push({
      markerStart: specStart === 0 ? specStart : specStart - 1,
      specStart,
      delimiterColumn: column,
      cellSpecRaw
    });
  }
  return markers;
}

function cellSpecStart(lineText: string, delimiterColumn: number): number {
  let specStart = delimiterColumn;
  while (specStart > 0 && !/\s/u.test(lineText[specStart - 1])) {
    specStart -= 1;
  }
  return specStart;
}

function isCellSpecCandidate(value: string): boolean {
  return /^[0-9.*+<>^a-z]*$/u.test(value);
}

function parseCellSpec(
  cellSpecRaw: string,
  source: string,
  rawStartOffset: number,
  positionIndex: SourcePositionIndex
): {
  rowSpan: number;
  colSpan: number;
  style?: string;
  horizontalAlign?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  errors: TableDiagnostic[];
  duplicateCount: number;
} {
  const errors: TableDiagnostic[] = [];
  let rowSpan = 1;
  let colSpan = 1;
  let duplicateCount = 1;
  let style: string | undefined;
  let horizontalAlign: "left" | "center" | "right" | undefined;
  let verticalAlign: "top" | "middle" | "bottom" | undefined;
  let remaining = cellSpecRaw;

  const duplicateMatch = remaining.match(/^(\d+)\*/u);
  if (duplicateMatch) {
    duplicateCount = Math.max(1, Number.parseInt(duplicateMatch[1], 10));
    remaining = remaining.slice(duplicateMatch[0].length);
    if (remaining.includes("+")) {
      errors.push({
        code: "cell.spec.duplicate-unsupported",
        severity: "error",
        message: `Unsupported mixed duplicate cell spec: ${cellSpecRaw}`,
        range: range(positionIndex, rawStartOffset, rawStartOffset + cellSpecRaw.length)
      });
      duplicateCount = 1;
      remaining = remaining.replace(/\*/gu, "");
    }
  } else if (remaining.includes("*")) {
    errors.push({
      code: "cell.spec.duplicate-unsupported",
      severity: "error",
      message: `Unsupported mixed duplicate cell spec: ${remaining}`,
      range: range(positionIndex, rawStartOffset, rawStartOffset + cellSpecRaw.length)
    });
    remaining = remaining.replace(/\*/gu, "");
  }

  const spanMatch = remaining.match(/^(\d+)?(?:\.(\d+))?\+/);
  if (spanMatch) {
    if (spanMatch[1] !== undefined) {
      colSpan = Number.parseInt(spanMatch[1], 10);
    }
    if (spanMatch[2] !== undefined) {
      rowSpan = Number.parseInt(spanMatch[2], 10);
    }
    remaining = remaining.slice(spanMatch[0].length);
  }

  const rowOnlySpanMatch = remaining.match(/^\.(\d+)\+/);
  if (rowOnlySpanMatch) {
    rowSpan = Number.parseInt(rowOnlySpanMatch[1], 10);
    remaining = remaining.slice(rowOnlySpanMatch[0].length);
  }

  const styleMatch = remaining.match(/([a-z])$/);
  if (styleMatch && isKnownCellStyle(styleMatch[1])) {
    style = styleMatch[1];
    remaining = remaining.slice(0, -1);
  }

  const verticalAlignMatch = remaining.match(/\.([<^>])/u);
  if (verticalAlignMatch) {
    verticalAlign = alignValue(verticalAlignMatch[1], "vertical");
    remaining = remaining.replace(verticalAlignMatch[0], "");
  }

  const horizontalAlignMatch = remaining.match(/[<^>]/u);
  if (horizontalAlignMatch) {
    horizontalAlign = alignValue(horizontalAlignMatch[0], "horizontal");
    remaining = remaining.replace(horizontalAlignMatch[0], "");
  }

  if (remaining.length > 0) {
    errors.push({
      code: "cell.spec.unsupported",
      severity: "warning",
      message: `Unsupported cell spec segment: ${remaining}`,
      range: range(positionIndex, rawStartOffset, rawStartOffset + cellSpecRaw.length)
    });
  }

  return {
    rowSpan: normalizeSpan(rowSpan),
    colSpan: normalizeSpan(colSpan),
    style,
    horizontalAlign,
    verticalAlign,
    errors,
    duplicateCount
  };
}

function alignValue(value: string, axis: "horizontal"): "left" | "center" | "right";
function alignValue(value: string, axis: "vertical"): "top" | "middle" | "bottom";
function alignValue(value: string, axis: "horizontal" | "vertical"): "left" | "center" | "right" | "top" | "middle" | "bottom" {
  if (axis === "horizontal") {
    return value === "<" ? "left" : value === "^" ? "center" : "right";
  }
  return value === "<" ? "top" : value === "^" ? "middle" : "bottom";
}

function normalizeSpan(value: number): number {
  return Number.isInteger(value) && value > 0 ? value : 1;
}
