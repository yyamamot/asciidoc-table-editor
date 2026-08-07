import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { coverageDomains, coverageExcludedFiles, coverageThresholds } from "../coverage.config.mjs";

const metricNames = ["lines", "statements", "functions", "branches"];

export function checkCoverageSummary(summaryPath, domainName) {
  const domainPrefix = coverageDomains[domainName];
  const thresholds = coverageThresholds[domainName];
  if (!domainPrefix || !thresholds) {
    throw new Error(`Unknown coverage domain: ${domainName}`);
  }

  const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
  const files = Object.entries(summary).filter(([file]) => {
    if (file === "total") return false;
    const workspacePath = relative(process.cwd(), resolve(file)).split(sep).join("/");
    return workspacePath.startsWith(domainPrefix);
  });
  if (files.length === 0) {
    throw new Error(`Coverage report contains no files for ${domainPrefix}`);
  }

  const result = Object.fromEntries(
    metricNames.map((metricName) => {
      const counts = files.reduce(
        (total, [, fileSummary]) => ({
          total: total.total + Number(fileSummary[metricName]?.total ?? 0),
          covered: total.covered + Number(fileSummary[metricName]?.covered ?? 0)
        }),
        { total: 0, covered: 0 }
      );
      const percentage = counts.total === 0 ? 100 : (counts.covered / counts.total) * 100;
      return [metricName, { ...counts, percentage }];
    })
  );

  console.log(`\n${domainName} coverage (${files.length} files)`);
  let failed = false;
  for (const metricName of metricNames) {
    const metric = result[metricName];
    const threshold = thresholds[metricName];
    const status = metric.percentage + Number.EPSILON >= threshold ? "pass" : "FAIL";
    console.log(`${metricName.padEnd(10)} ${metric.percentage.toFixed(2)}% (${metric.covered}/${metric.total}) threshold=${threshold}% ${status}`);
    failed ||= status === "FAIL";
  }
  if (failed) {
    throw new Error(`${domainName} coverage fell below its checked-in baseline threshold`);
  }
  return result;
}

export function checkCoverageInventory(summaryPath, domainName) {
  const domainPrefix = coverageDomains[domainName];
  if (!domainPrefix) {
    throw new Error(`Unknown coverage domain: ${domainName}`);
  }
  const excluded = new Set(coverageExcludedFiles[domainName] ?? []);
  const expected = sourceFiles(resolve(domainPrefix))
    .map((filePath) => relative(process.cwd(), filePath).split(sep).join("/"))
    .filter((filePath) => !excluded.has(filePath));
  const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
  const actual = new Set(
    Object.keys(summary)
      .filter((filePath) => filePath !== "total")
      .map((filePath) => relative(process.cwd(), resolve(filePath)).split(sep).join("/"))
  );
  const missing = expected.filter((filePath) => !actual.has(filePath));
  if (missing.length > 0) {
    throw new Error(`${domainName} coverage inventory is missing: ${missing.join(", ")}`);
  }
  console.log(`${domainName} coverage inventory: ${expected.length} source files represented`);
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(filePath);
    return /\.(?:cjs|ts)$/u.test(entry.name) ? [filePath] : [];
  });
}
