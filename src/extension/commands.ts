import * as vscode from "vscode";
import { parseAsciiDocTable } from "../core";
import { registerFormatTableCommand } from "./format-table-command";
import { registerOpenEditorCommand } from "./open-editor-command";
import { AsciiDocTableCodeLensProvider } from "./table-editor-codelens";
import { registerTestCommands } from "./test-commands";

export { type OpenTableEditorCommandResult } from "./command-utils";

export function registerAsciiDocTableCommands(context: vscode.ExtensionContext): void {
  const showParserInfo = vscode.commands.registerCommand("asciidocTable.showParserInfo", () => {
    const editor = vscode.window.activeTextEditor;
    const source = editor?.document.getText() ?? "";
    const parsed = parseAsciiDocTable(source);
    const cellCount = parsed.rows.reduce((sum, row) => sum + row.cells.length, 0);
    void vscode.window.showInformationMessage(
      vscode.l10n.t("AsciiDoc Table parser scaffold is ready.") + ` (${cellCount} cells)`
    );
  });

  context.subscriptions.push(
    showParserInfo,
    registerOpenEditorCommand(),
    registerFormatTableCommand(),
    vscode.languages.registerCodeLensProvider({ language: "asciidoc" }, new AsciiDocTableCodeLensProvider()),
    vscode.languages.registerCodeLensProvider({ language: "adoc" }, new AsciiDocTableCodeLensProvider()),
    ...registerTestCommands()
  );
}
