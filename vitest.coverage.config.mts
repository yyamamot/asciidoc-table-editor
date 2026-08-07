import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/unit/**/*.test.ts", "test/integration/**/*.test.ts"],
    coverage: {
      provider: "v8",
      enabled: true,
      include: ["src/core/**/*.ts", "src/app/**/*.ts"],
      exclude: ["src/core/**/*.d.ts", "src/app/**/*.d.ts"],
      reportsDirectory: "coverage/core-app",
      reporter: ["text", "json-summary", "lcov"]
    }
  }
});
