import js from "@eslint/js"
import tseslint from "typescript-eslint"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/node_modules/**",
      "**/.turbo/**",
    ],
  },
  {
    files: ["apps/frontend/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        project: ["apps/frontend/tsconfig.json"],
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": "warn",
    },
  },
  {
    files: ["apps/backend/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: ["apps/backend/tsconfig.json"],
      },
    },
    rules: {
      "no-console": "off", // logs serveur autorisés
    },
  }
)
