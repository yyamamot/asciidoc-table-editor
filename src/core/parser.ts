import type { TableDiagnostic, TableDocument } from "./types";
import { tableDelimiterRaw } from "./table-delimiter";
import { parseTableAttributes } from "./parser-attributes";
import { parseBodyRows } from "./parser-body";
import { materializeRetainedSegments } from "./parser-retained";
import { applyRowRoles } from "./parser-row-roles";
import { createSourcePositionIndex, positionAt, splitLines } from "./parser-source";

export function parseAsciiDocTable(source: string): TableDocument {
  const positionIndex = createSourcePositionIndex(source);
  const lines = splitLines(source);
  const startLine = lines.find((line) => tableDelimiterRaw(line.text.trim()) !== undefined);
  const startDelimiterRaw = startLine === undefined ? undefined : tableDelimiterRaw(startLine.text.trim());
  const errors: TableDiagnostic[] = [];
  const attributes = parseTableAttributes(source, lines, startLine?.index ?? -1, positionIndex);
  const separator = attributes.separator ?? "|";
  const endCandidates =
    startLine === undefined || startDelimiterRaw === undefined
      ? []
      : lines.filter((line) => line.index > startLine.index && line.text.trim() === startDelimiterRaw);
  const endLine =
    attributes.format !== undefined && attributes.format !== "psv"
      ? endCandidates[0]
      : endCandidates.find((candidate) => {
          const candidateRows = parseBodyRows(source, lines.slice((startLine?.index ?? -1) + 1, candidate.index), {
            columns: attributes.columns,
            expectedColumnCount: attributes.columnCount,
            separator,
            positionIndex
          });
          return !candidateRows.some((row) =>
            row.cells.some((cell) => cell.errors.some((error) => error.code === "block-cell.unclosed-delimited-block"))
          );
        }) ?? endCandidates[0];

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
        parseBodyRows(source, bodyLines, {
          columns: attributes.columns,
          expectedColumnCount: attributes.columnCount,
          separator,
          positionIndex
        }),
        bodyLines,
        attributes,
        separator,
        source,
        positionIndex
      );
  const retained = materializeRetainedSegments(
    source,
    { start: 0, end: source.length },
    [
      ...(attributes.title === undefined
        ? []
        : [{ start: attributes.title.range.start.offset, end: attributes.title.range.end.offset }]),
      ...attributes.lines.map((line) => ({ start: line.range.start.offset, end: line.range.end.offset })),
      ...rows.map((row) => ({ start: row.range.start.offset, end: row.range.end.offset }))
    ],
    "retained:table",
    [startLine, endLine]
      .filter((line): line is NonNullable<typeof line> => line !== undefined)
      .map((line) => ({ start: line.offset, end: line.offset + line.raw.length, kind: "separator" as const })),
    positionIndex
  );

  return {
    nodeId: "table:0",
    kind: "table",
    raw: source,
    range: {
      start: positionAt(positionIndex, 0),
      end: positionAt(positionIndex, source.length)
    },
    delimiter: {
      startRaw: startLine?.text ?? "",
      endRaw: endLine?.text ?? "",
      separator
    },
    attributes,
    rows,
    retained,
    errors
  };
}
