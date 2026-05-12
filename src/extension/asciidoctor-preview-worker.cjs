const { parentPort, workerData } = require("node:worker_threads");
const { createRequire } = require("node:module");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

function renderPreview() {
  const packageJsonPath = join(workerData.vendorNodeModulesPath, "@asciidoctor", "core", "package.json");
  const requireFromVendor = createRequire(packageJsonPath);
  const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  if (manifest.name !== "@asciidoctor/core" || manifest.version !== "3.0.4") {
    throw new Error(`Unexpected Asciidoctor package: ${manifest.name}@${manifest.version}`);
  }

  const factory = requireFromVendor("@asciidoctor/core");
  const processor = factory();
  return String(processor.convert(workerData.source, {
    safe: "safe",
    header_footer: false,
    attributes: {
      showtitle: false
    }
  }));
}

try {
  parentPort.postMessage({
    ok: true,
    html: renderPreview()
  });
} catch (error) {
  parentPort.postMessage({
    ok: false,
    message: error instanceof Error ? error.message : String(error)
  });
}
