import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { appUrl, unprefixPathname } from "./lib/app-url";
import { installChunkReloadHandler } from "./lib/chunk-reload";
import { startEarlyErrorCapture } from "./lib/early-errors";
import "./styles/globals.css";

// The server serves this shell for any unprefixed path too (#1275), so a
// browser that opens the deployment without its prefix gets a page whose
// router basename doesn't match — a silent 404 with nothing in any log.
// Redirect here, before the router mounts; replace() avoids a back-button
// ping-pong, and running before the router mounts keeps the wrong URL from
// being routed at all.
const unprefixed = unprefixPathname(window.location.pathname);
if (unprefixed !== null) {
  const { search, hash } = window.location;
  window.location.replace(appUrl(`${unprefixed}${search}${hash}`));
}

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
