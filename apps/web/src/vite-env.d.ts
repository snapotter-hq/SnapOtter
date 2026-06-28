/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Sentry release, injected at build time by the Docker web build. Unset in
  // dev and source-archive builds, where the SDK falls back to APP_VERSION.
  readonly VITE_SENTRY_RELEASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
