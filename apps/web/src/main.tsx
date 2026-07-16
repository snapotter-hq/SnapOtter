import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { startEarlyErrorCapture } from "./lib/early-errors";
import "./styles/globals.css";

// Buffer crashes that happen before Sentry initializes (it inits late, after
// the analytics config fetch); flushEarlyErrors replays them once it is ready.
startEarlyErrorCapture();

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");
createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
