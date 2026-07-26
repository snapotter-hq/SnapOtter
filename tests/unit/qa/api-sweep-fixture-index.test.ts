/**
 * Guards the container QA sweep against silent coverage loss.
 *
 * The sweep only exercises a (tool, format) pair when it can find a fixture for
 * that format. When resolution guessed filenames from a per-modality prefix,
 * every MKV case vanished before a request was sent because the repo's only MKV
 * fixture is named tiny-subs.mkv. Nothing failed; the sweep just got smaller.
 * These tests make a fixture rename fail loudly instead.
 */

import { existsSync, statSync } from "node:fs";
import { extname } from "node:path";
import { describe, expect, it } from "vitest";
import { TOOLS } from "../../../packages/shared/src/constants.js";
import {
  buildFixtureIndex,
  EXT_ALIASES,
  fixturesFor,
  resolveFixture,
} from "../../qa/lib/fixture-index.js";

/** Every extension any live tool declares it accepts, lowercased. */
function acceptedExtensions(): string[] {
  const extensions = new Set<string>();
  for (const tool of TOOLS) {
    for (const ext of tool.acceptedInputs) extensions.add(ext.toLowerCase());
  }
  return [...extensions].sort();
}

/** First live tool declaring an extension, so failures name a real tool. */
function toolsAccepting(ext: string): string[] {
  return TOOLS.filter((tool) =>
    tool.acceptedInputs.some((accepted) => accepted.toLowerCase() === ext),
  ).map((tool) => tool.id);
}

describe("QA sweep fixture resolution", () => {
  it("resolves every extension in the live tool catalog to a real file", () => {
    const unresolved: string[] = [];
    for (const ext of acceptedExtensions()) {
      const tools = toolsAccepting(ext);
      const modality = TOOLS.find((tool) => tool.id === tools[0])?.modality ?? "image";
      const path = resolveFixture(ext, modality);
      if (!path || !existsSync(path) || statSync(path).size === 0) {
        unresolved.push(`${ext} (${tools.length} tools, e.g. ${tools.slice(0, 3).join(", ")})`);
      }
    }
    expect(
      unresolved,
      `extensions with no usable QA fixture:\n  ${unresolved.join("\n  ")}`,
    ).toEqual([]);
  });

  it("finds fixtures whose filename does not follow a modality prefix", () => {
    // tiny-subs.mkv is the repo's only MKV fixture and matches neither the
    // "sample." nor the "tiny." prefix the sweep used to guess.
    const mkv = resolveFixture(".mkv", "video");
    expect(mkv, "no fixture resolved for .mkv").not.toBeNull();
    expect(extname(mkv ?? "")).toBe(".mkv");
    expect(existsSync(mkv ?? "")).toBe(true);
  });

  it("keeps the canonical image fixture for extensions that have several", () => {
    // Ordering must stay deterministic or sweep results are not comparable
    // between runs. formats/ outranks valid/, then shortest filename wins.
    expect(resolveFixture(".png", "image")).toMatch(/image\/formats\/sample\.png$/);
    expect(resolveFixture(".mp3", "audio")).toMatch(/audio\/formats\/tiny\.mp3$/);
  });

  it("prefers a fixture from the tool's own modality tree", () => {
    // .pdf lives under document/, so a document tool must not be handed an
    // image-tree file even though the global index also holds one.
    const pdf = resolveFixture(".pdf", "document");
    expect(pdf).toMatch(/tests\/fixtures\/document\//);
  });

  it("falls back to an aliased extension only when the exact one is absent", () => {
    const index = buildFixtureIndex();
    for (const [alias, target] of Object.entries(EXT_ALIASES)) {
      if (index.has(alias)) continue;
      const resolved = resolveFixture(alias, "image");
      expect(resolved, `alias ${alias} did not fall back to ${target}`).not.toBeNull();
      expect(extname(resolved ?? "")).toBe(target);
    }
  });

  it("indexes by extension rather than by filename prefix", () => {
    const index = buildFixtureIndex();
    const prefixed = [...index.values()]
      .flat()
      .filter((entry) => !/^(sample|tiny)\./.test(entry.filename));
    expect(
      prefixed.length,
      "no non-prefixed fixtures found; the index would be indistinguishable from prefix guessing",
    ).toBeGreaterThan(0);
    for (const entry of prefixed.slice(0, 20)) {
      const ext = extname(entry.filename).toLowerCase();
      expect(index.get(ext)?.some((candidate) => candidate.path === entry.path)).toBe(true);
    }
  });

  it("returns every candidate for an extension, not just the first", () => {
    const pngs = fixturesFor(".png", "image");
    expect(pngs.length).toBeGreaterThan(1);
    expect(new Set(pngs.map((entry) => entry.path)).size).toBe(pngs.length);
  });
});
