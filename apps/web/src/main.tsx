import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { installChunkReloadHandler } from "./lib/chunk-reload";
import { startEarlyErrorCapture } from "./lib/early-errors";
import "./styles/globals.css";

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
