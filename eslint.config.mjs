import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import noOptimizedImage from "./eslint/no-optimized-image.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "playwright-report/**",
      "test-results/**",
      "blob-report/**",
      "extension/dist/**",
      "vendor/**",
    ],
  },
  {
    plugins: {
      ulixdesk: {
        rules: {
          "no-optimized-image": noOptimizedImage,
        },
      },
    },
    rules: {
      "ulixdesk/no-optimized-image": "error",
    },
  },
  {
    files: ["extension/**/*.ts", "extension/**/*.mjs"],
    languageOptions: {
      globals: {
        chrome: "readonly",
      },
    },
  },
];

export default eslintConfig;
