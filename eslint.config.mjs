import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Underscore marks a parameter that is intentionally unused — a seam
      // that accepts an argument today and will use it once implemented.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored copy of the SADA 3D Design System package. Read-only reference
    // material (prototype JSX, specimen HTML) — not application source.
    "design-system/**",
    /*
     * Payload writes these from the collection definitions, and rewrites them
     * whenever `payload migrate:create` runs. Linting generated SQL wrappers
     * reports unused hook arguments that are part of Payload's own signature,
     * and any fix would be discarded by the next generation.
     */
    "src/payload/migrations/**",
  ]),
]);

export default eslintConfig;
