import * as vscode from "vscode";
import { registerAsciiDocTableCommands } from "./commands";
export type { OpenTableEditorCommandResult } from "./commands";

export function activate(context: vscode.ExtensionContext): void {
  registerAsciiDocTableCommands(context);
}

export function deactivate(): void {
  // No extension resources yet.
}
