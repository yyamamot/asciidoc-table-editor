import assert from "node:assert/strict";
import * as vscode from "vscode";
import { closeAllEditors, openAsciiDocDocument } from "./host-harness";

export async function testAsciiDocTableFormatCodeLensShowsReview(): Promise<void> {
  const editor = await openAsciiDocDocument(['[cols="1<,2^m"]', "|===", "| Name | Value", "", "| Alpha | B", "|==="].join("\n"));

  const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>("vscode.executeCodeLensProvider", editor.document.uri);
  const formatLens = lenses.find((lens) => lens.command?.command === "asciidocTable.formatTable");
  assert.ok(formatLens?.command, "Format Table CodeLens was not provided");

  const result = await vscode.commands.executeCommand<{
    ok: boolean;
    model?: { formatReview?: { variants: Array<{ mode: string; after: string }> } };
  }>(formatLens.command.command, ...(formatLens.command.arguments ?? []));

  assert.equal(result.ok, true, "Format Table CodeLens should open a format review");
  const tableLayout = result.model?.formatReview?.variants.find((variant) => variant.mode === "table-layout");
  const cellPerLine = result.model?.formatReview?.variants.find((variant) => variant.mode === "cell-per-line");
  assert.ok(
    tableLayout?.after.includes('[cols="1<,2^m"]\n[%header]\n|==='),
    "table-layout review should materialize an implicit header before removing its blank separator"
  );
  assert.ok(tableLayout?.after.includes("| Name  | Value"), "table-layout review should include aligned source");
  assert.ok(cellPerLine?.after.includes('[cols="1<,2^m"]'), "cell-per-line review should preserve custom column semantics");
  assert.equal(cellPerLine?.after.includes("[cols=2*]"), false, "cell-per-line review should not replace an existing cols attribute");
  await closeAllEditors();
}
