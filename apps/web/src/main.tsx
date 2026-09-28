import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { redirectIfUnprefixed } from "./lib/app-url";
import { installChunkReloadHandler } from "./lib/chunk-reload";
import { startEarlyErrorCapture } from "./lib/early-errors";
import "./styles/globals.css";

// The server serves this shell for unprefixed paths too (#1275), so a browser
// that opens a subpath deployment without its prefix would get a router whose
// basename doesn't match: a silent 404 with nothing in any log. Send it to the
// prefixed URL instead, and don't mount anything on the way out: replace()
// only schedules the navigation, so the app would otherwise start up (config
// fetches, analytics) against the wrong URL first.
if (!redirectIfUnprefixed(window.location)) {
  // Buffer crashes that happen before Sentry initializes (it inits late, after
  // the analytics config fetch); flushEarlyErrors replays them once it is ready.
  startEarlyErrorCapture();

  // A container update invalidates the hashed chunks an open tab still points
  // at; reload once instead of stranding the user on a crash screen.
  installChunkReloadHandler();

  const rootElement = document.getElementById("root");
  if (!rootElement) throw new Error("Root element not found");
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
