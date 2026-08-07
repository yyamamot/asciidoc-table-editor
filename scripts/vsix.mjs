import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import yauzl from "yauzl";

const mode = process.argv[2] ?? "package";
const extensionId = "yyamamot.asciidoc-table-editor";

if (!["package", "smoke", "install", "uninstall"].includes(mode)) {
  throw new Error(`Unknown vsix mode: ${mode}`);
}

if (mode === "uninstall") {
  run("code", ["--uninstall-extension", extensionId]);
} else {
  const manifest = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
  const transientRoot = mode === "package" ? undefined : mkdtempSync(join(tmpdir(), "ate-vsix-"));
  const vsixPath = join(transientRoot ?? process.cwd(), `${manifest.name}-${manifest.version}.vsix`);
  try {
    packageVsix(vsixPath);
    if (mode === "smoke" || mode === "install") {
      await verifyVsixRuntime(vsixPath);
    }
    if (mode === "install") {
      run("code", ["--install-extension", vsixPath, "--force"]);
    }
  } finally {
    if (transientRoot !== undefined) {
      rmSync(transientRoot, { recursive: true, force: true });
    }
  }
}

function packageVsix(vsixPath) {
  run("pnpm", ["exec", "vsce", "package", "--no-dependencies", "--allow-missing-repository", "--out", vsixPath]);
}

async function verifyVsixRuntime(vsixPath) {
  const vendorRoot = "extension/dist/vendor/asciidoctor-core-3.0.4/node_modules";
  const expectedRuntime = new Map([
    ["@asciidoctor/core", "3.0.4"],
    ["@asciidoctor/opal-runtime", "3.0.1"],
    ["glob", "8.1.0"],
    ["minimatch", "5.1.9"],
    ["brace-expansion", "2.1.3"]
  ]);
  const packageRoots = new Map([...expectedRuntime.keys()].map((packageName) => [packageName, `${vendorRoot}/${packageName}`]));
  const manifestPaths = new Set([...packageRoots.values()].map((packageRoot) => `${packageRoot}/package.json`));
  const archive = await readArchive(vsixPath, manifestPaths);

  for (const [packageName, expectedVersion] of expectedRuntime) {
    const packageRoot = packageRoots.get(packageName);
    const manifestPath = `${packageRoot}/package.json`;
    const packageManifest = parseArchiveJson(archive.contents, manifestPath);
    if (packageManifest.name !== packageName || packageManifest.version !== expectedVersion) {
      throw new Error(`Unexpected VSIX package: ${packageManifest.name}@${packageManifest.version}; expected ${packageName}@${expectedVersion}`);
    }
    requireArchiveEntry(archive.names, posix.join(packageRoot, packageManifest.main ?? "index.js"));
  }
  requireArchiveEntry(archive.names, "extension/dist/workers/asciidoctor-preview-worker.cjs");
}

function parseArchiveJson(contents, entryPath) {
  const source = contents.get(entryPath);
  if (source === undefined) {
    throw new Error(`VSIX archive entry is missing: ${entryPath}`);
  }
  try {
    return JSON.parse(source.toString("utf8"));
  } catch (error) {
    throw new Error(`VSIX archive entry is not valid JSON: ${entryPath}`, { cause: error });
  }
}

function requireArchiveEntry(names, entryPath) {
  if (!names.has(entryPath)) {
    throw new Error(`VSIX archive entry is missing: ${entryPath}`);
  }
}

function readArchive(vsixPath, requestedContents) {
  return new Promise((resolve, reject) => {
    yauzl.open(vsixPath, { lazyEntries: true }, (openError, archive) => {
      if (openError || archive === undefined) {
        reject(openError ?? new Error(`Could not open VSIX archive: ${vsixPath}`));
        return;
      }
      const names = new Set();
      const contents = new Map();
      archive.once("error", reject);
      archive.on("entry", (entry) => {
        names.add(entry.fileName);
        if (!requestedContents.has(entry.fileName)) {
          archive.readEntry();
          return;
        }
        archive.openReadStream(entry, (streamError, stream) => {
          if (streamError || stream === undefined) {
            archive.close();
            reject(streamError ?? new Error(`Could not read VSIX archive entry: ${entry.fileName}`));
            return;
          }
          const chunks = [];
          stream.on("data", (chunk) => chunks.push(chunk));
          stream.once("error", reject);
          stream.once("end", () => {
            contents.set(entry.fileName, Buffer.concat(chunks));
            archive.readEntry();
          });
        });
      });
      archive.once("end", () => resolve({ names, contents }));
      archive.readEntry();
    });
  });
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${command} failed with exit code ${result.status ?? 1}`);
  }
}
