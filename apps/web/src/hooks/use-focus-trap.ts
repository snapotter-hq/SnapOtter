import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

export function useFocusTrap(containerRef: React.RefObject<HTMLElement | null>, active: boolean) {
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active || !containerRef.current) return;

    returnFocusRef.current = document.activeElement as HTMLElement;
    const container = containerRef.current;

    const getFocusableElements = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.closest("[aria-hidden='true']"),
      );

    const focusFirst = () => {
      const elements = getFocusableElements();
      if (elements.length > 0) {
        elements[0].focus();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      const elements = getFocusableElements();
      if (elements.length === 0) return;

      const first = elements[0];
      const last = elements[elements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    const observer = new MutationObserver(() => {
      const elements = getFocusableElements();
      if (elements.length > 0 && !container.contains(document.activeElement)) {
        elements[0].focus();
      }
    });

    observer.observe(container, { childList: true, subtree: true });
    container.addEventListener("keydown", handleKeyDown);

    requestAnimationFrame(focusFirst);

    return () => {
      container.removeEventListener("keydown", handleKeyDown);
      observer.disconnect();
      if (returnFocusRef.current && returnFocusRef.current.isConnected) {
        returnFocusRef.current.focus();
      }
    };
  }, [active, containerRef]);
}
