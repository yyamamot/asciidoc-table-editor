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

export interface PlainCellStyleReplacement {
  readonly sourceCellId: string;
  readonly style?: string;
  readonly horizontalAlign?: "left" | "center" | "right";
  readonly verticalAlign?: "top" | "middle" | "bottom";
}

export interface PlainCellStyleRangeReplacement {
  readonly sourceCellIds: readonly string[];
  readonly style?: string;
  readonly horizontalAlign?: "left" | "center" | "right";
  readonly verticalAlign?: "top" | "middle" | "bottom";
}

export interface TableHeaderFooterUpdate {
  readonly header?: boolean;
  readonly footer?: boolean;
  readonly noheader?: boolean;
}

export interface ColumnSpecUpdate {
  readonly columnIndex: number;
  readonly widthRaw?: string;
  readonly horizontalAlign?: "left" | "center" | "right";
  readonly verticalAlign?: "top" | "middle" | "bottom";
  readonly style?: string;
}

export interface TableAppearanceUpdate {
  readonly title?: string;
  readonly id?: string;
  readonly role?: string;
  readonly width?: string;
  readonly autowidth?: boolean;
  readonly frame?: string;
  readonly grid?: string;
  readonly stripes?: string;
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
