import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createWebviewAppModel, DEFAULT_TABLE_EDITOR_LABELS, renderTableEditorHtml, type TableEditorWebviewLabels } from "../../src/app";
import { parseAsciiDocTable, projectGridModel } from "../../src/core";

describe("l10n coverage", () => {
  it("keeps package and runtime English/Japanese bundles aligned", () => {
    expect(Object.keys(readJson("package.nls.ja.json")).sort()).toEqual(Object.keys(readJson("package.nls.json")).sort());
    expect(Object.keys(readJson("l10n/bundle.l10n.ja.json")).sort()).toEqual(Object.keys(readJson("l10n/bundle.l10n.json")).sort());
  });

  it("covers extension vscode.l10n.t string literals in runtime bundles", () => {
    const source = [
      "src/extension/index.ts",
      "src/extension/commands.ts",
      "src/extension/format-command.ts",
      "src/extension/panel.ts",
      "src/extension/table-editor-labels.ts"
    ].map((path) => readFileSync(path, "utf8")).join("\n");
    const english = readJson("l10n/bundle.l10n.json");
    const japanese = readJson("l10n/bundle.l10n.ja.json");
    const keys = [...source.matchAll(/vscode\.l10n\.t\("([^"]+)"/gu)].map((match) => match[1]);

    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((key) => english[key] === undefined)).toEqual([]);
    expect(keys.filter((key) => japanese[key] === undefined)).toEqual([]);
  });

  it("passes the active VS Code locale through every production Webview render path", () => {
    const source = [
      "src/extension/open-editor-command.ts",
      "src/extension/format-table-command.ts",
      "src/extension/command-utils.ts",
      "src/extension/command-webview-handlers.ts"
    ].map((path) => readFileSync(path, "utf8")).join("\n");
    const renderCalls = source.split("\n").filter((line) => line.includes("renderTableEditorHtml(") && !line.startsWith("import "));

    expect(renderCalls).toHaveLength(6);
    expect(renderCalls.every((line) => line.includes("locale: vscode.env.language"))).toBe(true);
  });

  it("covers every finite production diagnostic code from the shared catalog", () => {
    const portable = diagnosticCodes(readFileSync("src/app/labels.ts", "utf8"));
    const production = productionDiagnosticCodes();
    const extensionSource = readFileSync("src/extension/table-editor-labels.ts", "utf8");
    const english = readJson("l10n/bundle.l10n.json");
    const japanese = readJson("l10n/bundle.l10n.ja.json");

    expect(portable.length).toBeGreaterThan(0);
    expect(production.filter((code) => !portable.includes(code))).toEqual([]);
    expect(extensionSource).toContain("Object.entries(DEFAULT_TABLE_EDITOR_LABELS.diagnosticMessages)");
    expect(Object.values(DEFAULT_TABLE_EDITOR_LABELS.diagnosticMessages).filter((message) => english[message] === undefined)).toEqual([]);
    expect(Object.values(DEFAULT_TABLE_EDITOR_LABELS.diagnosticMessages).filter((message) => japanese[message] === undefined)).toEqual([]);
  });

  it("renders Webview labels from the provided label table", () => {
    const model = createWebviewAppModel(projectGridModel(parseAsciiDocTable("|===\n| A | B\n|===\n")));
    const labels = japaneseLabels();
    const html = renderTableEditorHtml(model, "testNonce", {}, labels);

    expect(html).toContain("上に行を挿入");
    expect(html).toContain("選択セル");
    expect(html).toContain("セル内容を適用");
    expect(html).not.toContain("Insert row above");
  });

  it("renders localized diagnostic messages and raw codes without exposing core messages", () => {
    const model = createWebviewAppModel(projectGridModel(parseAsciiDocTable("|===\n| A\n|===\n")), {
      diagnostics: [
        { code: "writeback.table-changed", severity: "error", message: "CORE_SECRET_TABLE_CHANGED" },
        { code: "unknown.private-detail", severity: "warning", message: "CORE_SECRET_UNKNOWN" },
        { code: "constructor", severity: "error", message: "CORE_SECRET_CONSTRUCTOR" },
        { code: "toString", severity: "error", message: "CORE_SECRET_TO_STRING" },
        { code: "__proto__", severity: "error", message: "CORE_SECRET_PROTO" }
      ]
    });
    const html = renderTableEditorHtml(model, "testNonce", { locale: "ja-JP" }, japaneseLabels());

    expect(html).toContain('<html lang="ja">');
    expect(html).toContain("writeback.table-changed: 対象の AsciiDoc テーブルがエディター外で変更されました。");
    expect(html).toContain("unknown.private-detail: 操作を完了できませんでした。");
    expect(html).toContain("constructor: 操作を完了できませんでした。");
    expect(html).toContain("toString: 操作を完了できませんでした。");
    expect(html).toContain("__proto__: 操作を完了できませんでした。");
    expect(html).not.toContain("CORE_SECRET_TABLE_CHANGED");
    expect(html).not.toContain("CORE_SECRET_UNKNOWN");
    expect(html).not.toContain("CORE_SECRET_CONSTRUCTOR");
    expect(html).not.toContain("CORE_SECRET_TO_STRING");
    expect(html).not.toContain("CORE_SECRET_PROTO");
    expect(model.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      "CORE_SECRET_TABLE_CHANGED",
      "CORE_SECRET_UNKNOWN",
      "CORE_SECRET_CONSTRUCTOR",
      "CORE_SECRET_TO_STRING",
      "CORE_SECRET_PROTO"
    ]);
  });
});

function readJson(path: string): Record<string, string> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
}

function diagnosticCodes(source: string): string[] {
  return [...source.matchAll(/^\s+"([a-z][a-z0-9.-]+)":/gmu)]
    .map((match) => match[1])
    .filter((code) => code.includes("."))
    .sort();
}

function productionDiagnosticCodes(): string[] {
  const excluded = new Set([
    "src/app/labels.ts",
    "src/extension/table-editor-labels.ts",
    "src/logging/index.ts"
  ]);
  const source = sourceFiles("src")
    .filter((path) => !excluded.has(path))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  const literalCodes = [...source.matchAll(/["'`](block-cell|cell|format|grid|import|paste|preview|source-cell-reveal|table|webview|writeback)\.[a-z0-9.-]+["'`]/gu)]
    .map((match) => match[0].slice(1, -1));
  const finiteDynamicCodes = [
    "writeback.revision-mismatch",
    "writeback.document-replaced",
    "writeback.table-not-found",
    "writeback.table-ambiguous",
    "writeback.table-changed",
    "writeback.expected-raw-mismatch",
    "writeback.apply-raced",
    "writeback.undo-failed",
    "writeback.redo-failed",
    "writeback.no-active-editor",
    "source-cell-reveal.no-active-editor",
    "source-cell-reveal.table-not-found"
  ];
  return [...new Set([...literalCodes, ...finiteDynamicCodes])].sort();
}

function sourceFiles(path: string): string[] {
  return readdirSync(path).flatMap((entry) => {
    const child = `${path}/${entry}`;
    return statSync(child).isDirectory() ? sourceFiles(child) : child.endsWith(".ts") ? [child] : [];
  });
}

function japaneseLabels(): TableEditorWebviewLabels {
  const bundle = readJson("l10n/bundle.l10n.ja.json");
  return {
    title: bundle["AsciiDoc Table Editor"],
    tableGrid: bundle["AsciiDoc table grid"],
    editCommands: bundle["Edit commands"],
    undo: bundle.Undo,
    redo: bundle.Redo,
    edit: bundle.Edit,
    preview: bundle.Preview,
    format: bundle.Format,
    merge: bundle.Merge,
    mergeSelectedCells: bundle["Merge selected cells"],
    unmerge: bundle.Unmerge,
    unmergeSelectedCell: bundle["Unmerge selected cell"],
    rowsLabel: bundle.rows,
    columnsLabel: bundle.columns,
    cellContextMenu: bundle["Cell context menu"],
    insertRowAbove: bundle["Insert row above"],
    insertRowBelow: bundle["Insert row below"],
    insertColumnLeft: bundle["Insert column left"],
    insertColumnRight: bundle["Insert column right"],
    removeRow: bundle["Remove row"],
    removeColumn: bundle["Remove column"],
    selectedCell: bundle["Selected Cell"],
    cell: bundle.Cell,
    kind: bundle.Kind,
    position: bundle.Position,
    span: bundle.Span,
    state: bundle.State,
    grid: bundle.Grid,
    content: bundle.Content,
    raw: bundle.Raw,
    blockCell: bundle["Block cell"],
    editContent: bundle["Edit content"],
    applyCellContent: bundle["Apply Cell Content"],
    blockSource: bundle["Block Source"],
    applyBlockSource: bundle["Apply Block Source"],
    tablePreview: bundle["Table preview"],
    blockPreview: bundle["Block preview"],
    row: bundle.row,
    column: bundle.column,
    readonly: bundle.readonly,
    editable: bundle.editable,
    coveredBy: bundle["Covered by"],
    editing: bundle.Editing,
    noDiagnostics: bundle["No diagnostics"],
    copiedSelectedRange: bundle["Copied selected range."],
    copiedSelectedCell: bundle["Copied selected cell."],
    copyBlockedPlainRange: bundle["Copy blocked: range must contain only editable unmerged plain cells."],
    pasteBlockedPlainRange: bundle["Paste blocked: target range must contain only editable unmerged plain cells."],
    pasteBlockedMergedOverlap: bundle["Paste blocked: target range overlaps a merged cell."],
    clearBlockedPlainRange: bundle["Clear blocked: target range must contain only editable unmerged plain cells."],
    mergeBlockedTooSmall: bundle["Merge blocked: select at least two cells."],
    mergeBlockedPlainRange: bundle["Merge blocked: target range must contain only editable origin cells."],
    mergeBlockedHorizontalOnly: bundle["Merge blocked: target range must form a rectangle."],
    unmergeBlockedOrigin: bundle["Unmerge blocked: select a merged origin cell."],
    unmergeBlockedHorizontalOnly: bundle["Unmerge blocked: selected cell is not merged."],
    unmergeBlockedNotMerged: bundle["Unmerge blocked: selected cell is not merged."],
    structureEditBlockedOrigin: bundle["Structure edit blocked: select an origin cell."],
    styleEditBlockedPlainRange: bundle["Style edit blocked: target range must contain only editable unmerged plain cells."],
    rowColumnEdit: bundle["Row/column edit"],
    mergeOperation: bundle.Merge,
    unmergeOperation: bundle.Unmerge,
    cellStyleUpdate: bundle["Cell style update"],
    tableSettingsUpdate: bundle["Table settings update"],
    cellUpdate: bundle["Cell update"],
    blockCellUpdate: bundle["Block cell update"],
    undoRedo: bundle["Undo/redo"],
    previewRender: bundle["Preview render"],
    formatTable: bundle["Format Table"],
    formatReview: bundle["Format Review"],
    tableLayout: bundle["Table layout"],
    cellPerLine: bundle["Cell-per-line"],
    applyFormat: bundle["Apply Format"],
    cancelFormat: bundle.Cancel,
    changedLines: bundle["Changed lines"],
    formattedRows: bundle["Formatted rows"],
    preservedRows: bundle["Preserved rows"],
    before: bundle.Before,
    after: bundle.After,
    pasteBlockedImportedSpan: bundle["Paste blocked: imported table spans are not supported yet."],
    pasteBlockedImportedRagged: bundle["Paste blocked: imported table must be rectangular."],
    pasteBlockedImportedTable: bundle["Paste blocked: clipboard table could not be parsed."],
    pasteBlockedBlockMultiCell: bundle["Paste blocked: table paste must start from a plain cell, not a block cell."],
    pasteRichContentDropped: bundle["Pasted unsupported rich clipboard content with limited formatting."],
    fallbackGuidanceTitle: bundle["Structured editing is disabled for this table."],
    fallbackGuidanceBody: bundle["Review the diagnostics to see why this table is read-only in the grid."],
    focusDiagnostics: bundle["Focus diagnostics"],
    operationAppliedMessage: bundle["{operation} applied."],
    operationInProgressMessage: bundle["Applying table change…"],
    operationBlockedMessage: bundle["{operation} failed: {message} ({code})"],
    operationBlockedWithoutDetailMessage: bundle["{operation} failed."],
    unknownDiagnosticMessage: bundle["The operation could not be completed."],
    diagnosticMessages: {
      "writeback.table-changed": bundle["The target AsciiDoc table changed outside the editor."]
    },
    alignLeft: bundle["Align left"],
    alignCenter: bundle["Align center"],
    alignRight: bundle["Align right"],
    valignTop: bundle["Vertical align top"],
    valignMiddle: bundle["Vertical align middle"],
    valignBottom: bundle["Vertical align bottom"],
    cellStyle: bundle["Cell style"],
    tableSettings: bundle["Table settings"],
    markHeader: bundle.Header,
    markNoHeader: bundle["No header"],
    toggleFooter: bundle.Footer,
    columnSpec: bundle["Column spec"],
    applyColumnSpec: bundle["Apply Column Spec"],
    tableAppearance: bundle["Table appearance"],
    applyTableAppearance: bundle["Apply Table Appearance"],
    tableTitle: bundle.Title,
    tableId: bundle.ID,
    tableRole: bundle.Role,
    width: bundle.Width,
    autowidth: bundle.Autowidth,
    frame: bundle.Frame,
    stripes: bundle.Stripes
  };
}
