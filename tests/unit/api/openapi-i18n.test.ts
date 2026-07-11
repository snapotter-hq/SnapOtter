// tests/unit/api/openapi-i18n.test.ts
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  generateLocaleLlmsTxt,
  resolveSpecFile,
} from "../../../apps/api/src/routes/openapi-i18n.js";

describe("resolveSpecFile", () => {
  let dir: string;
  const setup = () => {
    dir = mkdtempSync(join(tmpdir(), "openapi-i18n-"));
    writeFileSync(join(dir, "openapi.yaml"), "openapi: 3.1.0\n", "utf8");
    writeFileSync(join(dir, "openapi.de.yaml"), "openapi: 3.1.0\nx-i18n:\n  locale: de\n", "utf8");
    return dir;
  };

  it("returns the locale file when it exists and the code is supported", () => {
    const d = setup();
    expect(resolveSpecFile(d, "de")).toBe(join(d, "openapi.de.yaml"));
  });

  it("falls back to English for an unsupported code", () => {
    const d = setup();
    expect(resolveSpecFile(d, "zz")).toBe(join(d, "openapi.yaml"));
  });

  it("falls back to English when the supported locale spec is absent", () => {
    const d = setup();
    // fr is a supported locale but no openapi.fr.yaml was written.
    expect(resolveSpecFile(d, "fr")).toBe(join(d, "openapi.yaml"));
  });

  it("returns English for en and for an empty/undefined lang", () => {
    const d = setup();
    expect(resolveSpecFile(d, "en")).toBe(join(d, "openapi.yaml"));
    expect(resolveSpecFile(d, "")).toBe(join(d, "openapi.yaml"));
    expect(resolveSpecFile(d, undefined)).toBe(join(d, "openapi.yaml"));
  });
});

describe("generateLocaleLlmsTxt", () => {
  const spec = {
    info: { title: "SnapOtter API", version: "2.0.0" },
    tags: [{ name: "Tools", description: "Werkzeuge zur Dateiverarbeitung." }],
    paths: {
      "/api/v1/tools/image/resize": { post: { tags: ["Tools"], summary: "Groesse aendern" } },
    },
  };
  const sections = [{ id: "image", name: "Image" }];
  const toolsBySection = {
    image: [{ id: "resize", executionHint: "fast" as const }],
  };
  // Translated tool strings for de, as loadToolStrings(locale) returns them.
  const toolStrings = { resize: { name: "Groesse aendern", description: "Nach Pixeln." } };

  it("uses translated tool names and descriptions from shared i18n", () => {
    const out = generateLocaleLlmsTxt({ spec, sections, toolsBySection, toolStrings });
    expect(out).toContain("# SnapOtter API");
    expect(out).toContain("Werkzeuge zur Dateiverarbeitung.");
    expect(out).toContain("Groesse aendern - Nach Pixeln. (resize, sync)");
  });

  it("falls back to the tool id label when a translation is missing", () => {
    const out = generateLocaleLlmsTxt({
      spec,
      sections,
      toolsBySection,
      toolStrings: {}, // no translation available
    });
    // Still lists the tool by id with the sync mode, never crashes.
    expect(out).toContain("(resize, sync)");
  });
});
