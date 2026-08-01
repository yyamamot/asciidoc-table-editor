import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTests } from "@vscode/test-electron";
import {
  resolveVSCodeTestExecutable,
  type VSCodeTestTarget
} from "../support/vscode-test-launcher";

async function main(): Promise<void> {
  const workspacePath = process.cwd();
  const runRoot = mkdtempSync(join(tmpdir(), "ate-host-"));
  const userDataDir = join(runRoot, "user-data");
  const extensionsDir = join(runRoot, "extensions");
  mkdirSync(userDataDir, { recursive: true });
  mkdirSync(extensionsDir, { recursive: true });
  const target = parseTarget(process.argv.slice(2));
  const executable = await resolveVSCodeTestExecutable({ workspacePath, target });
  console.log([
    "VS Code Host test launcher:",
    `target=${target}`,
    `version=${executable.requestedVersion}`,
    `platform=${executable.platform}`,
    `cache=${executable.cacheState}`,
    `executable=${executable.executablePath}`
  ].join(" "));

  await runTests({
    vscodeExecutablePath: executable.executablePath,
    extensionDevelopmentPath: workspacePath,
    extensionTestsPath: join(workspacePath, "out", "test", "integration-host", "suite.js"),
    launchArgs: [
      join(workspacePath, "fixtures", "lossless"),
      "--user-data-dir",
      userDataDir,
      "--extensions-dir",
      extensionsDir
    ],
    extensionTestsEnv: {
      ASCIIDOC_TABLE_ENABLE_TEST_COMMANDS: "1"
    }
  });
}

function parseTarget(args: readonly string[]): VSCodeTestTarget {
  let target: VSCodeTestTarget = "current";
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--target") {
      const value = args[index + 1];
      if (value !== "current" && value !== "minimum") {
        throw new Error(`--target must be current or minimum, received: ${value ?? "missing"}`);
      }
      target = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown Host test launcher argument: ${arg}`);
  }
  return target;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
