import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    // `artifacts/` holds generated regression output, including Playwright's
    // bundled trace viewer, which is not ours to lint.
    ignores: ["dist/**", "dist-electron/**", "demo-target/dist/**", "node_modules/**", "artifacts/**"]
  },
  js.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}", "demo-target/src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module"
      },
      globals: {
        window: "readonly",
        document: "readonly",
        Element: "readonly",
        Event: "readonly",
        HTMLButtonElement: "readonly",
        HTMLElement: "readonly",
        HTMLTextAreaElement: "readonly",
        HTMLInputElement: "readonly",
        HTMLFormElement: "readonly",
        KeyboardEvent: "readonly",
        RequestInit: "readonly",
        ResizeObserver: "readonly",
        Response: "readonly",
        URL: "readonly",
        fetch: "readonly",
        performance: "readonly",
        WheelEvent: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        console: "readonly"
      }
    },
    plugins: {
      "@typescript-eslint": tseslint,
      "react-hooks": reactHooks
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules
    }
  },
  {
    files: [
      "shared/**/*.ts",
      "electron/**/*.ts",
      "demo-target/server/**/*.ts",
      "demo-target/vite.config.ts"
    ],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module"
      },
      globals: {
        AbortController: "readonly",
        AbortSignal: "readonly",
        atob: "readonly",
        Buffer: "readonly",
        btoa: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        fetch: "readonly",
        process: "readonly",
        setInterval: "readonly",
        setTimeout: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly"
      }
    },
    plugins: {
      "@typescript-eslint": tseslint
    },
    rules: {
      ...tseslint.configs.recommended.rules
    }
  }
];
