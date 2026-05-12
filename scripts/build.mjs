import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import esbuild from "esbuild";

const require = createRequire(import.meta.url);

await esbuild.build({
  entryPoints: ["src/extension/index.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode", "asciidoctor"],
  platform: "node",
  format: "cjs",
  target: "node22",
  sourcemap: process.env.ASCIIDOC_TABLE_SOURCEMAP === "1"
});

const distRoot = join(process.cwd(), "dist");
rmSync(join(distRoot, "node_modules"), { recursive: true, force: true });
const workerRoot = join(distRoot, "workers");
rmSync(workerRoot, { recursive: true, force: true });
mkdirSync(workerRoot, { recursive: true });
cpSync(
  join(process.cwd(), "src", "extension", "asciidoctor-preview-worker.cjs"),
  join(workerRoot, "asciidoctor-preview-worker.cjs")
);

rmSync(join(distRoot, "vendor"), { recursive: true, force: true });
const vendorRoot = join(distRoot, "vendor", "asciidoctor-core-3.0.4", "node_modules");
mkdirSync(vendorRoot, { recursive: true });
copyPackageWithRuntimeDependencies("@asciidoctor/core", vendorRoot);

function copyPackageWithRuntimeDependencies(packageName, root, resolveDirs = [], seen = new Set()) {
  if (seen.has(packageName)) {
    return;
  }
  seen.add(packageName);
  const resolveOptions = resolveDirs.length > 0 ? { paths: resolveDirs } : undefined;
  const sourceDir = packageDir(packageName, resolveOptions);
  const destinationDir = join(root, ...packageName.split("/"));
  mkdirSync(dirname(destinationDir), { recursive: true });
  cpSync(sourceDir, destinationDir, {
    recursive: true,
    dereference: true
  });
  const manifest = JSON.parse(readFileSync(join(sourceDir, "package.json"), "utf8"));
  for (const dependencyName of Object.keys(manifest.dependencies ?? {})) {
    copyPackageWithRuntimeDependencies(dependencyName, root, [sourceDir], seen);
  }
}

function packageDir(packageName, resolveOptions) {
  const packageJsonPath = resolvePackageJson(packageName, resolveOptions);
  return dirname(packageJsonPath);
}

function resolvePackageJson(packageName, resolveOptions) {
  try {
    return require.resolve(`${packageName}/package.json`, resolveOptions);
  } catch {
    // Some packages restrict package.json through "exports"; fall through.
  }
  try {
    let current = dirname(require.resolve(packageName, resolveOptions));
    while (!existsSync(join(current, "package.json"))) {
      const parent = dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
    const packageJsonPath = join(current, "package.json");
    if (existsSync(packageJsonPath)) {
      return packageJsonPath;
    }
  } catch {
    // Some packages have no exported main; fall through to node_modules lookup.
  }
  for (const base of resolveOptions?.paths ?? [process.cwd()]) {
    const packageJsonPath = join(base, "node_modules", ...packageName.split("/"), "package.json");
    if (existsSync(packageJsonPath)) {
      return packageJsonPath;
    }
  }
  throw new Error(`Could not find package root for ${packageName}`);
}
