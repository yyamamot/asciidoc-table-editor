import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..");

describe("release regression documentation", () => {
  it("keeps the release wrapper aligned with documented gates", () => {
    const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const script = readFileSync(join(root, "scripts", "release-regression.mjs"), "utf8");
    const doc = readFileSync(join(root, "docs", "process", "release-regression.md"), "utf8");

    expect(packageJson.scripts["release:regression"]).toBe("node ./scripts/release-regression.mjs");
    for (const command of [
      "pnpm run verify",
      "pnpm run test:package",
      "pnpm run check:asciidoctor-compat",
      "pnpm run perf:large-table",
      "pnpm run perf:codelens",
      "pnpm run review:ui:llm"
    ]) {
      expect(doc).toContain(command);
      const [, scriptName] = command.match(/^pnpm run (.+)$/u) ?? [];
      expect(script).toContain(scriptName);
    }
  });

  it("documents every standard harness scenario in the release or test plan", () => {
    const testPlan = readFileSync(join(root, "docs", "03-test-plan.md"), "utf8");
    const releaseProcedure = readFileSync(join(root, "docs", "process", "release-regression.md"), "utf8");
    const documentedScenarios = `${testPlan}\n${releaseProcedure}`;
    const harnessRoot = join(root, "fixtures", "harness");
    const scenarioIds = readdirSync(harnessRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    for (const scenarioId of scenarioIds) {
      expect(documentedScenarios).toContain(scenarioId);
    }
  });
});
