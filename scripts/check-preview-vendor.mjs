import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Worker } from "node:worker_threads";

const root = process.cwd();
const vendorNodeModulesPath = join(root, "dist", "vendor", "asciidoctor-core-3.0.4", "node_modules");
const workerPath = join(root, "dist", "workers", "asciidoctor-preview-worker.cjs");
if (!existsSync(workerPath)) {
  fail(`Preview worker is missing: ${workerPath}`);
}

const expectedRuntime = new Map([
  ["@asciidoctor/core", "3.0.4"],
  ["@asciidoctor/opal-runtime", "3.0.1"],
  ["glob", "8.1.0"],
  ["minimatch", "5.1.9"],
  ["brace-expansion", "2.1.4"]
]);
for (const [packageName, expectedVersion] of expectedRuntime) {
  checkVendoredPackage(packageName, expectedVersion);
}

const smoke = await renderWithWorker("|===\n| A | B\n|===\n");
if (!smoke.includes("<table") || !smoke.includes("<td")) {
  fail("Preview worker smoke did not render table HTML.");
}

console.log("preview vendor smoke: pass");

function checkVendoredPackage(packageName, expectedVersion) {
  const packageRoot = join(vendorNodeModulesPath, ...packageName.split("/"));
  const packageJsonPath = join(packageRoot, "package.json");
  if (!existsSync(packageJsonPath)) {
    fail(`Vendored package is missing: ${packageJsonPath}`);
  }
  const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  if (manifest.name !== packageName || manifest.version !== expectedVersion) {
    fail(`Unexpected vendored package: ${manifest.name}@${manifest.version}; expected ${packageName}@${expectedVersion}`);
  }
  const entryPath = join(packageRoot, manifest.main ?? "index.js");
  if (!existsSync(entryPath)) {
    fail(`Vendored package entry is missing: ${entryPath}`);
  }
}

function renderWithWorker(source) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, {
      workerData: {
        sources: [source],
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
      const result = Array.isArray(message?.results) ? message.results[0] : undefined;
      if (result?.index === 0 && result.ok === true && typeof result.html === "string") {
        resolve(result.html);
        return;
      }
      reject(new Error(result?.message ?? "Preview worker smoke failed."));
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
