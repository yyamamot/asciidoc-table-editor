import * as vscode from "vscode";

let latestTableEditorPanel: vscode.WebviewPanel | undefined;

export function createTableEditorPanel(): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    "asciidocTableEditor",
    vscode.l10n.t("AsciiDoc Table Editor"),
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );
  latestTableEditorPanel = panel;
  panel.onDidDispose(() => {
    if (latestTableEditorPanel === panel) {
      latestTableEditorPanel = undefined;
    }
  });
  return panel;
}

export function latestPanel(): vscode.WebviewPanel | undefined {
  return latestTableEditorPanel;
}
