export interface SourcePosition {
  offset: number;
  line: number;
  column: number;
}

export interface SourceRange {
  start: SourcePosition;
  end: SourcePosition;
}

export interface TextRange {
  start: number;
  end: number;
}

export type DiagnosticSeverity = "info" | "warning" | "error";

export interface TableDiagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  range?: SourceRange;
  nodeId?: string;
}

export interface TableDelimiter {
  startRaw: string;
  endRaw: string;
  separator: string;
}

export interface TableAttributes {
  columnCount?: number;
  format?: string;
  separator?: string;
  options: string[];
  columns: TableColumnSpec[];
  lines: TableAttributeLine[];
  entries: TableAttributeEntry[];
  title?: TableTitle;
  named: Record<string, string>;
}

export interface TableColumnSpec {
  index: number;
  raw: string;
  widthRaw?: string;
  horizontalAlign?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  style?: string;
}

export interface TableAttributeLine {
  raw: string;
  range: SourceRange;
  entries: TableAttributeEntry[];
}

export interface TableAttributeEntry {
  kind: "named" | "option" | "positional";
  raw: string;
  range: SourceRange;
  name?: string;
  value?: string;
  valueRange?: SourceRange;
  quote?: "\"" | "'";
}

export interface TableTitle {
  raw: string;
  text: string;
  range: SourceRange;
  valueRange: SourceRange;
}

export interface RetainedSegment {
  nodeId: string;
  kind: "blank" | "comment" | "unknown" | "separator" | "raw";
  raw: string;
  range: SourceRange;
}

export interface LosslessTableCell {
  nodeId: string;
  kind: "cell";
  raw: string;
  range: SourceRange;
  cellSpecRaw: string;
  delimiterRaw: string;
  contentRaw: string;
  duplicateCount?: number;
  duplicateIndex?: number;
  duplicateGroupId?: string;
  rowSpan: number;
  colSpan: number;
  style?: string;
  horizontalAlign?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  effectiveStyle?: string;
  effectiveHorizontalAlign?: "left" | "center" | "right";
  effectiveVerticalAlign?: "top" | "middle" | "bottom";
  isBlockContent: boolean;
  errors: TableDiagnostic[];
}

export interface LosslessTableRow {
  nodeId: string;
  kind: "row";
  role: "header" | "body" | "footer";
  raw: string;
  range: SourceRange;
  cells: LosslessTableCell[];
  retained: RetainedSegment[];
  errors: TableDiagnostic[];
}

export interface LosslessTable {
  nodeId: string;
  kind: "table";
  raw: string;
  range: SourceRange;
  delimiter: TableDelimiter;
  attributes: TableAttributes;
  rows: LosslessTableRow[];
  retained: RetainedSegment[];
  errors: TableDiagnostic[];
}

export interface TableModel {
  tableId: string;
  rows: LosslessTableRow[];
  diagnostics: TableDiagnostic[];
}

export type GridCell =
  | {
      kind: "origin";
      cellId: string;
      sourceCellId: string;
      row: number;
      col: number;
      rowSpan: number;
      colSpan: number;
      contentRaw: string;
      style?: string;
      horizontalAlign?: "left" | "center" | "right";
      verticalAlign?: "top" | "middle" | "bottom";
      role: "header" | "body" | "footer";
      editable: boolean;
      blockContent: boolean;
      diagnostics: TableDiagnostic[];
    }
  | {
      kind: "covered";
      cellId: string;
      coveredBy: string;
      sourceCellId: string;
      row: number;
      col: number;
    };

export interface GridModel {
  tableId: string;
  rowCount: number;
  columnCount: number;
  columns: TableColumnSpec[];
  cells: GridCell[][];
  diagnostics: TableDiagnostic[];
}

export type WriteBackResult =
  | {
      ok: true;
      source: string;
      diagnostics: TableDiagnostic[];
    }
  | {
      ok: false;
      source: string;
      diagnostics: TableDiagnostic[];
    };

export type TableDocument = LosslessTable;
