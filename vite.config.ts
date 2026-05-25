/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    emptyOutDir: true
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: false
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "shared/**/*.test.cjs", "electron/**/*.test.cjs"],
    environmentMatchGlobs: [["src/**/*.test.{ts,tsx}", "jsdom"]],
    setupFiles: ["src/test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["shared/**/*.cjs", "electron/ai/**/*.cjs", "src/lib/resultPreview.ts"],
      exclude: ["src/test/**"],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90
      }
    }
  }
});
