import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sanitizePreviewHtml } from "../../src/app";
import { renderAsciiDocWithVendoredWorker, resolvePreviewVendorNodeModulesPathForSmoke } from "../../src/extension/asciidoctor-worker-renderer";
import { renderTableEditorPreview } from "../../src/extension/table-editor-preview";

describe("table editor preview renderer", () => {
  it("isolates Asciidoctor from a foreign global Opal runtime", async () => {
    const globalObject = globalThis as typeof globalThis & { Opal?: unknown };
    const existingOpal = Object.getOwnPropertyDescriptor(globalThis, "Opal");
    Object.defineProperty(globalThis, "Opal", {
      configurable: true,
      writable: true,
      value: { foreign: true }
    });

    try {
      const result = await renderTableEditorPreview("|===\n| A\n|===\n");

      expect(result.diagnostics).toEqual([]);
      expect(result.preview.tableHtml).toContain("<table");
      expect(globalObject.Opal).toEqual({ foreign: true });
    } finally {
      if (existingOpal === undefined) {
        Reflect.deleteProperty(globalThis, "Opal");
      } else {
        Object.defineProperty(globalThis, "Opal", existingOpal);
      }
    }
  });

  it("renders table and block cell preview HTML", async () => {
    const result = await renderTableEditorPreview("|===\na| * item\n* detail\n|===\n");

    expect(result.diagnostics).toEqual([]);
    expect(result.preview.tableHtml).toContain("<table");
    expect(result.preview.blockCellHtmlBySourceCellId["cell:0:0"]).toContain("<ul>");
    expect(result.preview.blockCellHtmlBySourceCellId["cell:0:0"]).toContain("detail");
  });

  it("keeps Asciidoctor alignment classes for preview CSS", async () => {
    const result = await renderTableEditorPreview("[cols=\"<,^,>\"]\n|===\n<| Left ^| Center >| Right\n|===\n");

    expect(result.diagnostics).toEqual([]);
    expect(result.preview.tableHtml).toContain("halign-left");
    expect(result.preview.tableHtml).toContain("halign-center");
    expect(result.preview.tableHtml).toContain("halign-right");
  });

  it("sanitizes unsafe HTML before it reaches the Webview", () => {
    const sanitized = sanitizePreviewHtml(
      '<p style="color:red" onclick="alert(1)"><a href="javascript:alert(1)">x</a><img src="data:text/html,x"><script>alert(1)</script></p>'
    );

    expect(sanitized).not.toContain("style=");
    expect(sanitized).not.toContain("onclick=");
    expect(sanitized).not.toContain("javascript:");
    expect(sanitized).not.toContain("data:text");
    expect(sanitized).not.toContain("<script");
  });

  it("uses the fixed Asciidoctor core 3.0.4 package for worker rendering", async () => {
    const vendorNodeModulesPath = resolvePreviewVendorNodeModulesPathForSmoke();
    const manifest = JSON.parse(readFileSync(join(vendorNodeModulesPath, "@asciidoctor", "core", "package.json"), "utf8"));
    const result = await renderAsciiDocWithVendoredWorker("|===\n| A\n|===\n", {
      vendorNodeModulesPath
    });

    expect(manifest.name).toBe("@asciidoctor/core");
    expect(manifest.version).toBe("3.0.4");
    expect(result.ok).toBe(true);
    expect(result.html).toContain("<table");
  });

  it("reports worker load failure as a diagnostic fallback", async () => {
    const result = await renderAsciiDocWithVendoredWorker("|===\n| A\n|===\n", {
      vendorNodeModulesPath: join(tmpdir(), "missing-asciidoctor-vendor")
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Vendored Asciidoctor package was not found");
  });

  it("reports worker timeout as a diagnostic fallback", async () => {
    const directory = mkdtempSync(join(tmpdir(), "asciidoc-table-preview-worker-"));
    const workerPath = join(directory, "timeout-worker.cjs");
    writeFileSync(workerPath, "setTimeout(() => {}, 10000);\n", "utf8");
    const result = await renderAsciiDocWithVendoredWorker("|===\n| A\n|===\n", {
      workerPath,
      vendorNodeModulesPath: resolvePreviewVendorNodeModulesPathForSmoke(),
      timeoutMs: 5
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Preview worker timed out");
  });
});
