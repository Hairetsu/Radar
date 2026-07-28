/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/lucide-react/")) {
            return "icons";
          }
          if (
            id.includes("/node_modules/react/") ||
            id.includes("/node_modules/react-dom/") ||
            id.includes("/node_modules/scheduler/")
          ) {
            return "react";
          }
          if (id.includes("/shared/")) {
            return "radar-domain";
          }
        }
      }
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: false
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "shared/**/*.test.ts", "electron/**/*.test.ts"],
    environmentMatchGlobs: [["src/**/*.test.{ts,tsx}", "jsdom"]],
    setupFiles: ["src/test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["shared/**/*.ts", "electron/ai/**/*.ts", "src/lib/resultPreview.ts", "src/lib/aiProvider.ts"],
      exclude: ["**/*.test.ts", "src/test/**", "shared/domain.ts", "shared/ai-types.ts"],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90
      }
    }
  }
});
