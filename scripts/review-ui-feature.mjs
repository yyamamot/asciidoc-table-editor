#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const scenarioAliases = new Map([
  ["smoke", { path: "fixtures/harness/table-grid-smoke/scenario.json" }],
  ["table-grid", { path: "fixtures/harness/table-grid-smoke/scenario.json" }],
  ["fallback", { path: "fixtures/harness/fallback/scenario.json" }],
  ["merge-cells", { path: "fixtures/harness/merge-cells/scenario.json" }],
  ["unmerge-cells", { path: "fixtures/harness/unmerge-cells/scenario.json" }],
  ["block-cell-readonly", { path: "fixtures/harness/block-cell-readonly/scenario.json" }],
  ["diagnostics", { path: "fixtures/harness/diagnostics/scenario.json" }],
  ["ja-responsive", { path: "fixtures/harness/ja-responsive/scenario.json" }],
  ["large-table", { path: "fixtures/harness/large-table/scenario.json" }],
  ["large-table-scroll", { path: "fixtures/harness/large-table/scenario.json" }],
  ["table-spec-header-footer", { path: "fixtures/harness/table-spec-header-footer/scenario.json" }],
  ["table-spec-column-cell-spec", { path: "fixtures/harness/table-spec-column-cell-spec/scenario.json" }],
  ["official-table-syntax-compat", { path: "fixtures/harness/official-table-syntax-compat/scenario.json" }],
  ["table-attribute-preview", { path: "fixtures/harness/table-attribute-preview/scenario.json" }],
  ["block-cell-boundary", { path: "fixtures/harness/block-cell-boundary/scenario.json" }],
  ["clipboard-auto-expand-paste", { path: "fixtures/harness/clipboard-auto-expand-paste/scenario.json" }],
  ["clipboard-merged-cell-paste", { path: "fixtures/harness/clipboard-merged-cell-paste/scenario.json" }],
  ["block-cell-paste", { path: "fixtures/harness/block-cell-paste/scenario.json" }],
  ["duplicate-cells", { path: "fixtures/harness/duplicate-cells/scenario.json" }],
  ["clipboard-rich-content-diagnostics", { path: "fixtures/harness/clipboard-rich-content-diagnostics/scenario.json" }],
  ["unsupported-data-table", { path: "fixtures/harness/unsupported-data-table/scenario.json" }],
  ["nested-table-non-goal", { path: "fixtures/harness/nested-table-non-goal/scenario.json" }],
  ["preview-comprehensive", { path: "fixtures/harness/preview-comprehensive/scenario.json" }],
  ["format-table-preview", { path: "fixtures/harness/format-table-preview/scenario.json" }],
  ["stale-session-conflict", { path: "fixtures/harness/stale-session-conflict/scenario.json" }],
  ["rapid-mutation-order", { path: "fixtures/harness/rapid-mutation-order/scenario.json" }]
]);

let options;
try {
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  printUsage(2);
}
if (options.help) {
  printUsage(0);
}
if (!options.scenario || !options.id) {
  printUsage(2);
}

const scenario = scenarioAliases.get(options.scenario) ?? { path: options.scenario };
const result = spawnSync("pnpm", ["run", "review:ui:deterministic:scenario"], {
  cwd: root,
  env: {
    ...process.env,
    ASCIIDOC_TABLE_UI_REVIEW_ID: options.id,
    ASCIIDOC_TABLE_NIGHTLY_SCENARIO_PATH: scenario.path
  },
  stdio: "inherit"
});

process.exit(result.status ?? 1);

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--scenario") {
      parsed.scenario = requireValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--id") {
      parsed.id = requireValue(args, index, arg);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function requireValue(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function printUsage(exitCode) {
  console.log([
    "Usage: pnpm run review:ui:feature -- --scenario <scenario-id-or-path> --id <feature-id>",
    "",
    "Scenario aliases:",
    "  table-grid | smoke",
    "  fallback",
    "  merge-cells | unmerge-cells | block-cell-readonly | diagnostics",
    "  table-spec-header-footer | table-spec-column-cell-spec | official-table-syntax-compat | block-cell-boundary",
    "  clipboard-auto-expand-paste | clipboard-merged-cell-paste | block-cell-paste",
    "  duplicate-cells | clipboard-rich-content-diagnostics",
    "  unsupported-data-table | nested-table-non-goal",
    "  preview-comprehensive | format-table-preview | large-table-scroll",
    "  stale-session-conflict | rapid-mutation-order",
    "  official-table-syntax-compat | table-attribute-preview",
    "",
    "Examples:",
    "  pnpm run review:ui:feature -- --scenario table-grid --id merge-toolbar",
    "  pnpm run review:ui:feature -- --scenario fixtures/harness/table-grid-smoke/scenario.json --id custom-control"
  ].join("\n"));
  process.exit(exitCode);
}
