import {
  deletePlainColumn,
  deletePlainRow,
  formatAsciiDocTable,
  insertPlainColumnAfter,
  insertPlainColumnBefore,
  insertPlainRowAfter,
  insertPlainRowBefore,
  mergePlainCellsHorizontally,
  parseAsciiDocTable,
  pasteImportedTable,
  pasteRectangularPlainTable,
  projectGridModel,
  recommendedTableFormatMode,
  replaceBlockCellContent,
  replacePlainCellContent,
  replacePlainCellContents,
  replacePlainCellStyles,
  replacePlainCellWithBlockContent,
  unmergePlainCellHorizontally,
  updateColumnSpec,
  updateTableAppearance,
  updateTableHeaderFooter,
  type TableDiagnostic,
  type TableFormatMode,
  type TableFormatResult,
  type WriteBackResult
} from "../core";
import { DEFAULT_TABLE_EDITOR_LABELS } from "./labels";
import type { TableEditorHostMessage, TableEditorResultMessage } from "./messages";
import { createWebviewAppModel } from "./model";
import type { TableEditorWebviewLabels, WebviewAppModel, WebviewPreviewModel } from "./types";

export type PortablePreviewAdapter = (source: string) => WebviewPreviewModel | Promise<WebviewPreviewModel>;

export interface PortableTableEditorSession {
  readonly source: string;
  readonly model: WebviewAppModel;
  readonly labels: TableEditorWebviewLabels;
  readonly previewAdapter: PortablePreviewAdapter;
  readonly selectedSourceCellId?: string;
}

export interface CreatePortableTableEditorSessionOptions {
  readonly source: string;
  readonly previewAdapter?: PortablePreviewAdapter;
  readonly labels?: TableEditorWebviewLabels;
  readonly selectedSourceCellId?: string;
  readonly diagnostics?: readonly TableDiagnostic[];
}

export type PortableTableEditorApplyResult =
  | {
      readonly handled: false;
      readonly session: PortableTableEditorSession;
    }
  | {
      readonly handled: true;
      readonly session: PortableTableEditorSession;
      readonly message?: TableEditorResultMessage;
    };

const EMPTY_PREVIEW: WebviewPreviewModel = {
  tableHtml: "",
  blockCellHtmlBySourceCellId: {}
};

export async function createPortableTableEditorSession(
  options: CreatePortableTableEditorSessionOptions
): Promise<PortableTableEditorSession> {
  const previewAdapter = options.previewAdapter ?? (() => EMPTY_PREVIEW);
  const labels = options.labels ?? DEFAULT_TABLE_EDITOR_LABELS;
  return refreshPortableSession({
    source: options.source,
    labels,
    previewAdapter,
    selectedSourceCellId: options.selectedSourceCellId,
    diagnostics: options.diagnostics
  });
}

export async function applyPortableTableEditorMessage(
  session: PortableTableEditorSession,
  message: TableEditorHostMessage
): Promise<PortableTableEditorApplyResult> {
  switch (message.type) {
    case "ui-review-snapshot":
    case "request-reveal-source-cell":
    case "request-undo":
    case "request-redo":
      return { handled: false, session };

    case "update-cell-content":
      return applyWriteBackResult(
        session,
        replacePlainCellContent(parseAsciiDocTable(session.source), message.sourceCellId, message.contentRaw),
        "cell-content-update-result",
        message.selectedSourceCellId ?? message.sourceCellId
      );

    case "update-cell-contents":
      return applyWriteBackResult(
        session,
        mergeWriteBackDiagnostics(
          replacePlainCellContents(parseAsciiDocTable(session.source), message.replacements),
          message.diagnostics
        ),
        "cell-content-update-result",
        message.selectedSourceCellId ?? message.replacements.at(-1)?.sourceCellId,
        message.diagnostics
      );

    case "paste-rectangular-table":
      return applyWriteBackResult(
        session,
        mergeWriteBackDiagnostics(
          pasteRectangularPlainTable(parseAsciiDocTable(session.source), {
            startSourceCellId: message.startSourceCellId,
            rows: message.rows
          }),
          message.diagnostics
        ),
        "cell-content-update-result",
        message.selectedSourceCellId ?? message.startSourceCellId,
        message.diagnostics
      );

    case "paste-imported-table":
      return applyWriteBackResult(
        session,
        mergeWriteBackDiagnostics(
          pasteImportedTable(parseAsciiDocTable(session.source), {
            startSourceCellId: message.startSourceCellId,
            rowCount: message.rowCount,
            columnCount: message.columnCount,
            cells: message.cells
          }),
          message.diagnostics
        ),
        "cell-content-update-result",
        message.selectedSourceCellId ?? message.startSourceCellId,
        message.diagnostics
      );

    case "update-block-cell-source":
      return applyWriteBackResult(
        session,
        replaceBlockCellContent(parseAsciiDocTable(session.source), {
          sourceCellId: message.sourceCellId,
          contentRaw: message.contentRaw
        }),
        "block-cell-update-result",
        message.selectedSourceCellId ?? message.sourceCellId
      );

    case "replace-cell-with-block-source":
      return applyWriteBackResult(
        session,
        mergeWriteBackDiagnostics(
          replacePlainCellWithBlockContent(parseAsciiDocTable(session.source), {
            sourceCellId: message.sourceCellId,
            contentRaw: message.contentRaw
          }),
          message.diagnostics
        ),
        "block-cell-update-result",
        message.selectedSourceCellId ?? message.sourceCellId,
        message.diagnostics
      );

    case "request-merge-cells":
      return applyWriteBackResult(
        session,
        mergePlainCellsHorizontally(parseAsciiDocTable(session.source), { sourceCellIds: message.sourceCellIds }),
        "merge-cells-result",
        message.selectedSourceCellId ?? message.sourceCellIds[0]
      );

    case "request-unmerge-cell":
      return applyWriteBackResult(
        session,
        unmergePlainCellHorizontally(parseAsciiDocTable(session.source), { sourceCellId: message.sourceCellId }),
        "unmerge-cell-result",
        message.selectedSourceCellId ?? message.sourceCellId
      );

    case "request-insert-row-before":
    case "request-insert-row-after":
    case "request-delete-row":
    case "request-insert-column-before":
    case "request-insert-column-after":
    case "request-delete-column":
      return applyWriteBackResult(
        session,
        applyPortableRowColumnEdit(session.source, message.type, message.sourceCellId),
        "row-column-edit-result",
        message.selectedSourceCellId ?? message.sourceCellId
      );

    case "request-format-table":
      return openPortableFormatReview(session, message.selectedSourceCellId);

    case "apply-format-table":
      return applyPortableFormatReview(session, message.mode, message.selectedSourceCellId);

    case "request-update-cell-style":
      return applyWriteBackResult(
        session,
        replacePlainCellStyles(parseAsciiDocTable(session.source), message),
        "cell-style-update-result",
        message.selectedSourceCellId ?? message.sourceCellIds[0]
      );

    case "request-update-header-footer":
      return applyWriteBackResult(
        session,
        updateTableHeaderFooter(parseAsciiDocTable(session.source), message),
        "table-settings-update-result",
        message.selectedSourceCellId
      );

    case "request-update-column-spec":
      return applyWriteBackResult(
        session,
        updateColumnSpec(parseAsciiDocTable(session.source), message),
        "table-settings-update-result",
        message.selectedSourceCellId
      );

    case "request-update-table-appearance":
      return applyWriteBackResult(
        session,
        updateTableAppearance(parseAsciiDocTable(session.source), message),
        "table-settings-update-result",
        message.selectedSourceCellId
      );
  }
}

async function refreshPortableSession(options: {
  readonly source: string;
  readonly labels: TableEditorWebviewLabels;
  readonly previewAdapter: PortablePreviewAdapter;
  readonly selectedSourceCellId?: string;
  readonly diagnostics?: readonly TableDiagnostic[];
  readonly formatReview?: WebviewAppModel["formatReview"];
}): Promise<PortableTableEditorSession> {
  const table = parseAsciiDocTable(options.source);
  const preview = await options.previewAdapter(options.source);
  return {
    source: options.source,
    labels: options.labels,
    previewAdapter: options.previewAdapter,
    selectedSourceCellId: options.selectedSourceCellId,
    model: createWebviewAppModel(projectGridModel(table), {
      preview,
      diagnostics: options.diagnostics === undefined ? undefined : [...options.diagnostics],
      formatReview: options.formatReview
    })
  };
}

async function applyWriteBackResult(
  session: PortableTableEditorSession,
  result: WriteBackResult,
  messageType: Extract<TableEditorResultMessage["type"], "cell-content-update-result" | "block-cell-update-result" | "merge-cells-result" | "unmerge-cell-result" | "row-column-edit-result" | "cell-style-update-result" | "table-settings-update-result">,
  selectedSourceCellId?: string,
  diagnostics?: readonly TableDiagnostic[]
): Promise<PortableTableEditorApplyResult> {
  const nextSession = result.ok
    ? await refreshPortableSession({
        source: result.source,
        labels: session.labels,
        previewAdapter: session.previewAdapter,
        selectedSourceCellId,
        diagnostics
      })
    : session;
  return {
    handled: true,
    session: nextSession,
    message: {
      type: messageType,
      result: {
        ok: result.ok,
        diagnostics: result.diagnostics
      }
    } as TableEditorResultMessage
  };
}

function mergeWriteBackDiagnostics(result: WriteBackResult, diagnostics: readonly TableDiagnostic[] | undefined): WriteBackResult {
  if (diagnostics === undefined || diagnostics.length === 0) {
    return result;
  }
  return {
    ...result,
    diagnostics: [...diagnostics, ...result.diagnostics]
  };
}

function applyPortableRowColumnEdit(
  source: string,
  type: Extract<TableEditorHostMessage["type"],
    | "request-insert-row-before"
    | "request-insert-row-after"
    | "request-delete-row"
    | "request-insert-column-before"
    | "request-insert-column-after"
    | "request-delete-column">,
  sourceCellId: string
): WriteBackResult {
  const table = parseAsciiDocTable(source);
  switch (type) {
    case "request-insert-row-before":
      return insertPlainRowBefore(table, { sourceCellId });
    case "request-insert-row-after":
      return insertPlainRowAfter(table, { sourceCellId });
    case "request-delete-row":
      return deletePlainRow(table, { sourceCellId });
    case "request-insert-column-before":
      return insertPlainColumnBefore(table, { sourceCellId });
    case "request-insert-column-after":
      return insertPlainColumnAfter(table, { sourceCellId });
    case "request-delete-column":
      return deletePlainColumn(table, { sourceCellId });
  }
}

async function openPortableFormatReview(
  session: PortableTableEditorSession,
  selectedSourceCellId?: string
): Promise<PortableTableEditorApplyResult> {
  const parsed = parseAsciiDocTable(session.source);
  const formatResults = [
    formatAsciiDocTable(parsed, { mode: "table-layout" }),
    formatAsciiDocTable(parsed, { mode: "cell-per-line" })
  ];
  const changedResults = formatResults.filter((result): result is Extract<TableFormatResult, { ok: true }> => result.ok && result.changed);
  if (changedResults.length === 0) {
    const diagnostics = formatResults.flatMap((result) => result.diagnostics);
    const hasError = diagnostics.some((diagnostic) => diagnostic.severity === "error");
    const nextSession = await refreshPortableSession({
      source: session.source,
      labels: session.labels,
      previewAdapter: session.previewAdapter,
      selectedSourceCellId,
      diagnostics
    });
    return {
      handled: true,
      session: nextSession,
      message: {
        type: "format-table-result",
        result: { ok: !hasError, diagnostics }
      }
    };
  }

  const formatReview = createPortableFormatReviewModel(
    session.source,
    changedResults,
    recommendedTableFormatMode(parsed),
    session.labels
  );
  return {
    handled: true,
    session: await refreshPortableSession({
      source: session.source,
      labels: session.labels,
      previewAdapter: session.previewAdapter,
      selectedSourceCellId,
      formatReview
    })
  };
}

async function applyPortableFormatReview(
  session: PortableTableEditorSession,
  mode?: TableFormatMode,
  selectedSourceCellId?: string
): Promise<PortableTableEditorApplyResult> {
  const formatReview = session.model.formatReview;
  if (formatReview === undefined) {
    return formatResult(session, "format.preview-missing", "Format preview was not found");
  }
  if (session.source !== formatReview.before) {
    const diagnostic = {
      code: "format.preview-stale",
      severity: "error" as const,
      message: "Format preview is stale. Re-run format."
    };
    return {
      handled: true,
      session: await refreshPortableSession({
        source: session.source,
        labels: session.labels,
        previewAdapter: session.previewAdapter,
        selectedSourceCellId,
        diagnostics: [diagnostic]
      }),
      message: {
        type: "format-table-result",
        result: { ok: false, diagnostics: [diagnostic] }
      }
    };
  }

  const selectedMode = mode ?? formatReview.selectedMode;
  const variant = formatReview.variants.find((candidate) => candidate.mode === selectedMode);
  if (variant === undefined) {
    return formatResult(session, "format.mode-missing", "Format mode was not found");
  }

  return {
    handled: true,
    session: await refreshPortableSession({
      source: variant.after,
      labels: session.labels,
      previewAdapter: session.previewAdapter,
      selectedSourceCellId
    }),
    message: {
      type: "format-table-result",
      result: { ok: true, diagnostics: [] }
    }
  };
}

function formatResult(
  session: PortableTableEditorSession,
  code: string,
  message: string
): PortableTableEditorApplyResult {
  return {
    handled: true,
    session,
    message: {
      type: "format-table-result",
      result: {
        ok: false,
        diagnostics: [{ code, severity: "error", message }]
      }
    }
  };
}

function createPortableFormatReviewModel(
  before: string,
  results: readonly Extract<TableFormatResult, { ok: true }>[],
  recommendedMode: TableFormatMode,
  labels: TableEditorWebviewLabels
): NonNullable<WebviewAppModel["formatReview"]> {
  const selectedMode = results.some((result) => result.mode === recommendedMode) ? recommendedMode : results[0]?.mode ?? "table-layout";
  return {
    before,
    selectedMode,
    variants: results.map((result) => ({
      mode: result.mode,
      label: result.mode === "cell-per-line" ? labels.cellPerLine : labels.tableLayout,
      after: result.source,
      changedLineCount: result.summary.changedLineCount,
      formattedRowCount: result.summary.formattedRowCount,
      preservedRowCount: result.summary.preservedRowCount,
      diagnostics: result.diagnostics.map((diagnostic) => diagnostic.message)
    }))
  };
}
