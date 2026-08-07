import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const scoped = (configs, files) => configs.map((config) => ({ ...config, files }));

export default tseslint.config(
  {
    ignores: ["coverage/**", "dist/**", "out/**", ".tmp/**", ".vscode-test/**", "node_modules/**"]
  },
  ...scoped(tseslint.configs.recommendedTypeChecked, ["src/**/*.ts"]),
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "prefer-const": "error"
    }
  },
  ...scoped(tseslint.configs.recommended, ["test/**/*.ts", "*.mts", "*.ts"]),
  {
    files: ["test/**/*.ts", "*.mts", "*.ts"],
    languageOptions: { globals: globals.node },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", varsIgnorePattern: "^_" }]
    }
  },
  {
    files: ["scripts/**/*.mjs", "*.mjs"],
    ...eslint.configs.recommended,
    languageOptions: { globals: globals.node },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", varsIgnorePattern: "^_" }]
    }
  },
  {
    files: ["src/**/*.cjs", "test/**/*.cjs"],
    ...eslint.configs.recommended,
    languageOptions: {
      globals: globals.node,
      sourceType: "commonjs"
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", varsIgnorePattern: "^_" }]
    }
  }
);
