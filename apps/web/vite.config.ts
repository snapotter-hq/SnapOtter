import path from "node:path";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Source maps are emitted and uploaded to Sentry only when the build supplies
// SENTRY_AUTH_TOKEN (the published Docker image does; dev and the source-archive
// build do not). Debug IDs tie each build's bundle to its own maps, so upload
// works regardless of release. Maps are deleted after upload so they never ship.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const sentryRelease = process.env.SENTRY_RELEASE;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Must come after the other plugins so it sees the final bundle.
    sentryVitePlugin({
      org: "snapotter",
      // Web source maps upload to the browser project; api events live on "node".
      project: "web",
      authToken: sentryAuthToken,
      telemetry: false,
      disable: !sentryAuthToken,
      applicationKey: "snapotter-web",
      // Don't inject the release into the bundle; the SDK reads it explicitly
      // from VITE_SENTRY_RELEASE so there is a single source of truth.
      release: { name: sentryRelease, inject: false },
      sourcemaps: { filesToDeleteAfterUpload: ["./dist/**/*.map"] },
    }),
  ],
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
    // Hidden source maps: generated for upload but not referenced from the
    // shipped JS, so browsers never fetch them. Off entirely when not uploading.
    sourcemap: sentryAuthToken ? "hidden" : false,
    rollupOptions: {},
  },
});
