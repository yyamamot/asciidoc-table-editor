import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Window } from "happy-dom";
import { sanitizePreviewHtml } from "../../src/app";
import { renderTableEditorHtml } from "../../src/app";
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

  it("applies the preview security corpus with a static allowlist", () => {
    const corpus = JSON.parse(readFileSync(join(process.cwd(), "fixtures", "security", "preview-xss-corpus.json"), "utf8")) as Array<{
      id: string;
      input: string;
      absent: string[];
      present: string[];
    }>;
    for (const fixture of corpus) {
      const sanitized = sanitizePreviewHtml(fixture.input);
      for (const value of fixture.absent) expect(sanitized, fixture.id).not.toContain(value);
      for (const value of fixture.present) expect(sanitized, fixture.id).toContain(value);
    }
  });

  it("sanitizes the security fixture through the complete Preview renderer", async () => {
    const source = readFileSync(join(process.cwd(), "fixtures", "security", "preview-security.adoc"), "utf8");
    const result = await renderTableEditorPreview(source);
    const html = [result.preview.tableHtml, ...Object.values(result.preview.blockCellHtmlBySourceCellId)].join("\n");
    const window = new Window({ url: "https://webview.test/" });
    window.document.body.innerHTML = html;

    expect(result.diagnostics).toEqual([]);
    expect(window.document.querySelector('a[href="https://example.com/safe"]')?.textContent).toBe("safe link");
    expect(window.document.querySelector("script, style, form, iframe, object, embed, svg, math, base, meta, link")).toBeNull();
    expect(window.document.querySelector("[src], [action], [formaction], [xlink\\:href], [onload], [onerror], [onclick]")).toBeNull();
    window.close();
  });

  it("allows only explicit absolute and fragment link forms", () => {
    const sanitized = sanitizePreviewHtml([
      '<a href="https://example.com/a?b=1&amp;c=2">https</a>',
      '<a href="http://example.com">http</a>',
      '<a href="mailto:user@example.com">mail</a>',
      '<a href="#section">fragment</a>',
      '<h2 id="_section">Section</h2>',
      '<a href="#_section">heading fragment</a>',
      '<a href="relative/path">relative</a>',
      '<a href="//example.com">protocol relative</a>'
    ].join(""));

    expect(sanitized).toContain('href="https://example.com/a?b=1&amp;c=2"');
    expect(sanitized).toContain('href="http://example.com"');
    expect(sanitized).toContain('href="mailto:user@example.com"');
    expect(sanitized).toContain('href="#preview-section"');
    expect(sanitized).toContain('id="preview-_section"');
    expect(sanitized).toContain('href="#preview-_section"');
    expect(sanitized).not.toContain('href="relative/path"');
    expect(sanitized).not.toContain('href="//example.com"');
  });

  it("uses restrictive navigation, form, object, and frame CSP directives", () => {
    const html = renderTableEditorHtml({
      mode: "fallback",
      rowCount: 0,
      columnCount: 0,
      rows: [],
      cells: [],
      diagnostics: [],
      source: "",
      preview: { tableHtml: "", blockCellHtmlBySourceCellId: {} }
    } as never, "test-nonce");

    expect(html).toContain("base-uri 'none'");
    expect(html).toContain("form-action 'none'");
    expect(html).toContain("object-src 'none'");
    expect(html).toContain("frame-src 'none'");
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
