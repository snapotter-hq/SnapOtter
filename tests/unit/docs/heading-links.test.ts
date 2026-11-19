// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  headingAnchorFor,
  installHeadingLinks,
} from "../../../apps/docs/.vitepress/theme/heading-links.js";

// VitePress renders a section heading as text plus a hover-only "#" anchor.
function renderDoc() {
  document.body.innerHTML = `
    <div class="vp-doc">
      <h2 id="gpu"><span class="txt">GPU <code>--gpus</code></span>
        <a class="header-anchor" href="#gpu" aria-label="Permalink"></a></h2>
      <h3 id="linked">See <a class="inline" href="/guide/other">other</a>
        <a class="header-anchor" href="#linked"></a></h3>
      <h5 id="deep">Deep<a class="header-anchor" href="#deep"></a></h5>
      <p id="para">Body text</p>
    </div>
    <h2 id="outside">Not a doc heading<a class="header-anchor" href="#outside"></a></h2>`;
}

const el = (selector: string) => document.querySelector(selector) as Element;

describe("headingAnchorFor", () => {
  beforeEach(renderDoc);

  it("follows the heading's own anchor from its text or inline code", () => {
    expect(headingAnchorFor(el("#gpu .txt"), "")?.getAttribute("href")).toBe("#gpu");
    expect(headingAnchorFor(el("#gpu code"), "")?.getAttribute("href")).toBe("#gpu");
  });

  it("leaves real links alone", () => {
    expect(headingAnchorFor(el("#linked a.inline"), "")).toBeNull();
    expect(headingAnchorFor(el("#gpu a.header-anchor"), "")).toBeNull();
  });

  it("does nothing while the reader is selecting text", () => {
    expect(headingAnchorFor(el("#gpu .txt"), "GPU")).toBeNull();
  });

  it("ignores body text, minor headings, and headings outside the doc", () => {
    expect(headingAnchorFor(el("#para"), "")).toBeNull();
    expect(headingAnchorFor(el("#deep"), "")).toBeNull();
    expect(headingAnchorFor(el("#outside"), "")).toBeNull();
    expect(headingAnchorFor(null, "")).toBeNull();
  });
});

describe("installHeadingLinks", () => {
  beforeEach(() => {
    renderDoc();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  function setup() {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = document.body.innerHTML;
    installHeadingLinks(doc);
    const follow = vi.fn((e: Event) => e.preventDefault());
    doc.querySelector("#gpu a.header-anchor")?.addEventListener("click", follow);
    const text = doc.querySelector("#gpu .txt") as HTMLElement;
    const click = (init: MouseEventInit = {}) =>
      text.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0, detail: 1, ...init }));
    return { follow, click };
  }

  it("follows the anchor once the double-click window passes", () => {
    const { follow, click } = setup();
    click();
    expect(follow).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(follow).toHaveBeenCalledTimes(1);
  });

  it("does not jump on a double-click, which is a reader selecting a word", () => {
    const { follow, click } = setup();
    click({ detail: 1 });
    click({ detail: 2 });
    vi.runAllTimers();
    expect(follow).not.toHaveBeenCalled();
  });

  it("skips modified and non-primary clicks", () => {
    const { follow, click } = setup();
    click({ metaKey: true });
    click({ ctrlKey: true });
    click({ button: 1 });
    vi.runAllTimers();
    expect(follow).not.toHaveBeenCalled();
  });
});
