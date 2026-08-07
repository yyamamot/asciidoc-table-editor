export * from "../app/messages";

export type TableEditorMutationResultType =
  | "cell-content-update-result"
  | "block-cell-update-result"
  | "merge-cells-result"
  | "unmerge-cell-result"
  | "row-column-edit-result"
  | "undo-redo-result"
  | "format-table-result"
  | "cell-style-update-result"
  | "table-settings-update-result";

export interface InvalidTableEditorMutationMessage {
  readonly type: string;
  readonly operationId: string;
  readonly revisionToken?: string;
}

export function mutationResultTypeForMessage(message: unknown): TableEditorMutationResultType | undefined {
  if (typeof message !== "object" || message === null || typeof (message as { type?: unknown }).type !== "string") return undefined;
  switch ((message as { type: string }).type) {
    case "update-cell-content":
    case "update-cell-contents":
    case "paste-rectangular-table":
    case "paste-imported-table":
      return "cell-content-update-result";
    case "update-block-cell-source":
    case "replace-cell-with-block-source":
      return "block-cell-update-result";
    case "request-merge-cells":
      return "merge-cells-result";
    case "request-unmerge-cell":
      return "unmerge-cell-result";
    case "request-insert-row-before":
    case "request-insert-row-after":
    case "request-delete-row":
    case "request-insert-column-before":
    case "request-insert-column-after":
    case "request-delete-column":
      return "row-column-edit-result";
    case "request-undo":
    case "request-redo":
      return "undo-redo-result";
    case "request-format-table":
    case "apply-format-table":
      return "format-table-result";
    case "request-update-cell-style":
      return "cell-style-update-result";
    case "request-update-header-footer":
    case "request-update-column-spec":
    case "request-update-table-appearance":
      return "table-settings-update-result";
    default:
      return undefined;
  }
}
