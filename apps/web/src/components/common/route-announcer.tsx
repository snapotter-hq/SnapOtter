import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

export function RouteAnnouncer() {
  const location = useLocation();
  const isFirstRender = useRef(true);
  const announcerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const timer = setTimeout(() => {
      const h1 = document.querySelector("h1");
      if (h1) {
        if (!h1.hasAttribute("tabindex")) {
          h1.setAttribute("tabindex", "-1");
        }
        h1.focus({ preventScroll: true });
        if (announcerRef.current) {
          announcerRef.current.textContent = h1.textContent || "";
        }
      } else {
        const main = document.getElementById("main-content");
        if (main) {
          if (!main.hasAttribute("tabindex")) {
            main.setAttribute("tabindex", "-1");
          }
          main.focus({ preventScroll: true });
        }
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [location.pathname]);

  return (
    <div
      ref={announcerRef}
      className="sr-only"
      aria-live="polite"
      aria-atomic="true"
      role="status"
    />
  );
}
