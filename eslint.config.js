import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import globals from "globals";

export default [
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
        React: "readonly",
        JSX: "readonly",
      },
      parser: tsparser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      "@next/next": nextPlugin,
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      "@next/next/no-html-link-for-pages": "error",
      "@typescript-eslint/no-unused-vars": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-undef": "off", // Désactivé car TypeScript gère cela
    },
  },
];
