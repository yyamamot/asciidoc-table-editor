import * as vscode from "vscode";
import { deletePlainColumn, deletePlainRow, findAsciiDocTableBlock, insertPlainColumnAfter, insertPlainColumnBefore, insertPlainRowAfter, insertPlainRowBefore, mergePlainCellsHorizontally, parseAsciiDocTable, pasteImportedTable, pasteRectangularPlainTable, replaceBlockCellContent, replacePlainCellContent, replacePlainCellContents, replacePlainCellWithBlockContent, unmergePlainCellHorizontally, type WriteBackResult } from "../core";
import type { BlockCellContentReplacement, CellContentReplacement, CellContentUpdateResult, ImportedTablePastePayload, PlainCellBlockReplacement, RectangularPastePayload, RowColumnEditMessage } from "./types";

export async function applyPlainCellContentToEditor(
  editor: vscode.TextEditor,
  tableStartOffset: number,
  sourceCellId: string,
  contentRaw: string
): Promise<CellContentUpdateResult> {
  const source = editor.document.getText();
  const tableBlock = findAsciiDocTableBlock(source, tableStartOffset);
  if (tableBlock === undefined) {
    return {
      ok: false,
      diagnostics: [{
        code: "writeback.table-not-found",
        severity: "error",
        message: "Target AsciiDoc table block was not found"
      }]
    };
  }

  const writeBack = replacePlainCellContent(parseAsciiDocTable(tableBlock.raw), sourceCellId, contentRaw);
  if (!writeBack.ok) {
    return {
      ok: false,
      diagnostics: writeBack.diagnostics
    };
  }

  const editApplied = await editor.edit((builder) => {
    builder.replace(
      new vscode.Range(
        tableBlock.range.start.line,
        tableBlock.range.start.column,
        tableBlock.range.end.line,
        tableBlock.range.end.column
      ),
      writeBack.source
    );
  });

  if (!editApplied) {
    return {
      ok: false,
      diagnostics: [{
        code: "writeback.edit-not-applied",
        severity: "error",
        message: "VS Code did not apply the table edit"
      }]
    };
  }

  return {
    ok: true,
    diagnostics: []
  };
}

export async function applyPlainCellContentsToEditor(
  editor: vscode.TextEditor,
  tableStartOffset: number,
  replacements: readonly CellContentReplacement[]
): Promise<CellContentUpdateResult> {
  const source = editor.document.getText();
  const tableBlock = findAsciiDocTableBlock(source, tableStartOffset);
  if (tableBlock === undefined) {
    return {
      ok: false,
      diagnostics: [{
        code: "writeback.table-not-found",
        severity: "error",
        message: "Target AsciiDoc table block was not found"
      }]
    };
  }

  const writeBack = replacePlainCellContents(parseAsciiDocTable(tableBlock.raw), replacements);
  if (!writeBack.ok) {
    return {
      ok: false,
      diagnostics: writeBack.diagnostics
    };
  }

  const editApplied = await editor.edit((builder) => {
    builder.replace(
      new vscode.Range(
        tableBlock.range.start.line,
        tableBlock.range.start.column,
        tableBlock.range.end.line,
        tableBlock.range.end.column
      ),
      writeBack.source
    );
  });

  if (!editApplied) {
    return {
      ok: false,
      diagnostics: [{
        code: "writeback.edit-not-applied",
        severity: "error",
        message: "VS Code did not apply the table edit"
      }]
    };
  }

  return {
    ok: true,
    diagnostics: []
  };
}

export async function applyRectangularPasteToEditor(
  editor: vscode.TextEditor,
  tableStartOffset: number,
  request: RectangularPastePayload
): Promise<CellContentUpdateResult> {
  const source = editor.document.getText();
  const tableBlock = findAsciiDocTableBlock(source, tableStartOffset);
  if (tableBlock === undefined) {
    return {
      ok: false,
      diagnostics: [{
        code: "writeback.table-not-found",
        severity: "error",
        message: "Target AsciiDoc table block was not found"
      }]
    };
  }

  const writeBack = pasteRectangularPlainTable(parseAsciiDocTable(tableBlock.raw), request);
  if (!writeBack.ok) {
    return {
      ok: false,
      diagnostics: writeBack.diagnostics
    };
  }

  const editApplied = await editor.edit((builder) => {
    builder.replace(
      new vscode.Range(
        tableBlock.range.start.line,
        tableBlock.range.start.column,
        tableBlock.range.end.line,
        tableBlock.range.end.column
      ),
      writeBack.source
    );
  });

  if (!editApplied) {
    return {
      ok: false,
      diagnostics: [{
        code: "writeback.edit-not-applied",
        severity: "error",
        message: "VS Code did not apply the table edit"
      }]
    };
  }

  return {
    ok: true,
    diagnostics: []
  };
}

export async function applyImportedTablePasteToEditor(
  editor: vscode.TextEditor,
  tableStartOffset: number,
  request: ImportedTablePastePayload
): Promise<CellContentUpdateResult> {
  const source = editor.document.getText();
  const tableBlock = findAsciiDocTableBlock(source, tableStartOffset);
  if (tableBlock === undefined) {
    return {
      ok: false,
      diagnostics: [{
        code: "writeback.table-not-found",
        severity: "error",
        message: "Target AsciiDoc table block was not found"
      }]
    };
  }

  const writeBack = pasteImportedTable(parseAsciiDocTable(tableBlock.raw), request);
  if (!writeBack.ok) {
    return {
      ok: false,
      diagnostics: writeBack.diagnostics
    };
  }

  return applyTableBlockReplacement(editor, tableBlock, writeBack);
}

export async function applyBlockCellContentToEditor(
  editor: vscode.TextEditor,
  tableStartOffset: number,
  replacement: BlockCellContentReplacement
): Promise<CellContentUpdateResult> {
  const source = editor.document.getText();
  const tableBlock = findAsciiDocTableBlock(source, tableStartOffset);
  if (tableBlock === undefined) {
    return {
      ok: false,
      diagnostics: [{
        code: "writeback.table-not-found",
        severity: "error",
        message: "Target AsciiDoc table block was not found"
      }]
    };
  }

  const writeBack = replaceBlockCellContent(parseAsciiDocTable(tableBlock.raw), replacement);
  if (!writeBack.ok) {
    return {
      ok: false,
      diagnostics: writeBack.diagnostics
    };
  }

  return applyTableBlockReplacement(editor, tableBlock, writeBack);
}

export async function applyPlainCellBlockContentToEditor(
  editor: vscode.TextEditor,
  tableStartOffset: number,
  replacement: PlainCellBlockReplacement
): Promise<CellContentUpdateResult> {
  const source = editor.document.getText();
  const tableBlock = findAsciiDocTableBlock(source, tableStartOffset);
  if (tableBlock === undefined) {
    return {
      ok: false,
      diagnostics: [{
        code: "writeback.table-not-found",
        severity: "error",
        message: "Target AsciiDoc table block was not found"
      }]
    };
  }

  const writeBack = replacePlainCellWithBlockContent(parseAsciiDocTable(tableBlock.raw), replacement);
  if (!writeBack.ok) {
    return {
      ok: false,
      diagnostics: writeBack.diagnostics
    };
  }

  return applyTableBlockReplacement(editor, tableBlock, writeBack);
}

export async function applyHorizontalMergeToEditor(
  editor: vscode.TextEditor,
  tableStartOffset: number,
  sourceCellIds: readonly string[]
): Promise<CellContentUpdateResult> {
  const source = editor.document.getText();
  const tableBlock = findAsciiDocTableBlock(source, tableStartOffset);
  if (tableBlock === undefined) {
    return {
      ok: false,
      diagnostics: [{
        code: "writeback.table-not-found",
        severity: "error",
        message: "Target AsciiDoc table block was not found"
      }]
    };
  }

  const writeBack = mergePlainCellsHorizontally(parseAsciiDocTable(tableBlock.raw), { sourceCellIds });
  if (!writeBack.ok) {
    return {
      ok: false,
      diagnostics: writeBack.diagnostics
    };
  }

  const editApplied = await editor.edit((builder) => {
    builder.replace(
      new vscode.Range(
        tableBlock.range.start.line,
        tableBlock.range.start.column,
        tableBlock.range.end.line,
        tableBlock.range.end.column
      ),
      writeBack.source
    );
  });

  if (!editApplied) {
    return {
      ok: false,
      diagnostics: [{
        code: "writeback.edit-not-applied",
        severity: "error",
        message: "VS Code did not apply the table edit"
      }]
    };
  }

  return {
    ok: true,
    diagnostics: []
  };
}

async function applyTableBlockReplacement(
  editor: vscode.TextEditor,
  tableBlock: { range: { start: { line: number; column: number }; end: { line: number; column: number } } },
  writeBack: WriteBackResult
): Promise<CellContentUpdateResult> {
  if (!writeBack.ok) {
    return {
      ok: false,
      diagnostics: writeBack.diagnostics
    };
  }

  const editApplied = await editor.edit((builder) => {
    builder.replace(
      new vscode.Range(
        tableBlock.range.start.line,
        tableBlock.range.start.column,
        tableBlock.range.end.line,
        tableBlock.range.end.column
      ),
      writeBack.source
    );
  });

  if (!editApplied) {
    return {
      ok: false,
      diagnostics: [{
        code: "writeback.edit-not-applied",
        severity: "error",
        message: "VS Code did not apply the table edit"
      }]
    };
  }

  return {
    ok: true,
    diagnostics: []
  };
}

export async function applyHorizontalUnmergeToEditor(
  editor: vscode.TextEditor,
  tableStartOffset: number,
  sourceCellId: string
): Promise<CellContentUpdateResult> {
  const source = editor.document.getText();
  const tableBlock = findAsciiDocTableBlock(source, tableStartOffset);
  if (tableBlock === undefined) {
    return {
      ok: false,
      diagnostics: [{
        code: "writeback.table-not-found",
        severity: "error",
        message: "Target AsciiDoc table block was not found"
      }]
    };
  }

  const writeBack = unmergePlainCellHorizontally(parseAsciiDocTable(tableBlock.raw), { sourceCellId });
  if (!writeBack.ok) {
    return {
      ok: false,
      diagnostics: writeBack.diagnostics
    };
  }

  const editApplied = await editor.edit((builder) => {
    builder.replace(
      new vscode.Range(
        tableBlock.range.start.line,
        tableBlock.range.start.column,
        tableBlock.range.end.line,
        tableBlock.range.end.column
      ),
      writeBack.source
    );
  });

  if (!editApplied) {
    return {
      ok: false,
      diagnostics: [{
        code: "writeback.edit-not-applied",
        severity: "error",
        message: "VS Code did not apply the table edit"
      }]
    };
  }

  return {
    ok: true,
    diagnostics: []
  };
}

export async function applyRowColumnEditToEditor(
  editor: vscode.TextEditor,
  tableStartOffset: number,
  message: Pick<RowColumnEditMessage, "type" | "sourceCellId">
): Promise<CellContentUpdateResult> {
  const source = editor.document.getText();
  const tableBlock = findAsciiDocTableBlock(source, tableStartOffset);
  if (tableBlock === undefined) {
    return {
      ok: false,
      diagnostics: [{
        code: "writeback.table-not-found",
        severity: "error",
        message: "Target AsciiDoc table block was not found"
      }]
    };
  }

  const table = parseAsciiDocTable(tableBlock.raw);
  const writeBack = rowColumnWriteBack(table, message);
  if (!writeBack.ok) {
    return {
      ok: false,
      diagnostics: writeBack.diagnostics
    };
  }

  const editApplied = await editor.edit((builder) => {
    builder.replace(
      new vscode.Range(
        tableBlock.range.start.line,
        tableBlock.range.start.column,
        tableBlock.range.end.line,
        tableBlock.range.end.column
      ),
      writeBack.source
    );
  });

  if (!editApplied) {
    return {
      ok: false,
      diagnostics: [{
        code: "writeback.edit-not-applied",
        severity: "error",
        message: "VS Code did not apply the table edit"
      }]
    };
  }

  return {
    ok: true,
    diagnostics: []
  };
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
