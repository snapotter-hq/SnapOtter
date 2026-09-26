import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { codeSplitting } from "../web/vite.chunks";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../web/src"),
    },
    dedupe: ["react", "react-dom"],
  },
  server: {
    host: true,
    port: 1352,
  },
  build: {
    outDir: "dist",
    // Same shared-package chunking as apps/web (#1296).
    rolldownOptions: { output: { codeSplitting } },
  },
});
