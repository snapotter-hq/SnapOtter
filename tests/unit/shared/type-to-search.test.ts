import { describe, expect, it } from "vitest";
import {
  isSearchBoxTypeable,
  isTypeToSearchKey,
  type TypeToSearchKeyEvent,
} from "../../../packages/shared/src/search/type-to-search.js";

function ev(overrides: Partial<TypeToSearchKeyEvent> & { key: string }): TypeToSearchKeyEvent {
  return {
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    isComposing: false,
    defaultPrevented: false,
    ...overrides,
  };
}

/** A keystroke where the layout reports AltGraph, as Windows AltGr and macOS Option do. */
function altGraph(
  overrides: Partial<TypeToSearchKeyEvent> & { key: string },
): TypeToSearchKeyEvent {
  return ev({ getModifierState: (k) => k === "AltGraph", ...overrides });
}

describe("isTypeToSearchKey", () => {
  it("accepts a plain letter", () => {
    expect(isTypeToSearchKey(ev({ key: "c" }))).toBe(true);
  });

  it("accepts a digit", () => {
    expect(isTypeToSearchKey(ev({ key: "5" }))).toBe(true);
  });

  it("accepts punctuation", () => {
    expect(isTypeToSearchKey(ev({ key: "-" }))).toBe(true);
  });

  it("accepts a shifted capital", () => {
    expect(isTypeToSearchKey(ev({ key: "A", shiftKey: true }))).toBe(true);
  });

  // key.length is the only gate deciding what counts as a character, in a
  // product with 21 locales. Tightening it to something like /^[a-z0-9]$/i would
  // silently kill most of them, and every other test here is Latin.
  it.each(["ก", "क", "ا", "字", "я", "ü", "ñ", "ą", "İ"])(
    "accepts the non-Latin character %s",
    (key) => {
      expect(isTypeToSearchKey(ev({ key }))).toBe(true);
    },
  );

  it("accepts an AltGr character", () => {
    expect(isTypeToSearchKey(altGraph({ key: "ą", ctrlKey: true, altKey: true }))).toBe(true);
  });

  // Uppercase AltGr characters exist in pl, tr and de. A plausible-looking
  // "&& !shiftKey" tightening would break them with no other test failing.
  it("accepts a capital AltGr character", () => {
    expect(
      isTypeToSearchKey(altGraph({ key: "Ą", ctrlKey: true, altKey: true, shiftKey: true })),
    ).toBe(true);
  });

  // macOS has no AltGr: Option alone emits the alternate character, and it
  // reports AltGraph when it does.
  it("accepts a macOS Option character", () => {
    expect(isTypeToSearchKey(altGraph({ key: "å", altKey: true }))).toBe(true);
  });

  // The mirror of the case above, and the reason ctrl+alt is not treated as
  // AltGr by inference: on macOS ctrl+alt is a shortcut prefix, VoiceOver's
  // included, and no character is produced.
  it("rejects ctrl+alt when the layout does not report AltGraph", () => {
    expect(isTypeToSearchKey(ev({ key: "a", ctrlKey: true, altKey: true }))).toBe(false);
  });

  it("rejects ctrl+alt when the browser cannot report modifier state at all", () => {
    const event = ev({ key: "a", ctrlKey: true, altKey: true });
    delete (event as { getModifierState?: unknown }).getModifierState;
    expect(isTypeToSearchKey(event)).toBe(false);
  });

  // Ctrl+Alt+1..8 are registered app shortcuts on Windows and Linux, where mod
  // is Ctrl. The predicate deliberately does not arbitrate: use-keyboard-shortcuts
  // runs in capture phase and calls preventDefault plus stopPropagation, so it
  // never reaches this handler.
  it("rejects ctrl+alt+digit, leaving shortcut arbitration to the shortcut hook", () => {
    expect(isTypeToSearchKey(ev({ key: "1", ctrlKey: true, altKey: true }))).toBe(false);
  });

  it("rejects space so the page keeps scrolling", () => {
    expect(isTypeToSearchKey(ev({ key: " " }))).toBe(false);
  });

  it("rejects a synthetic event whose key is undefined instead of throwing", () => {
    // Password-manager and autofill extensions dispatch synthetic keydowns on
    // document with no key at all (Sentry WEB-N). The type says `key: string`;
    // the runtime disagrees.
    const synthetic = { ...ev({ key: "x" }), key: undefined } as unknown as TypeToSearchKeyEvent;

    expect(isTypeToSearchKey(synthetic)).toBe(false);
  });

  it.each(["Enter", "Tab", "Escape", "ArrowDown", "Backspace", "F1", "Dead", "Shift"])(
    "rejects the non-printable key %s",
    (key) => {
      expect(isTypeToSearchKey(ev({ key }))).toBe(false);
    },
  );

  it("rejects a keystroke mid-IME-composition", () => {
    expect(isTypeToSearchKey(ev({ key: "n", isComposing: true }))).toBe(false);
  });

  it("rejects a keystroke something upstream already handled", () => {
    expect(isTypeToSearchKey(ev({ key: "n", defaultPrevented: true }))).toBe(false);
  });

  it("rejects a Meta combination", () => {
    expect(isTypeToSearchKey(ev({ key: "k", metaKey: true }))).toBe(false);
  });

  it("rejects Meta even when the layout reports AltGraph", () => {
    expect(isTypeToSearchKey(altGraph({ key: "k", metaKey: true }))).toBe(false);
  });

  it("rejects Ctrl alone", () => {
    expect(isTypeToSearchKey(ev({ key: "a", ctrlKey: true }))).toBe(false);
  });

  it("rejects Alt alone", () => {
    expect(isTypeToSearchKey(ev({ key: "a", altKey: true }))).toBe(false);
  });
});

describe("isSearchBoxTypeable", () => {
  const rect = { left: 100, top: 40, width: 300, height: 40 };
  const centre = [250, 60];

  /**
   * Mimics a real element: contains() is inclusive of the node itself, which is
   * what makes the "hit is the input" case work without a separate identity
   * check in the implementation.
   */
  function box(descendants: unknown[] = [], overrides: { width?: number; height?: number } = {}) {
    const self = {
      getBoundingClientRect: () => ({ ...rect, ...overrides }),
      contains: (other: unknown) => other === self || descendants.includes(other),
    };
    return self;
  }

  function doc(
    overrides: Partial<{
      body: unknown;
      activeElement: unknown;
      elementFromPoint?: (x: number, y: number) => unknown;
    }> = {},
  ) {
    const body = { tag: "body" };
    return {
      body,
      activeElement: body,
      elementFromPoint: () => null,
      ...overrides,
    };
  }

  it("returns false when the environment has no elementFromPoint", () => {
    const input = box();
    const d = doc();
    // jsdom does not implement elementFromPoint at all. Without this guard any
    // future jsdom test that mounts the search bar dies on a TypeError.
    delete (d as { elementFromPoint?: unknown }).elementFromPoint;

    expect(isSearchBoxTypeable(input, d)).toBe(false);
  });

  it("accepts when the hit element is the input itself", () => {
    const input = box();
    const d = doc({
      elementFromPoint: (x, y) => (x === centre[0] && y === centre[1] ? input : null),
    });

    expect(isSearchBoxTypeable(input, d)).toBe(true);
  });

  it("accepts when the hit element is inside the input", () => {
    const child = { tag: "child" };
    const input = box([child]);
    const d = doc({ elementFromPoint: () => child });

    expect(isSearchBoxTypeable(input, d)).toBe(true);
  });

  // This is what elementFromPoint returns when the input is laid out but not
  // hit-testable (visibility:hidden, or an inert wrapper). focus() is refused
  // there, so accepting it would swallow a whole query into an unreachable box.
  it("rejects when the hit element is an ancestor of the input", () => {
    const input = box();
    const wrapper = { contains: (other: unknown) => other === input };
    const d = doc({ elementFromPoint: () => wrapper });

    expect(isSearchBoxTypeable(input, d)).toBe(false);
  });

  it("rejects when an unrelated overlay covers the input", () => {
    const overlay = { contains: () => false };
    const input = box();
    const d = doc({ elementFromPoint: () => overlay });

    expect(isSearchBoxTypeable(input, d)).toBe(false);
  });

  it("rejects when the input is scrolled out of the viewport", () => {
    const input = box();
    const d = doc({ elementFromPoint: () => null });

    expect(isSearchBoxTypeable(input, d)).toBe(false);
  });

  it("rejects when something else already holds focus", () => {
    const input = box();
    const d = doc({ activeElement: { tag: "button" }, elementFromPoint: () => input });

    expect(isSearchBoxTypeable(input, d)).toBe(false);
  });

  it("accepts when nothing at all holds focus", () => {
    const input = box();
    const d = doc({ activeElement: null, elementFromPoint: () => input });

    expect(isSearchBoxTypeable(input, d)).toBe(true);
  });

  // A route announcer parks focus on a heading (tabindex="-1") to move the
  // screen-reader reading position after a client-side navigation. That focus
  // is programmatic and non-editable, so type-to-search must still work.
  it("accepts when a route-announcer heading holds the reading position", () => {
    const input = box();
    const heading = {
      tagName: "H1",
      isContentEditable: false,
      getAttribute: (name: string) => (name === "tabindex" ? "-1" : null),
    };
    const d = doc({ activeElement: heading, elementFromPoint: () => input });

    expect(isSearchBoxTypeable(input, d)).toBe(true);
  });

  it("still rejects a real focused input even when it has tabindex -1", () => {
    const focused = {
      tagName: "INPUT",
      isContentEditable: false,
      getAttribute: (name: string) => (name === "tabindex" ? "-1" : null),
    };
    const input = box();
    const d = doc({ activeElement: focused, elementFromPoint: () => input });

    expect(isSearchBoxTypeable(input, d)).toBe(false);
  });

  it("still rejects a contenteditable region even at tabindex -1", () => {
    const editable = {
      tagName: "DIV",
      isContentEditable: true,
      getAttribute: (name: string) => (name === "tabindex" ? "-1" : null),
    };
    const input = box();
    const d = doc({ activeElement: editable, elementFromPoint: () => input });

    expect(isSearchBoxTypeable(input, d)).toBe(false);
  });

  it("rejects a zero-width box, which is how a hidden element measures", () => {
    const input = box([], { width: 0 });
    const d = doc({ elementFromPoint: () => input });

    expect(isSearchBoxTypeable(input, d)).toBe(false);
  });

  it("rejects a zero-height box", () => {
    const input = box([], { height: 0 });
    const d = doc({ elementFromPoint: () => input });

    expect(isSearchBoxTypeable(input, d)).toBe(false);
  });
});
