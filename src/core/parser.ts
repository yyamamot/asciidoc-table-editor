import type {
  LosslessTableCell,
  LosslessTableRow,
  SourcePosition,
  SourceRange,
  TableAttributes,
  TableColumnSpec,
  TableDiagnostic,
  TableDocument
} from "./types";

export function parseAsciiDocTable(source: string): TableDocument {
  const lines = splitLines(source);
  const startLine = lines.find((line) => line.text.trim() === "|===");
  const endLine = [...lines].reverse().find((line) => line.text.trim() === "|===" && line.index !== startLine?.index);
  const errors: TableDiagnostic[] = [];
  const attributes = parseTableAttributes(lines, startLine?.index ?? -1);
  const separator = attributes.separator ?? "|";

  if (startLine === undefined) {
    errors.push({
      code: "table.block.unopened",
      severity: "error",
      message: "Table start delimiter was not found"
    });
  }

  if (endLine === undefined) {
    errors.push({
      code: "table.block.unclosed",
      severity: "error",
      message: "Table end delimiter was not found"
    });
  }

  if (attributes.format !== undefined && attributes.format !== "psv") {
    errors.push({
      code: "table.format.unsupported",
      severity: "error",
      message: `Table format ${attributes.format} is not supported by the structured editor`
    });
  }

  const bodyLines =
    startLine !== undefined && endLine !== undefined && startLine.index < endLine.index
      ? lines.slice(startLine.index + 1, endLine.index)
      : [];

  const rows = attributes.format !== undefined && attributes.format !== "psv"
    ? []
    : applyRowRoles(
        parseBodyRows(source, bodyLines, { columns: attributes.columns, expectedColumnCount: attributes.columnCount, separator }),
        bodyLines,
        attributes,
        separator,
        source
      );

  return {
    nodeId: "table:0",
    kind: "table",
    raw: source,
    range: {
      start: positionAt(source, 0),
      end: positionAt(source, source.length)
    },
    delimiter: {
      startRaw: startLine?.text ?? "",
      endRaw: endLine?.text ?? "",
      separator
    },
    attributes,
    rows,
    retained: [],
    errors
  };
}

function parseBodyRows(
  source: string,
  bodyLines: Array<{ index: number; offset: number; text: string; raw: string }>,
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

  for (const line of bodyLines) {
    if (line.text.trim().length === 0) {
      if (appendContinuationToTrailingBlockCell(line)) {
        continue;
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
    if (cells.length === 0 && appendContinuationToTrailingBlockCell(line)) {
      continue;
    }
    current.cells.push(...cells);
    current.endOffset = line.offset + line.raw.length;
    for (const cell of cells) {
      placeCell(current.occupied, cell);
    }
    const lastCell = current.cells.at(-1);
    if (rowComplete() && lastCell?.isBlockContent !== true) {
      flush();
    }
  }

  flush();
  return rows;
}

function openDelimitedBlockDelimiter(contentRaw: string): string | undefined {
  const stack: string[] = [];
  for (const line of contentRaw.split(/\r\n|\n|\r/u)) {
    const delimiter = blockDelimiter(line.trim());
    if (delimiter === undefined) {
      continue;
    }
    if (stack.at(-1) === delimiter) {
      stack.pop();
    } else {
      stack.push(delimiter);
    }
  }
  return stack.at(-1);
}

function blockDelimiter(line: string): string | undefined {
  return new Set(["----", "....", "====", "____", "****", "++++", "////", "--"]).has(line) ? line : undefined;
}

function applyRowRoles(
  rows: TableDocument["rows"],
  bodyLines: Array<{ index: number; offset: number; text: string; raw: string }>,
  attributes: TableAttributes,
  separator: string,
  source: string
): TableDocument["rows"] {
  if (rows.length === 0) {
    return rows;
  }

  const options = new Set(attributes.options);
  const explicitHeader = options.has("header");
  const noHeader = options.has("noheader");
  const hasFooter = options.has("footer");
  const hasHeader = explicitHeader || (!noHeader && isImplicitHeader(rows[0], bodyLines, attributes.columnCount, separator, source));
  const footerIndex = hasFooter && rows.length > 1 ? rows.length - 1 : -1;

  return rows.map((row, index) => ({
    ...row,
    role: index === 0 && hasHeader ? "header" : index === footerIndex ? "footer" : "body"
  }));
}

function isImplicitHeader(
  firstRow: LosslessTableRow,
  bodyLines: Array<{ offset: number; text: string }>,
  columnCount: number | undefined,
  separator: string,
  source: string
): boolean {
  const firstBodyLine = bodyLines[0];
  const secondBodyLine = bodyLines[1];
  if (firstBodyLine === undefined || firstBodyLine.text.trim().length === 0 || secondBodyLine?.text.trim() !== "") {
    return false;
  }

  const firstLineCells = parseRowCells(source, firstBodyLine.text, firstBodyLine.offset, 0, 0, 0, separator, []);
  const expectedColumnCount = columnCount ?? spanWidth(firstLineCells);
  return firstRow.range.start.offset === firstBodyLine.offset &&
    firstRow.raw.trim() === firstBodyLine.text.trim() &&
    spanWidth(firstLineCells) === expectedColumnCount;
}

function parseRowCells(
  source: string,
  lineText: string,
  lineOffset: number,
  rowIndex: number,
  startCellIndex: number,
  startColumnIndex: number,
  separator: string,
  columns: readonly TableColumnSpec[]
): LosslessTableCell[] {
  const markers = scanCellMarkers(lineText, separator);
  const cells: LosslessTableCell[] = [];
  let logicalColumn = startColumnIndex;

  for (const [index, marker] of markers.entries()) {
    const nextMarker = markers[index + 1];
    const rawEndColumn = nextMarker?.markerStart ?? lineText.length;
    const rawStartOffset = lineOffset + marker.specStart;
    const rawEndOffset = lineOffset + rawEndColumn;
    const parsedSpec = parseCellSpec(marker.cellSpecRaw, source, rawStartOffset);
    const contentStartColumn = marker.delimiterColumn + 1;
    const duplicateCount = parsedSpec.duplicateCount;
    const duplicateGroupId = duplicateCount > 1 ? `duplicate:${rowIndex}:${startCellIndex + cells.length}` : undefined;
    const baseCell = {
      kind: "cell" as const,
      raw: source.slice(rawStartOffset, rawEndOffset),
      range: range(source, rawStartOffset, rawEndOffset),
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
        style: effectiveStyle,
        horizontalAlign: effectiveHorizontalAlign,
        verticalAlign: effectiveVerticalAlign,
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

function scanCellMarkers(lineText: string, separator: string): Array<{ markerStart: number; specStart: number; delimiterColumn: number; cellSpecRaw: string }> {
  const markers: Array<{ markerStart: number; specStart: number; delimiterColumn: number; cellSpecRaw: string }> = [];
  for (let column = 0; column < lineText.length; column += 1) {
    if (lineText[column] !== separator || lineText[column - 1] === "\\") {
      continue;
    }

    const specStart = cellSpecStart(lineText, column);
    const cellSpecRaw = lineText.slice(specStart, column);
    const hasBoundary = specStart === 0 || /\s/u.test(lineText[specStart - 1]);
    if (!hasBoundary || !isCellSpecCandidate(cellSpecRaw)) {
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

function spanWidth(cells: readonly LosslessTableCell[]): number {
  return cells.reduce((sum, cell) => sum + cell.colSpan, 0);
}

function parseTableAttributes(
  lines: Array<{ index: number; text: string }>,
  delimiterLineIndex: number
): TableAttributes {
  if (delimiterLineIndex <= 0) {
    return { options: [], columns: [] };
  }

  const attributeLine = [...lines.slice(0, delimiterLineIndex)]
    .reverse()
    .find((line) => line.text.trim().startsWith("[") && line.text.trim().endsWith("]"));
  if (attributeLine === undefined) {
    return { options: [], columns: [] };
  }

  const attributes = parseAttributeList(attributeLine.text.trim());
  const columns = parseColumnSpecs(attributes.get("cols"));
  return {
    columnCount: columns.length || parseColumnCount(attributes.get("cols")),
    format: attributes.get("format")?.toLowerCase(),
    separator: parseSeparator(attributes.get("separator")),
    options: parseOptions(attributes),
    columns
  };
}

function parseAttributeList(raw: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const content = raw.slice(1, -1);
  let currentKey: string | undefined;
  for (const part of splitAttributeParts(content)) {
    const trimmed = part.trim();
    if (trimmed.startsWith("%")) {
      const optionValues = trimmed.slice(1).split("%").map((value) => value.trim()).filter(Boolean);
      const existing = attributes.get("options");
      attributes.set("options", [...(existing ? splitAttributeParts(existing) : []), ...optionValues].join(","));
      currentKey = "options";
      continue;
    }

    const [key, ...valueParts] = part.split("=");
    if (valueParts.length === 0) {
      if (currentKey === "options" && trimmed.length > 0) {
        const existing = attributes.get("options");
        attributes.set("options", [existing, trimmed].filter(Boolean).join(","));
      }
      continue;
    }
    currentKey = key.trim();
    attributes.set(currentKey, unquote(valueParts.join("=").trim()));
  }
  return attributes;
}

function parseOptions(attributes: Map<string, string>): string[] {
  const raw = attributes.get("options");
  if (raw === undefined) {
    return [];
  }
  return splitAttributeParts(raw)
    .flatMap((part) => part.split(/\s+/u))
    .map((part) => part.trim().replace(/^%/u, "").toLowerCase())
    .filter(Boolean);
}

function parseColumnSpecs(value: string | undefined): TableColumnSpec[] {
  if (value === undefined) {
    return [];
  }

  const specs = splitAttributeParts(value).map((part) => part.trim()).filter(Boolean);
  const expanded = specs.flatMap((spec) => expandColumnSpec(spec));
  return expanded.map((spec, index) => parseColumnSpec(spec, index));
}

function expandColumnSpec(spec: string): string[] {
  const repeat = spec.match(/^(\d+)\*(.*)$/u);
  if (!repeat) {
    return [spec];
  }
  const count = Number.parseInt(repeat[1], 10);
  const repeatedSpec = repeat[2] || "";
  return Array.from({ length: count }, () => repeatedSpec);
}

function parseColumnSpec(raw: string, index: number): TableColumnSpec {
  const spec: TableColumnSpec = { index, raw };
  const widthMatch = raw.match(/^(\d+(?:\.\d+)?%?)/u);
  if (widthMatch) {
    spec.widthRaw = widthMatch[1];
  }

  if (raw.includes("<")) {
    spec.horizontalAlign = "left";
  } else if (raw.includes("^")) {
    spec.horizontalAlign = "center";
  } else if (raw.includes(">")) {
    spec.horizontalAlign = "right";
  }

  if (raw.includes(".<")) {
    spec.verticalAlign = "top";
  } else if (raw.includes(".^")) {
    spec.verticalAlign = "middle";
  } else if (raw.includes(".>")) {
    spec.verticalAlign = "bottom";
  }

  const styleMatch = raw.match(/[a-z]$/u);
  if (styleMatch) {
    spec.style = styleMatch[0];
  }
  return spec;
}

function splitAttributeParts(content: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: string | undefined;
  for (const character of content) {
    if ((character === "\"" || character === "'") && quote === undefined) {
      quote = character;
    } else if (character === quote) {
      quote = undefined;
    }

    if (character === "," && quote === undefined) {
      parts.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  parts.push(current);
  return parts;
}

function unquote(value: string): string {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function parseColumnCount(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const multiplier = value.match(/^(\d+)\*$/u);
  if (multiplier) {
    return Number.parseInt(multiplier[1], 10);
  }
  return splitAttributeParts(value).filter((part) => part.trim().length > 0).length || undefined;
}

function parseSeparator(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return [...value][0];
}

function parseCellSpec(
  cellSpecRaw: string,
  source: string,
  rawStartOffset: number
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
        range: range(source, rawStartOffset, rawStartOffset + cellSpecRaw.length)
      });
      duplicateCount = 1;
      remaining = remaining.replace(/\*/gu, "");
    }
  } else if (remaining.includes("*")) {
    errors.push({
      code: "cell.spec.duplicate-unsupported",
      severity: "error",
      message: `Unsupported mixed duplicate cell spec: ${remaining}`,
      range: range(source, rawStartOffset, rawStartOffset + cellSpecRaw.length)
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
  if (styleMatch) {
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
      range: range(source, rawStartOffset, rawStartOffset + cellSpecRaw.length)
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

function splitLines(source: string): Array<{ index: number; offset: number; text: string; raw: string }> {
  const lines: Array<{ index: number; offset: number; text: string; raw: string }> = [];
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

function range(source: string, start: number, end: number): SourceRange {
  return {
    start: positionAt(source, start),
    end: positionAt(source, end)
  };
}

function positionAt(source: string, offset: number): SourcePosition {
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

function normalizeSpan(value: number): number {
  return Number.isInteger(value) && value > 0 ? value : 1;
}
