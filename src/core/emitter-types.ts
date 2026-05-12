export interface PlainCellContentReplacement {
  readonly sourceCellId: string;
  readonly contentRaw: string;
}

export interface RectangularPasteRequest {
  readonly startSourceCellId: string;
  readonly rows: readonly (readonly string[])[];
}

export interface ImportedTablePasteCell {
  readonly row: number;
  readonly col: number;
  readonly rowSpan: number;
  readonly colSpan: number;
  readonly text: string;
}

export interface ImportedTablePasteRequest {
  readonly startSourceCellId: string;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly cells: readonly ImportedTablePasteCell[];
}

export interface BlockCellContentReplacement {
  readonly sourceCellId: string;
  readonly contentRaw: string;
}

export interface PlainCellBlockReplacement {
  readonly sourceCellId: string;
  readonly contentRaw: string;
}

export interface HorizontalMergeRequest {
  readonly sourceCellIds: readonly string[];
}

export interface UnmergeRequest {
  readonly sourceCellId: string;
}

export interface RowColumnEditRequest {
  readonly sourceCellId: string;
}
