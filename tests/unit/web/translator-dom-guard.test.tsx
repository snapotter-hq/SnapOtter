// @vitest-environment jsdom

/**
 * #4685: Google Translate and Yandex rewrite text nodes React still owns, and
 * the next icon swap in a button called insertBefore with a reference node
 * that had left the button, crashing the page (WEB-2V/2T/2N/1G). The guard
 * falls back only when a translator left its mark; every other mismatch must
 * still throw so real reconciliation bugs stay loud.
 */

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { installTranslatorDomGuard } from "../../../apps/web/src/lib/translator-dom-guard.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Google Translate: the text node is replaced by <font><font>…</font></font> and dropped. */
function googleTranslate(text: Text, translated = "traduit"): void {
  const outer = document.createElement("font");
  const inner = document.createElement("font");
  inner.textContent = translated;
  outer.appendChild(inner);
  text.parentNode?.replaceChild(outer, text);
}

/** A translator that keeps the original node but moves it into its wrapper. */
function wrapInPlace(text: Text, tag = "ya-tr-span"): Element {
  const wrapper = document.createElement(tag);
  text.parentNode?.replaceChild(wrapper, text);
  wrapper.appendChild(text);
  return wrapper;
}

function textChild(el: Element): Text {
  const node = Array.from(el.childNodes).find((n) => n.nodeType === Node.TEXT_NODE);
  if (!node) throw new Error("no text node");
  return node as Text;
}

beforeAll(() => {
  installTranslatorDomGuard();
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  document.documentElement.className = "";
});

describe("installTranslatorDomGuard", () => {
  it("installs once", () => {
    const insertBefore = Node.prototype.insertBefore;
    const removeChild = Node.prototype.removeChild;
    installTranslatorDomGuard();
    expect(Node.prototype.insertBefore).toBe(insertBefore);
    expect(Node.prototype.removeChild).toBe(removeChild);
  });

  it("leaves ordinary calls alone", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const parent = document.createElement("div");
    const a = document.createElement("span");
    const b = document.createElement("span");
    parent.appendChild(b);
    expect(parent.insertBefore(a, b)).toBe(a);
    expect(Array.from(parent.childNodes)).toEqual([a, b]);
    const c = document.createElement("i");
    parent.insertBefore(c, null);
    expect(parent.lastChild).toBe(c);
    expect(parent.removeChild(a)).toBe(a);
    expect(Array.from(parent.childNodes)).toEqual([b, c]);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("insertBefore", () => {
  it("appends when Google Translate dropped the reference text node", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const button = document.createElement("button");
    const text = document.createTextNode("Generate");
    button.appendChild(text);
    googleTranslate(text);
    const icon = document.createElement("svg");

    expect(button.insertBefore(icon, text)).toBe(icon);
    expect(button.lastChild).toBe(icon);
    expect(button.firstChild?.nodeName).toBe("FONT");
    expect(warn).toHaveBeenCalledOnce();
  });

  it("appends for a dropped reference when only <html> carries the translated class", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    document.documentElement.classList.add("translated-ltr");
    const button = document.createElement("button");
    const text = document.createTextNode("Generate");
    const icon = document.createElement("svg");
    expect(button.insertBefore(icon, text)).toBe(icon);
    expect(button.lastChild).toBe(icon);
  });

  it("inserts before the wrapper that now holds the reference", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const button = document.createElement("button");
    const text = document.createTextNode("Generate");
    const tail = document.createElement("kbd");
    button.append(text, tail);
    const wrapper = wrapInPlace(text);
    const icon = document.createElement("svg");

    button.insertBefore(icon, text);
    expect(Array.from(button.childNodes)).toEqual([icon, wrapper, tail]);
    expect(wrapper.firstChild).toBe(text);
  });

  it("finds the wrapper through nested <font> layers", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const button = document.createElement("button");
    const text = document.createTextNode("Generate");
    button.appendChild(text);
    const inner = wrapInPlace(text, "font");
    const outer = document.createElement("font");
    button.replaceChild(outer, inner);
    outer.appendChild(inner);
    const icon = document.createElement("svg");

    button.insertBefore(icon, text);
    expect(Array.from(button.childNodes)).toEqual([icon, outer]);
  });

  it("still throws when the reference belongs to another parent", () => {
    const parent = document.createElement("div");
    const elsewhere = document.createElement("div");
    const ref = document.createElement("span");
    elsewhere.appendChild(ref);
    parent.appendChild(document.createElement("font"));
    expect(() => parent.insertBefore(document.createElement("i"), ref)).toThrow(
      expect.objectContaining({ name: "NotFoundError" }),
    );
  });

  it("still throws when the reference is nested under a non-translator element", () => {
    const parent = document.createElement("div");
    const span = document.createElement("span");
    const ref = document.createElement("b");
    span.appendChild(ref);
    parent.appendChild(span);
    expect(() => parent.insertBefore(document.createElement("i"), ref)).toThrow(
      expect.objectContaining({ name: "NotFoundError" }),
    );
  });

  it("still throws for a detached reference with no translator around", () => {
    const parent = document.createElement("div");
    parent.appendChild(document.createElement("span"));
    const ref = document.createTextNode("orphan");
    expect(() => parent.insertBefore(document.createElement("i"), ref)).toThrow(
      expect.objectContaining({ name: "NotFoundError" }),
    );
  });
});

describe("removeChild", () => {
  it("removes a node from the translator wrapper it was moved into", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const button = document.createElement("button");
    const text = document.createTextNode("Generate");
    button.appendChild(text);
    const wrapper = wrapInPlace(text);

    expect(button.removeChild(text)).toBe(text);
    expect(text.parentNode).toBeNull();
    expect(wrapper.parentNode).toBe(button);
  });

  it("no-ops for a node Google Translate already dropped", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const button = document.createElement("button");
    const text = document.createTextNode("Generate");
    button.appendChild(text);
    googleTranslate(text);

    expect(button.removeChild(text)).toBe(text);
    expect(button.firstChild?.nodeName).toBe("FONT");
    expect(warn).toHaveBeenCalledOnce();
  });

  it("still throws for a node owned by another parent", () => {
    const parent = document.createElement("div");
    parent.appendChild(document.createElement("font"));
    const elsewhere = document.createElement("div");
    const child = document.createElement("span");
    elsewhere.appendChild(child);
    expect(() => parent.removeChild(child)).toThrow(
      expect.objectContaining({ name: "NotFoundError" }),
    );
    expect(child.parentNode).toBe(elsewhere);
  });

  it("still throws for a detached node with no translator around", () => {
    const parent = document.createElement("div");
    expect(() => parent.removeChild(document.createElement("span"))).toThrow(
      expect.objectContaining({ name: "NotFoundError" }),
    );
  });
});

describe("a React button whose icon swaps under a translator", () => {
  let root: Root | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
  });

  function IconButton() {
    const [busy, setBusy] = useState(false);
    return (
      <button type="button" onClick={() => setBusy((b) => !b)}>
        {busy ? <i data-icon="spinner" /> : <b data-icon="sparkles" />}
        {busy ? "Generating" : "Generate"}
      </button>
    );
  }

  function mount(): HTMLButtonElement {
    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root?.render(<IconButton />));
    const button = host.querySelector("button");
    if (!button) throw new Error("no button");
    return button;
  }

  it("swaps the icon after Google Translate replaced the label", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const button = mount();
    googleTranslate(textChild(button));

    act(() => button.click());
    expect(button.querySelector("[data-icon=spinner]")).not.toBeNull();
    expect(button.querySelector("[data-icon=sparkles]")).toBeNull();

    act(() => button.click());
    expect(button.querySelector("[data-icon=sparkles]")).not.toBeNull();
  });

  it("swaps the icon after a translator wrapped the label in place", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const button = mount();
    const wrapper = wrapInPlace(textChild(button));

    act(() => button.click());
    expect(button.firstChild).toBe(button.querySelector("[data-icon=spinner]"));
    expect(button.lastChild).toBe(wrapper);
    expect(wrapper.textContent).toBe("Generating");
  });
});
