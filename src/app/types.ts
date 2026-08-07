import type { GridCell, TableColumnSpec, TableDiagnostic, TableFormatMode } from "../core";

export interface WebviewAppModel {
  readonly mode: "table-grid" | "fallback";
  readonly tableId: string;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly columns: readonly TableColumnSpec[];
  readonly cells: GridCell[][];
  readonly tableAppearance: WebviewTableAppearanceModel;
  readonly preview: WebviewPreviewModel;
  readonly formatReview?: WebviewFormatReviewModel;
  readonly diagnostics: TableDiagnostic[];
}

export interface WebviewTableAppearanceModel {
  readonly title?: string;
  readonly id?: string;
  readonly role?: string;
  readonly width?: string;
  readonly frame?: string;
  readonly grid?: string;
  readonly stripes?: string;
  readonly autowidth: boolean;
}

export interface WebviewPreviewModel {
  readonly tableHtml: string;
  readonly blockCellHtmlBySourceCellId: Record<string, string>;
}

export interface WebviewFormatReviewModel {
  readonly before: string;
  readonly selectedMode: TableFormatMode;
  readonly variants: readonly WebviewFormatReviewVariant[];
}

export interface WebviewFormatReviewVariant {
  readonly mode: TableFormatMode;
  readonly label: string;
  readonly after: string;
  readonly changedLineCount: number;
  readonly formattedRowCount: number;
  readonly preservedRowCount: number;
  readonly diagnostics: string[];
}

export interface RenderTableEditorOptions {
  readonly selectedSourceCellId?: string;
  readonly blockCellPreviewHtmlBySourceCellId?: Record<string, string>;
  readonly hostBridgeScript?: string;
  readonly revisionToken?: string;
}

export interface TableEditorWebviewLabels {
  readonly title: string;
  readonly tableGrid: string;
  readonly editCommands: string;
  readonly undo: string;
  readonly redo: string;
  readonly edit: string;
  readonly preview: string;
  readonly format: string;
  readonly merge: string;
  readonly mergeSelectedCells: string;
  readonly unmerge: string;
  readonly unmergeSelectedCell: string;
  readonly rowsLabel: string;
  readonly columnsLabel: string;
  readonly cellContextMenu: string;
  readonly insertRowAbove: string;
  readonly insertRowBelow: string;
  readonly insertColumnLeft: string;
  readonly insertColumnRight: string;
  readonly removeRow: string;
  readonly removeColumn: string;
  readonly selectedCell: string;
  readonly cell: string;
  readonly kind: string;
  readonly position: string;
  readonly span: string;
  readonly state: string;
  readonly grid: string;
  readonly content: string;
  readonly raw: string;
  readonly blockCell: string;
  readonly editContent: string;
  readonly applyCellContent: string;
  readonly blockSource: string;
  readonly applyBlockSource: string;
  readonly tablePreview: string;
  readonly blockPreview: string;
  readonly row: string;
  readonly column: string;
  readonly readonly: string;
  readonly editable: string;
  readonly coveredBy: string;
  readonly editing: string;
  readonly noDiagnostics: string;
  readonly copiedSelectedRange: string;
  readonly copiedSelectedCell: string;
  readonly copyBlockedPlainRange: string;
  readonly pasteBlockedPlainRange: string;
  readonly pasteBlockedMergedOverlap: string;
  readonly clearBlockedPlainRange: string;
  readonly mergeBlockedTooSmall: string;
  readonly mergeBlockedPlainRange: string;
  readonly mergeBlockedHorizontalOnly: string;
  readonly unmergeBlockedOrigin: string;
  readonly unmergeBlockedHorizontalOnly: string;
  readonly unmergeBlockedNotMerged: string;
  readonly structureEditBlockedOrigin: string;
  readonly styleEditBlockedPlainRange: string;
  readonly rowColumnEdit: string;
  readonly mergeOperation: string;
  readonly unmergeOperation: string;
  readonly cellStyleUpdate: string;
  readonly tableSettingsUpdate: string;
  readonly cellUpdate: string;
  readonly blockCellUpdate: string;
  readonly undoRedo: string;
  readonly previewRender: string;
  readonly formatTable: string;
  readonly formatReview: string;
  readonly tableLayout: string;
  readonly cellPerLine: string;
  readonly applyFormat: string;
  readonly cancelFormat: string;
  readonly changedLines: string;
  readonly formattedRows: string;
  readonly preservedRows: string;
  readonly before: string;
  readonly after: string;
  readonly pasteBlockedImportedSpan: string;
  readonly pasteBlockedImportedRagged: string;
  readonly pasteBlockedImportedTable: string;
  readonly pasteBlockedBlockMultiCell: string;
  readonly pasteRichContentDropped: string;
  readonly fallbackGuidanceTitle: string;
  readonly fallbackGuidanceBody: string;
  readonly focusDiagnostics: string;
  readonly operationAppliedMessage: string;
  readonly operationInProgressMessage: string;
  readonly operationBlockedMessage: string;
  readonly operationBlockedWithoutDetailMessage: string;
  readonly alignLeft: string;
  readonly alignCenter: string;
  readonly alignRight: string;
  readonly valignTop: string;
  readonly valignMiddle: string;
  readonly valignBottom: string;
  readonly cellStyle: string;
  readonly tableSettings: string;
  readonly markHeader: string;
  readonly markNoHeader: string;
  readonly toggleFooter: string;
  readonly columnSpec: string;
  readonly applyColumnSpec: string;
  readonly tableAppearance: string;
  readonly applyTableAppearance: string;
  readonly tableTitle: string;
  readonly tableId: string;
  readonly tableRole: string;
  readonly width: string;
  readonly autowidth: string;
  readonly frame: string;
  readonly stripes: string;
}
