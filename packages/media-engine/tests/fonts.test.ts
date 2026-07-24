import { existsSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({ existsSync: vi.fn() }));

const DEJAVU = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
const ARIAL = "/System/Library/Fonts/Supplemental/Arial.ttf";
const HELVETICA = "/System/Library/Fonts/Helvetica.ttc";

describe("resolveFontFile", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(existsSync).mockReset();
    delete process.env.SNAPOTTER_FONT_FILE;
    delete process.env.SNAPOTTER_FONT_FAMILY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SNAPOTTER_FONT_FILE;
    delete process.env.SNAPOTTER_FONT_FAMILY;
  });

  it("env override wins without touching the filesystem, default family 'Sans'", async () => {
    process.env.SNAPOTTER_FONT_FILE = "/custom/MyFont.ttf";
    const { resolveFontFile } = await import("../src/fonts.js");
    expect(resolveFontFile()).toEqual({ file: "/custom/MyFont.ttf", family: "Sans" });
    expect(vi.mocked(existsSync)).not.toHaveBeenCalled();
  });

  it("env override uses SNAPOTTER_FONT_FAMILY when set", async () => {
    process.env.SNAPOTTER_FONT_FILE = "/custom/MyFont.ttf";
    process.env.SNAPOTTER_FONT_FAMILY = "My Font";
    const { resolveFontFile } = await import("../src/fonts.js");
    expect(resolveFontFile()).toEqual({ file: "/custom/MyFont.ttf", family: "My Font" });
  });

  it("returns the first existing candidate (DejaVu) with its exact family", async () => {
    vi.mocked(existsSync).mockImplementation((p) => p === DEJAVU);
    const { resolveFontFile } = await import("../src/fonts.js");
    expect(resolveFontFile()).toEqual({ file: DEJAVU, family: "DejaVu Sans" });
  });

  it("falls through to Arial when DejaVu is missing", async () => {
    vi.mocked(existsSync).mockImplementation((p) => p === ARIAL);
    const { resolveFontFile } = await import("../src/fonts.js");
    expect(resolveFontFile()).toEqual({ file: ARIAL, family: "Arial" });
  });

  it("falls through to Helvetica when DejaVu and Arial are missing", async () => {
    vi.mocked(existsSync).mockImplementation((p) => p === HELVETICA);
    const { resolveFontFile } = await import("../src/fonts.js");
    expect(resolveFontFile()).toEqual({ file: HELVETICA, family: "Helvetica" });
  });

  it("returns the earliest match when several candidates exist (order matters)", async () => {
    // Both Arial and Helvetica present, DejaVu absent: Arial comes first.
    vi.mocked(existsSync).mockImplementation((p) => p === ARIAL || p === HELVETICA);
    const { resolveFontFile } = await import("../src/fonts.js");
    expect(resolveFontFile()).toEqual({ file: ARIAL, family: "Arial" });
  });

  it("returns null when no candidate file exists", async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const { resolveFontFile } = await import("../src/fonts.js");
    expect(resolveFontFile()).toBeNull();
  });
});
