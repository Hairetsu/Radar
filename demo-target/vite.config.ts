import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { createDemoApiMiddleware } from "./server/viteMiddleware";

const DEMO_ROOT = fileURLToPath(new URL(".", import.meta.url));

function demoApiPlugin(): Plugin {
  return {
    name: "radar-demo-api",
    configureServer(server) {
      server.middlewares.use(createDemoApiMiddleware());
    }
  };
}

export default defineConfig({
  root: DEMO_ROOT,
  plugins: [react(), demoApiPlugin()],
  server: {
    host: "127.0.0.1",
    port: 3000,
    strictPort: true
  },
  preview: {
    host: "127.0.0.1",
    port: 3000,
    strictPort: true
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
