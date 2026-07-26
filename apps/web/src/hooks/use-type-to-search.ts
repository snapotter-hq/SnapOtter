import { isSearchBoxTypeable, isTypeToSearchKey } from "@snapotter/shared/search/type-to-search.js";
import { type RefObject, useEffect, useRef } from "react";

/**
 * Lets someone start typing anywhere on the page and have it land in a search
 * box, provided the box is on screen and nothing else holds focus.
 *
 * Scope comes from where this hook is mounted rather than from a route check, so
 * it cannot drift out of step with the UI: mount it next to a search input and
 * that page gets the behavior, and no other page does.
 */
export function useTypeToSearch(
  inputRef: RefObject<HTMLInputElement | null>,
  onChange: (next: string) => void,
) {
  // The listener is registered once, so an inline onChange would otherwise be
  // captured from first render and never updated.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const input = inputRef.current;
      if (!input) return;
      if (!isTypeToSearchKey(event)) return;
      if (!isSearchBoxTypeable(input, document)) return;

      // Focus before committing to the keystroke. The browser silently refuses
      // focus inside an inert or visibility:hidden subtree, and swallowing the
      // character there would drop a whole query into a box nobody can see.
      // Returning without preventDefault leaves the key to the browser.
      input.focus();
      if (document.activeElement !== input) return;

      event.preventDefault();
      // The input is controlled, so its DOM value is the committed React state.
      // That is a race-free source; a ref synced in a passive effect can lag the
      // DOM by a keystroke if the next keydown is serviced before the flush.
      onChangeRef.current(input.value + event.key);

      // React writes the new value on the next commit, so the caret has to be
      // placed after that lands. Appending to an existing query would otherwise
      // leave it at the start and put the following character in front.
      requestAnimationFrame(() => {
        const end = input.value.length;
        input.setSelectionRange(end, end);
      });
    }

    // Bubble phase with no stopPropagation, so use-keyboard-shortcuts keeps
    // first refusal on every Mod+ combination.
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [inputRef]);
}
