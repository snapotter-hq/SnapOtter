import { installMocks } from "./mock-api";

installMocks();

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/App";
import { DemoBanner } from "./demo-banner";
import "./styles/globals.css";

const DEMO_MARKER = "demo instance";
const GITHUB_URL = "https://github.com/snapotter-hq/SnapOtter";
const GITHUB_LABEL = "github.com/snapotter-hq/SnapOtter";

function patchDemoErrors(root: Element) {
  const observer = new MutationObserver(() => {
    root.querySelectorAll(".text-red-500, [data-type='error']").forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      if (!el.textContent?.includes(DEMO_MARKER)) return;
      if (el.dataset.demoPatch) return;
      el.dataset.demoPatch = "1";
      el.classList.remove("text-red-500", "text-destructive-ink");
      el.style.color = "var(--color-primary-ink)";
      el.style.fontSize = "13px";
      el.style.lineHeight = "1.5";

      const text = el.textContent;
      const parts = text.split(GITHUB_LABEL);
      while (el.firstChild) el.removeChild(el.firstChild);
      el.appendChild(document.createTextNode(parts[0]));

      const link = document.createElement("a");
      link.href = GITHUB_URL;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = GITHUB_LABEL;
      link.style.fontWeight = "600";
      link.style.textDecoration = "underline";
      link.style.textUnderlineOffset = "2px";
      el.appendChild(link);

      if (parts[1]) el.appendChild(document.createTextNode(parts[1]));
    });
  });
  observer.observe(root, { childList: true, subtree: true, characterData: true });
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");
patchDemoErrors(rootElement);
createRoot(rootElement).render(
  <StrictMode>
    <DemoBanner />
    <App />
  </StrictMode>,
);
