import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Worker } from "node:worker_threads";

const root = process.cwd();
const vendorNodeModulesPath = join(root, "dist", "vendor", "asciidoctor-core-3.0.4", "node_modules");
const packageJsonPath = join(vendorNodeModulesPath, "@asciidoctor", "core", "package.json");
const workerPath = join(root, "dist", "workers", "asciidoctor-preview-worker.cjs");

if (!existsSync(packageJsonPath)) {
  fail(`Vendored Asciidoctor package is missing: ${packageJsonPath}`);
}
if (!existsSync(workerPath)) {
  fail(`Preview worker is missing: ${workerPath}`);
}

const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8"));
if (manifest.name !== "@asciidoctor/core" || manifest.version !== "3.0.4") {
  fail(`Unexpected vendored package: ${manifest.name}@${manifest.version}`);
}

const smoke = await renderWithWorker("|===\n| A | B\n|===\n");
if (!smoke.includes("<table") || !smoke.includes("<td")) {
  fail("Preview worker smoke did not render table HTML.");
}

console.log("preview vendor smoke: pass");

function renderWithWorker(source) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, {
      workerData: {
        source,
        vendorNodeModulesPath
      }
    });
    const timeout = setTimeout(() => {
      void worker.terminate();
      reject(new Error("Preview worker smoke timed out."));
    }, 10_000);

    worker.once("message", (message) => {
      clearTimeout(timeout);
      void worker.terminate();
      if (message?.ok === true && typeof message.html === "string") {
        resolve(message.html);
        return;
      }
      reject(new Error(message?.message ?? "Preview worker smoke failed."));
    });
    worker.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
