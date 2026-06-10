import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
  server: {
    host: true,
    port: Number(process.env.PORT) || 1351,
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL || "http://localhost:13490",
        timeout: 300_000,
        proxyTimeout: 300_000,
      },
    },
  },
  // vite preview serves the production build for e2e runs; it needs the same
  // /api proxy the dev server has (the app always calls relative /api).
  preview: {
    host: true,
    port: Number(process.env.PORT) || 1351,
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL || "http://localhost:13490",
        timeout: 300_000,
        proxyTimeout: 300_000,
      },
    },
  },
  build: {
    rollupOptions: {},
  },
});
