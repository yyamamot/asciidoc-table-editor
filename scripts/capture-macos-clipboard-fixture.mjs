#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const fixtureId = process.argv[2];
if (!fixtureId || fixtureId.startsWith("-")) {
  console.error("Usage: pnpm run capture:clipboard-fixture -- <fixture-id>");
  process.exit(2);
}

const capture = runPython();
const fixtureRoot = join(root, "fixtures", "import", "clipboard");
mkdirSync(fixtureRoot, { recursive: true });

const metadata = {
  fixtureId,
  capturedAt: new Date().toISOString(),
  clipboardInfo: clipboardInfo(),
  types: capture.types,
  htmlType: capture.htmlType,
  textType: capture.textType
};

if (capture.html) {
  writeFileSync(join(fixtureRoot, `${fixtureId}.html`), capture.html, "utf8");
}
if (capture.text) {
  writeFileSync(join(fixtureRoot, `${fixtureId}.txt`), capture.text, "utf8");
}
writeFileSync(join(fixtureRoot, `${fixtureId}.metadata.json`), JSON.stringify(metadata, null, 2), "utf8");

console.log(`clipboard fixture: ${fixtureId}`);
console.log(`html: ${capture.html ? `fixtures/import/clipboard/${fixtureId}.html` : "not found"}`);
console.log(`text: ${capture.text ? `fixtures/import/clipboard/${fixtureId}.txt` : "not found"}`);
console.log(`metadata: fixtures/import/clipboard/${fixtureId}.metadata.json`);

function runPython() {
  const script = String.raw`
import json
import sys
try:
    from AppKit import NSPasteboard
except Exception as exc:
    print(json.dumps({"error": "AppKit import failed: " + str(exc)}))
    sys.exit(0)

pb = NSPasteboard.generalPasteboard()
types = [str(t) for t in (pb.types() or [])]
html_candidates = ["public.html", "Apple HTML pasteboard type"]
text_candidates = ["public.utf8-plain-text", "public.utf16-plain-text", "NSStringPboardType", "public.plain-text"]
html = None
html_type = None
for candidate in html_candidates:
    value = pb.stringForType_(candidate)
    if value:
        html = str(value)
        html_type = candidate
        break
text = None
text_type = None
for candidate in text_candidates:
    value = pb.stringForType_(candidate)
    if value:
        text = str(value)
        text_type = candidate
        break
print(json.dumps({
    "types": types,
    "html": html,
    "htmlType": html_type,
    "text": text,
    "textType": text_type
}))
`;
  const result = spawnSync("/usr/bin/python3", ["-c", script], {
    cwd: root,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `python capture failed with ${result.status}`);
  }
  const parsed = JSON.parse(result.stdout || "{}");
  if (parsed.error) {
    throw new Error(parsed.error);
  }
  return parsed;
}

function clipboardInfo() {
  const result = spawnSync("osascript", ["-e", "clipboard info"], {
    cwd: root,
    encoding: "utf8"
  });
  return result.status === 0 ? result.stdout.trim() : "";
}
