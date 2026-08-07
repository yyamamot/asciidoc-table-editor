import * as vscode from "vscode";
import { deletePlainColumn, deletePlainRow, findAsciiDocTableBlock, insertPlainColumnAfter, insertPlainColumnBefore, insertPlainRowAfter, insertPlainRowBefore, mergePlainCellsHorizontally, parseAsciiDocTable, pasteImportedTable, pasteRectangularPlainTable, replaceBlockCellContent, replacePlainCellContent, replacePlainCellContents, replacePlainCellStyles, replacePlainCellWithBlockContent, unmergePlainCellHorizontally, updateColumnSpec, updateTableAppearance, updateTableHeaderFooter, type ColumnSpecUpdate, type TableAppearanceUpdate, type TableHeaderFooterUpdate, type WriteBackResult } from "../core";
import type { BlockCellContentReplacement, CellContentReplacement, CellContentUpdateResult, ImportedTablePastePayload, PlainCellBlockReplacement, RectangularPastePayload, RowColumnEditMessage } from "./types";
import { createEphemeralTableEditorSessionTarget, type SessionTargetResolution, type TableEditorSessionTarget, type WriteBackConflictReason } from "./table-editor-session-target";

export type TableEditorDocumentTarget = number | TableEditorSessionTarget;

export async function applyPlainCellContentToEditor(
  editor: vscode.TextEditor,
  target: TableEditorDocumentTarget,
  sourceCellId: string,
  contentRaw: string
): Promise<CellContentUpdateResult> {
  const resolved = resolveTableTarget(editor, target);
  if (!resolved.ok) return resolved.result;
  const { tableBlock, session } = resolved;

  const writeBack = replacePlainCellContent(parseAsciiDocTable(tableBlock.raw), sourceCellId, contentRaw);
  if (!writeBack.ok) {
    return {
      ok: false,
      diagnostics: writeBack.diagnostics
    };
  }

  return applyTableBlockReplacement(editor, session, tableBlock, writeBack);
}

export async function applyPlainCellContentsToEditor(
  editor: vscode.TextEditor,
  target: TableEditorDocumentTarget,
  replacements: readonly CellContentReplacement[]
): Promise<CellContentUpdateResult> {
  const resolved = resolveTableTarget(editor, target);
  if (!resolved.ok) return resolved.result;
  const { tableBlock, session } = resolved;

  const writeBack = replacePlainCellContents(parseAsciiDocTable(tableBlock.raw), replacements);
  if (!writeBack.ok) {
    return {
      ok: false,
      diagnostics: writeBack.diagnostics
    };
  }

  return applyTableBlockReplacement(editor, session, tableBlock, writeBack);
}

export async function applyRectangularPasteToEditor(
  editor: vscode.TextEditor,
  target: TableEditorDocumentTarget,
  request: RectangularPastePayload
): Promise<CellContentUpdateResult> {
  const resolved = resolveTableTarget(editor, target);
  if (!resolved.ok) return resolved.result;
  const { tableBlock, session } = resolved;

  const writeBack = pasteRectangularPlainTable(parseAsciiDocTable(tableBlock.raw), request);
  if (!writeBack.ok) {
    return {
      ok: false,
      diagnostics: writeBack.diagnostics
    };
  }

  return applyTableBlockReplacement(editor, session, tableBlock, writeBack);
}

export async function applyImportedTablePasteToEditor(
  editor: vscode.TextEditor,
  target: TableEditorDocumentTarget,
  request: ImportedTablePastePayload
): Promise<CellContentUpdateResult> {
  const resolved = resolveTableTarget(editor, target);
  if (!resolved.ok) return resolved.result;
  const { tableBlock, session } = resolved;

  const writeBack = pasteImportedTable(parseAsciiDocTable(tableBlock.raw), request);
  if (!writeBack.ok) {
    return {
      ok: false,
      diagnostics: writeBack.diagnostics
    };
  }

  return applyTableBlockReplacement(editor, session, tableBlock, writeBack);
}

export async function applyBlockCellContentToEditor(
  editor: vscode.TextEditor,
  target: TableEditorDocumentTarget,
  replacement: BlockCellContentReplacement
): Promise<CellContentUpdateResult> {
  const resolved = resolveTableTarget(editor, target);
  if (!resolved.ok) return resolved.result;
  const { tableBlock, session } = resolved;

  const writeBack = replaceBlockCellContent(parseAsciiDocTable(tableBlock.raw), replacement);
  if (!writeBack.ok) {
    return {
      ok: false,
      diagnostics: writeBack.diagnostics
    };
  }

  return applyTableBlockReplacement(editor, session, tableBlock, writeBack);
}

export async function applyPlainCellBlockContentToEditor(
  editor: vscode.TextEditor,
  target: TableEditorDocumentTarget,
  replacement: PlainCellBlockReplacement
): Promise<CellContentUpdateResult> {
  const resolved = resolveTableTarget(editor, target);
  if (!resolved.ok) return resolved.result;
  const { tableBlock, session } = resolved;

  const writeBack = replacePlainCellWithBlockContent(parseAsciiDocTable(tableBlock.raw), replacement);
  if (!writeBack.ok) {
    return {
      ok: false,
      diagnostics: writeBack.diagnostics
    };
  }

  return applyTableBlockReplacement(editor, session, tableBlock, writeBack);
}

export async function applyPlainCellStyleToEditor(
  editor: vscode.TextEditor,
  target: TableEditorDocumentTarget,
  request: { sourceCellIds: readonly string[]; style?: string; horizontalAlign?: "left" | "center" | "right"; verticalAlign?: "top" | "middle" | "bottom" }
): Promise<CellContentUpdateResult> {
  return applyTableWriteBack(editor, target, (source) => replacePlainCellStyles(parseAsciiDocTable(source), request));
}

export async function applyTableHeaderFooterToEditor(
  editor: vscode.TextEditor,
  target: TableEditorDocumentTarget,
  request: TableHeaderFooterUpdate
): Promise<CellContentUpdateResult> {
  return applyTableWriteBack(editor, target, (source) => updateTableHeaderFooter(parseAsciiDocTable(source), request));
}

export async function applyColumnSpecToEditor(
  editor: vscode.TextEditor,
  target: TableEditorDocumentTarget,
  request: ColumnSpecUpdate
): Promise<CellContentUpdateResult> {
  return applyTableWriteBack(editor, target, (source) => updateColumnSpec(parseAsciiDocTable(source), request));
}

export async function applyTableAppearanceToEditor(
  editor: vscode.TextEditor,
  target: TableEditorDocumentTarget,
  request: TableAppearanceUpdate
): Promise<CellContentUpdateResult> {
  return applyTableWriteBack(editor, target, (source) => updateTableAppearance(parseAsciiDocTable(source), request));
}

export async function applyHorizontalMergeToEditor(
  editor: vscode.TextEditor,
  target: TableEditorDocumentTarget,
  sourceCellIds: readonly string[]
): Promise<CellContentUpdateResult> {
  const resolved = resolveTableTarget(editor, target);
  if (!resolved.ok) return resolved.result;
  const { tableBlock, session } = resolved;

  const writeBack = mergePlainCellsHorizontally(parseAsciiDocTable(tableBlock.raw), { sourceCellIds });
  if (!writeBack.ok) {
    return {
      ok: false,
      diagnostics: writeBack.diagnostics
    };
  }

  return applyTableBlockReplacement(editor, session, tableBlock, writeBack);
}

async function applyTableBlockReplacement(
  editor: vscode.TextEditor,
  session: TableEditorSessionTarget,
  tableBlock: { range: { start: { line: number; column: number }; end: { line: number; column: number } } },
  writeBack: WriteBackResult
): Promise<CellContentUpdateResult> {
  if (!writeBack.ok) {
    return {
      ok: false,
      diagnostics: writeBack.diagnostics
    };
  }

  const editApplied = await applyTableBlockSourceReplacement(editor, session, tableBlock, writeBack.source);

  if (editApplied !== "applied") {
    return {
      ok: false,
      diagnostics: [{
        code: editApplied === "indeterminate" ? "writeback.apply-raced" : "writeback.edit-not-applied",
        severity: "error",
        message: editApplied === "indeterminate"
          ? "The table edit completed but its source state could not be verified"
          : "VS Code did not apply the table edit"
      }]
    };
  }

  return {
    ok: true,
    diagnostics: []
  };
}

async function applyTableWriteBack(
  editor: vscode.TextEditor,
  target: TableEditorDocumentTarget,
  createWriteBack: (tableSource: string) => WriteBackResult
): Promise<CellContentUpdateResult> {
  const resolved = resolveTableTarget(editor, target);
  if (!resolved.ok) return resolved.result;
  const { tableBlock, session } = resolved;

  const writeBack = createWriteBack(tableBlock.raw);
  if (!writeBack.ok) {
    return {
      ok: false,
      diagnostics: writeBack.diagnostics
    };
  }

  return applyTableBlockReplacement(editor, session, tableBlock, writeBack);
}

export async function applyTableBlockSourceReplacement(
  editor: vscode.TextEditor,
  session: TableEditorSessionTarget,
  tableBlock: { range: { start: { line: number; column: number }; end: { line: number; column: number } } },
  source: string
): Promise<"applied" | "not-applied" | "indeterminate"> {
  session.beginApply();
  const workspaceEdit = new vscode.WorkspaceEdit();
  workspaceEdit.replace(
    editor.document.uri,
    new vscode.Range(
      tableBlock.range.start.line,
      tableBlock.range.start.column,
      tableBlock.range.end.line,
      tableBlock.range.end.column
    ),
    source
  );
  const applied = await vscode.workspace.applyEdit(workspaceEdit);
  if (!applied) {
    session.cancelApply();
    return "not-applied";
  }
  return session.finishApply(editor.document, source) ? "applied" : "indeterminate";
}

export async function applyHorizontalUnmergeToEditor(
  editor: vscode.TextEditor,
  target: TableEditorDocumentTarget,
  sourceCellId: string
): Promise<CellContentUpdateResult> {
  const resolved = resolveTableTarget(editor, target);
  if (!resolved.ok) return resolved.result;
  const { tableBlock, session } = resolved;

  const writeBack = unmergePlainCellHorizontally(parseAsciiDocTable(tableBlock.raw), { sourceCellId });
  if (!writeBack.ok) {
    return {
      ok: false,
      diagnostics: writeBack.diagnostics
    };
  }

  return applyTableBlockReplacement(editor, session, tableBlock, writeBack);
}

export async function applyRowColumnEditToEditor(
  editor: vscode.TextEditor,
  target: TableEditorDocumentTarget,
  message: Pick<RowColumnEditMessage, "type" | "sourceCellId">
): Promise<CellContentUpdateResult> {
  const resolved = resolveTableTarget(editor, target);
  if (!resolved.ok) return resolved.result;
  const { tableBlock, session } = resolved;

  const table = parseAsciiDocTable(tableBlock.raw);
  const writeBack = rowColumnWriteBack(table, message);
  if (!writeBack.ok) {
    return {
      ok: false,
      diagnostics: writeBack.diagnostics
    };
  }

  return applyTableBlockReplacement(editor, session, tableBlock, writeBack);
}

function rowColumnWriteBack(table: ReturnType<typeof parseAsciiDocTable>, message: Pick<RowColumnEditMessage, "type" | "sourceCellId">): WriteBackResult {
  switch (message.type) {
    case "request-insert-row-before":
      return insertPlainRowBefore(table, { sourceCellId: message.sourceCellId });
    case "request-insert-row-after":
      return insertPlainRowAfter(table, { sourceCellId: message.sourceCellId });
    case "request-delete-row":
      return deletePlainRow(table, { sourceCellId: message.sourceCellId });
    case "request-insert-column-before":
      return insertPlainColumnBefore(table, { sourceCellId: message.sourceCellId });
    case "request-insert-column-after":
      return insertPlainColumnAfter(table, { sourceCellId: message.sourceCellId });
    case "request-delete-column":
      return deletePlainColumn(table, { sourceCellId: message.sourceCellId });
  }
}

function resolveTableTarget(editor: vscode.TextEditor, target: TableEditorDocumentTarget):
  | { ok: true; session: TableEditorSessionTarget; tableBlock: NonNullable<ReturnType<typeof findAsciiDocTableBlock>> }
  | { ok: false; result: CellContentUpdateResult } {
  let session: TableEditorSessionTarget;
  if (typeof target === "number") {
    const tableBlock = findAsciiDocTableBlock(editor.document.getText(), target);
    if (tableBlock === undefined) {
      return { ok: false, result: conflictResult("table-not-found") };
    }
    session = createEphemeralTableEditorSessionTarget(editor.document, tableBlock);
  } else {
    session = target;
  }

  const resolution = session.resolve(editor.document);
  return resolution.status === "ready"
    ? { ok: true, session, tableBlock: resolution.tableBlock }
    : { ok: false, result: sessionTargetFailureResult(resolution) };
}

export function sessionTargetFailureResult(failure: Exclude<SessionTargetResolution, { status: "ready" }>): CellContentUpdateResult {
  return failure.status === "indeterminate"
    ? {
        ok: false,
        diagnostics: [{
          code: "writeback.apply-raced",
          severity: "error",
          message: "The table source state is unknown after a raced apply"
        }]
      }
    : conflictResult(failure.reason);
}

export function conflictResult(reason: WriteBackConflictReason): CellContentUpdateResult {
  return {
    ok: false,
    diagnostics: [{
      code: `writeback.${reason}`,
      severity: "error",
      message: conflictMessage(reason)
    }]
  };
}

function conflictMessage(reason: WriteBackConflictReason): string {
  switch (reason) {
    case "revision-mismatch": return "Table editor revision is stale";
    case "document-replaced": return "The table editor document was replaced";
    case "table-not-found": return "Target AsciiDoc table block was not found";
    case "table-ambiguous": return "Target AsciiDoc table block is ambiguous";
    case "table-changed": return "Target AsciiDoc table block changed outside the editor";
    case "expected-raw-mismatch": return "Target AsciiDoc table source no longer matches the expected source";
  }
}
