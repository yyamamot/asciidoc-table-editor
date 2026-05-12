import { spawnSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const mode = process.argv[2] ?? "package";
const extensionId = "yyamamot.asciidoc-table-editor";

if (!["package", "smoke", "install", "uninstall"].includes(mode)) {
  console.error(`Unknown vsix mode: ${mode}`);
  process.exit(2);
}

if (mode === "uninstall") {
  run("code", ["--uninstall-extension", extensionId]);
  process.exit(0);
}

const vsixPath = packageVsix();

if (mode === "install") {
  run("code", ["--install-extension", vsixPath, "--force"]);
}

if (mode === "smoke" || mode === "install") {
  cleanupVsix();
}

function packageVsix() {
  run("pnpm", ["exec", "vsce", "package", "--no-dependencies", "--allow-missing-repository"]);
  const entries = readdirSync(process.cwd())
    .filter((entry) => entry.endsWith(".vsix"))
    .sort();
  const latest = entries.at(-1);
  if (latest === undefined) {
    console.error("VSIX package was not created.");
    process.exit(1);
  }
  return join(process.cwd(), latest);
}

function cleanupVsix() {
  for (const entry of readdirSync(process.cwd())) {
    if (entry.endsWith(".vsix")) {
      rmSync(entry);
    }
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit"
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
