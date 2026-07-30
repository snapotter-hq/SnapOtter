/**
 * Keystroke routing for "start typing anywhere to search".
 *
 * Shared by the landing hero search and the app's home dashboard so the two
 * surfaces cannot drift on the parts that are easy to get wrong: modifier
 * handling, IME composition, and deciding whether the search box is genuinely
 * available.
 *
 * Both functions are typed structurally rather than against DOM lib types, so
 * they take a real KeyboardEvent/Element/Document at runtime while staying
 * testable in the node environment that unit tests default to.
 */

export interface TypeToSearchKeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  /**
   * Never read. Shift is already folded into `key` by the layout, so a capital
   * arrives as "A". Declared so tests can pin that it stays ignored, because a
   * plausible-looking `&& !shiftKey` tightening would break capital AltGr
   * characters in pl, tr and de.
   */
  shiftKey?: boolean;
  isComposing?: boolean;
  defaultPrevented?: boolean;
  getModifierState?: (key: string) => boolean;
}

export interface TypeToSearchTarget {
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
  contains(other: unknown): boolean;
}

export interface TypeToSearchDocument {
  body: unknown;
  activeElement: unknown;
  elementFromPoint?: (x: number, y: number) => unknown;
}

/** Would this keystroke be someone starting to type a search query? */
export function isTypeToSearchKey(event: TypeToSearchKeyEvent): boolean {
  if (event.defaultPrevented) return false;
  if (event.isComposing) return false;

  // Every non-printable key reports a multi-character name: Enter, Tab, Escape,
  // ArrowDown, F1, Dead. A single character means a real character.
  if (event.key.length !== 1) return false;

  // Space has to keep scrolling the page.
  if (event.key === " ") return false;

  if (event.metaKey) return false;

  // AltGraph is the only trustworthy signal that a modified keystroke produced
  // text rather than invoking a shortcut, and it is set on both Windows AltGr
  // and macOS Option when the layout emits an alternate character. Inferring it
  // from ctrl+alt instead reads correctly on Windows but is backwards on macOS,
  // where Option alone types accented characters and ctrl+alt is a shortcut
  // prefix (VoiceOver's, among others). Browsers that do not report it fall
  // through and decline, which costs the feature rather than stealing a key.
  if (event.getModifierState?.("AltGraph")) return true;

  if (event.ctrlKey || event.altKey) return false;

  return true;
}

/**
 * A route announcer parks focus on a heading or main region with tabindex="-1"
 * to move the screen-reader reading position after a client-side navigation.
 * That focus is programmatic, unreachable by tabbing, and non-editable, so it
 * must not disable type-to-search the way a real focused control does.
 */
function isProgrammaticReadingFocus(el: unknown): boolean {
  if (typeof el !== "object" || el === null) return false;
  const node = el as {
    getAttribute?: (name: string) => string | null;
    isContentEditable?: boolean;
    tagName?: string;
  };
  if (typeof node.getAttribute !== "function") return false;
  if (node.getAttribute("tabindex") !== "-1") return false;
  if (node.isContentEditable) return false;
  return !/^(INPUT|TEXTAREA|SELECT|BUTTON|A|AUDIO|VIDEO|IFRAME|SUMMARY)$/.test(node.tagName ?? "");
}

/** Is this search box actually available to the user right now? */
export function isSearchBoxTypeable(input: TypeToSearchTarget, doc: TypeToSearchDocument): boolean {
  // jsdom implements neither layout nor elementFromPoint. With no real
  // measurement we cannot tell whether the box is on screen, and the safe
  // answer to not knowing is to leave the keystroke alone. Every browser has
  // had this API for over a decade, so no real behavior hides behind it.
  if (typeof doc.elementFromPoint !== "function") return false;

  // Only act when nothing else holds focus, which keeps native text editing and
  // keyboard navigation intact. Anything the user tabbed to, and any focused
  // input, textarea or contenteditable, is the activeElement, so this one check
  // replaces a separate "is the target editable" test.
  if (
    doc.activeElement !== doc.body &&
    doc.activeElement !== null &&
    !isProgrammaticReadingFocus(doc.activeElement)
  ) {
    return false;
  }

  const rect = input.getBoundingClientRect();
  // A hidden element measures zero, and so does everything in a DOM without
  // layout.
  if (rect.width === 0 || rect.height === 0) return false;

  // One hit test covers visibility and obstruction together. Off-screen returns
  // null, and a modal backdrop returns the backdrop, so there is no dependency
  // on anyone's aria markup.
  const hit = doc.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  if (!hit) return false;

  // contains() includes the node itself, so this also covers "the hit is the
  // input". An ancestor hit is deliberately rejected: that is what
  // elementFromPoint returns when the input is laid out but not hit-testable
  // (visibility:hidden, or an inert wrapper), and focus() is refused in exactly
  // those cases, so accepting it would pour keystrokes into an unreachable box.
  return input.contains(hit);
}
