import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // Read the root .env (Vite's root is ./web) so the proxy targets the dev API port.
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = `http://localhost:${env.PORT ?? 3000}`;
  return {
    root: "web",
    plugins: [react()],
    build: { outDir: "../dist/web", emptyOutDir: true, chunkSizeWarningLimit: 1000 },
    server: { proxy: { "/api": apiTarget, "/mcp": apiTarget } },
  };
});
