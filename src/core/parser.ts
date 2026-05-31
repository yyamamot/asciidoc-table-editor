import type { TableDiagnostic, TableDocument } from "./types";
import { tableDelimiterRaw } from "./table-delimiter";
import { parseTableAttributes } from "./parser-attributes";
import { parseBodyRows } from "./parser-body";
import { applyRowRoles } from "./parser-row-roles";
import { positionAt, splitLines } from "./parser-source";

export function parseAsciiDocTable(source: string): TableDocument {
  const lines = splitLines(source);
  const startLine = lines.find((line) => tableDelimiterRaw(line.text.trim()) !== undefined);
  const startDelimiterRaw = startLine === undefined ? undefined : tableDelimiterRaw(startLine.text.trim());
  const endLine =
    startLine === undefined || startDelimiterRaw === undefined
      ? undefined
      : lines.find((line) => line.index > startLine.index && line.text.trim() === startDelimiterRaw);
  const errors: TableDiagnostic[] = [];
  const attributes = parseTableAttributes(source, lines, startLine?.index ?? -1);
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
