import assert from "node:assert/strict";
import * as vscode from "vscode";
import { closeAllEditors, openAsciiDocDocument } from "./host-harness";

export async function testAsciiDocTableFormatCodeLensShowsReview(): Promise<void> {
  const editor = await openAsciiDocDocument([
    "|===",
    "| A | Long",
    "| Alpha | B",
    "|==="
  ].join("\n"));

  const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
    "vscode.executeCodeLensProvider",
    editor.document.uri
  );
  const formatLens = lenses.find((lens) => lens.command?.command === "asciidocTable.formatTable");
  assert.ok(formatLens?.command, "Format Table CodeLens was not provided");

  const result = await vscode.commands.executeCommand<{
    ok: boolean;
    model?: { formatReview?: { variants: Array<{ mode: string; after: string }> } };
  }>(
    formatLens.command.command,
    ...(formatLens.command.arguments ?? [])
  );

  assert.equal(result.ok, true, "Format Table CodeLens should open a format review");
  assert.ok(result.model?.formatReview?.variants.some((variant) => variant.mode === "table-layout" && variant.after.includes("| A     | Long")), "format review should include aligned source");
  await closeAllEditors();
}

