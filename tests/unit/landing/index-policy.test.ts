import { SUPPORTED_LOCALES, TOOLS, toolSection } from "@snapotter/shared";
import { describe, expect, it } from "vitest";
import { ALTERNATIVES } from "../../../apps/landing/src/data/alternatives.js";
import {
  INDEXED_KEEP_PATHS,
  isNoindexPath,
  isNoindexUrl,
} from "../../../apps/landing/src/lib/index-policy.js";

const NON_ENGLISH = SUPPORTED_LOCALES.map((l) => l.code).filter((c) => c !== "en");
const toolPath = (t: (typeof TOOLS)[number]) => `/tools/${toolSection(t)}/${t.id}/`;

describe("landing index policy (#4833)", () => {
  it("keeps every page on the keep-list indexed", () => {
    for (const path of INDEXED_KEEP_PATHS) {
      expect(isNoindexPath(path), path).toBe(false);
    }
  });

  it("names only keep-list tool pages that exist", () => {
    const toolPaths = new Set(TOOLS.map(toolPath));
    for (const path of INDEXED_KEEP_PATHS.filter((p) => p.startsWith("/tools/"))) {
      expect(toolPaths.has(path), path).toBe(true);
    }
  });

  it("noindexes every x-to-y converter and preset tool page, and no other tool page", () => {
    const converters = TOOLS.filter((t) => t.id.includes("-to-"));
    expect(converters.length).toBeGreaterThan(100);
    for (const tool of TOOLS) {
      expect(isNoindexPath(toolPath(tool)), tool.id).toBe(tool.id.includes("-to-"));
    }
    expect(isNoindexPath("/tools/image/jpg-to-png/")).toBe(true);
    expect(isNoindexPath("/tools/image/compress-image-to-100kb/")).toBe(true);
    expect(isNoindexPath("/tools/pdf/compress-pdf-to-1mb/")).toBe(true);
    expect(isNoindexPath("/tools/image/resize/")).toBe(false);
  });

  it("noindexes every localized alternatives page except the Russian Acrobat page", () => {
    const localized = NON_ENGLISH.flatMap((code) => [
      `/${code}/alternatives/`,
      ...ALTERNATIVES.map((a) => `/${code}/alternatives/${a.slug}/`),
    ]);
    expect(localized.length).toBe(NON_ENGLISH.length * (ALTERNATIVES.length + 1));
    const indexed = localized.filter((p) => !isNoindexPath(p));
    expect(indexed).toEqual(["/ru/alternatives/adobe-acrobat-online/"]);
  });

  it("keeps the English alternatives pages indexed", () => {
    expect(isNoindexPath("/alternatives/")).toBe(false);
    for (const alt of ALTERNATIVES) {
      expect(isNoindexPath(`/alternatives/${alt.slug}/`), alt.slug).toBe(false);
    }
  });

  it("leaves the rest of the site indexed", () => {
    for (const path of ["/", "/faq/", "/de/", "/de/faq/", "/ru/tools/", "/de/tools/image/"]) {
      expect(isNoindexPath(path), path).toBe(false);
    }
    expect(isNoindexPath("/self-hosted/")).toBe(false);
  });

  it("matches with or without the trailing slash, and from a full URL", () => {
    expect(isNoindexPath("/de/alternatives/removebg")).toBe(true);
    expect(isNoindexPath("/ru/alternatives/adobe-acrobat-online")).toBe(false);
    expect(isNoindexUrl("https://snapotter.com/tools/image/jpg-to-png/")).toBe(true);
    expect(isNoindexUrl("https://snapotter.com/alternatives/removebg/")).toBe(false);
    expect(isNoindexUrl("not a url")).toBe(false);
  });
});
