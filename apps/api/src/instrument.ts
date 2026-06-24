import { ANALYTICS_BAKED } from "@snapotter/shared";

const FILE_EXT_PATTERN =
  /\.(jpe?g|png|pdf|webp|gif|tiff?|bmp|svg|hei[cf]?|avif|raw|cr2|nef|arw|dng|psd|tga|exr|hdr)\b/gi;
const FILE_PATH_PATTERN = /\/(tmp\/workspace|data\/files|data\/ai)\//g;

if (ANALYTICS_BAKED.enabled && ANALYTICS_BAKED.sentryDsn) {
  try {
    const Sentry = await import("@sentry/node");
    const { APP_VERSION } = await import("@snapotter/shared");

    Sentry.init({
      dsn: ANALYTICS_BAKED.sentryDsn,
      release: APP_VERSION,
      environment: process.env.NODE_ENV || "production",
      tracesSampleRate: ANALYTICS_BAKED.sampleRate,
      sendDefaultPii: false,
      beforeSend(event) {
        if (event.user) {
          delete event.user.email;
          delete event.user.username;
        }
        if (event.exception?.values) {
          for (const ex of event.exception.values) {
            if (
              ex.value &&
              (ex.value.includes("Rate limit exceeded") ||
                ex.value.includes("Body cannot be empty") ||
                ex.value.includes("Unsupported Media Type") ||
                ex.value.includes("Request body size did not match") ||
                ex.value.includes("Premature close"))
            ) {
              return null;
            }
            if (ex.value) {
              ex.value = ex.value
                .replace(FILE_EXT_PATTERN, ".[REDACTED]")
                .replace(FILE_PATH_PATTERN, "/[REDACTED]/");
            }
            if (ex.stacktrace?.frames) {
              for (const frame of ex.stacktrace.frames) {
                if (frame.filename) {
                  frame.filename = frame.filename
                    .replace(FILE_EXT_PATTERN, ".[REDACTED]")
                    .replace(FILE_PATH_PATTERN, "/[REDACTED]/");
                }
              }
            }
          }
        }
        return event;
      },
      beforeBreadcrumb(breadcrumb) {
        if (breadcrumb.message) {
          breadcrumb.message = breadcrumb.message
            .replace(FILE_EXT_PATTERN, ".[REDACTED]")
            .replace(FILE_PATH_PATTERN, "/[REDACTED]/");
        }
        return breadcrumb;
      },
    });

    console.log("[sentry] initialized with performance tracing, release:", APP_VERSION);
  } catch {
    // @sentry/node not available
  }
}
