import type { LosslessTableRow, TableAttributes, TableDocument } from "./types";
import type { SourceLine } from "./parser-source";
import { parseRowCells, spanWidth } from "./parser-cell-spec";

export function applyRowRoles(
  rows: TableDocument["rows"],
  bodyLines: SourceLine[],
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
  bodyLines: Array<Pick<SourceLine, "offset" | "text">>,
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

