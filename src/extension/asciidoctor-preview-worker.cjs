const { parentPort, workerData } = require("node:worker_threads");
const { createRequire } = require("node:module");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

function createProcessor() {
  const packageJsonPath = join(workerData.vendorNodeModulesPath, "@asciidoctor", "core", "package.json");
  const requireFromVendor = createRequire(packageJsonPath);
  const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  if (manifest.name !== "@asciidoctor/core" || manifest.version !== "3.0.4") {
    throw new Error(`Unexpected Asciidoctor package: ${manifest.name}@${manifest.version}`);
  }

  const factory = requireFromVendor("@asciidoctor/core");
  return factory();
}

function renderPreview(processor, source) {
  return String(processor.convert(source, {
    safe: "safe",
    header_footer: false,
    attributes: {
      showtitle: false
    }
  }));
}

try {
  const processor = createProcessor();
  const sources = Array.isArray(workerData.sources) ? workerData.sources : [];
  parentPort.postMessage({
    results: sources.map((source, index) => {
      try {
        return { index, ok: true, html: renderPreview(processor, source) };
      } catch (error) {
        return { index, ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    })
  });
} catch (error) {
  parentPort.postMessage({
    results: (Array.isArray(workerData.sources) ? workerData.sources : []).map((_source, index) => ({
      index,
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    }))
  });
}
