import * as vscode from "vscode";
import { findAsciiDocTableBlocks } from "../core";
import type { OpenTableEditorTarget } from "./types";

export class AsciiDocTableCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    return findAsciiDocTableBlocks(document.getText()).flatMap((block) => {
      const range = new vscode.Range(block.range.start.line, 0, block.range.start.line, 0);
      const target = {
        documentUri: document.uri.toString(),
        tableStartOffset: block.range.start.offset
      } satisfies OpenTableEditorTarget;
      return [new vscode.CodeLens(range, {
        title: vscode.l10n.t("Open Table Editor"),
        command: "asciidocTable.openEditor",
        arguments: [target]
      }), new vscode.CodeLens(range, {
        title: vscode.l10n.t("Format Table"),
        command: "asciidocTable.formatTable",
        arguments: [target]
      })];
    });
  }
}
