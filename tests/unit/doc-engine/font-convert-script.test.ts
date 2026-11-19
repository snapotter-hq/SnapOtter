// font_convert.py: the pure helpers run on plain python3 (fontTools is only
// imported inside the conversion functions), so they run in CI. The end-to-end
// conversions need fontTools, which the image gets from WeasyPrint; point
// PYTHON_VENV_PATH at a venv with it to run them locally.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { afterAll, describe, expect, it } from "vitest";
import { hasPython, pythonBin, pythonWith } from "../../helpers/python-gate.js";

const SCRIPT_DIR = join(process.cwd(), "packages", "ai", "python");
const SCRIPT = join(SCRIPT_DIR, "font_convert.py");
const FIXTURES = join(process.cwd(), "tests", "fixtures", "data", "valid");
const hasFontTools = hasPython && pythonWith("fontTools.ttLib") && pythonWith("brotli");

type HelperResult = { ok: unknown } | { inputError: string } | { error: string };

/** Call one font_convert helper with JSON args; FontInputError comes back as inputError. */
function callHelper(fn: string, ...args: unknown[]): HelperResult {
  const code = [
    "import sys, json",
    `sys.path.insert(0, ${JSON.stringify(SCRIPT_DIR)})`,
    "import font_convert as m",
    "args = json.loads(sys.argv[1])",
    "args = [bytes.fromhex(a[4:]) if isinstance(a, str) and a.startswith('hex:') else a for a in args]",
    "try:",
    `    sys.stdout.write(json.dumps({"ok": getattr(m, ${JSON.stringify(fn)})(*args)}))`,
    "except m.FontInputError as e:",
    `    sys.stdout.write(json.dumps({"inputError": str(e)}))`,
    "except Exception as e:",
    `    sys.stdout.write(json.dumps({"error": type(e).__name__}))`,
  ].join("\n");
  const res = spawnSync(pythonBin ?? "python3", ["-c", code, JSON.stringify(args)], {
    encoding: "utf8",
    timeout: 10_000,
  });
  if (res.status !== 0) throw new Error(`python failed: ${res.stderr}`);
  return JSON.parse(res.stdout) as HelperResult;
}

const hex = (text: string) => `hex:${Buffer.from(text, "latin1").toString("hex")}`;

describe.skipIf(!hasPython)("font_convert.detect_format", () => {
  it.each([
    [hex("\u0000\u0001\u0000\u0000"), "ttf"],
    [hex("true"), "ttf"],
    [hex("OTTO"), "otf"],
    [hex("wOFF"), "woff"],
    [hex("wOF2"), "woff2"],
    [hex("%PDF"), null],
  ])("reads %s as %s", (header, expected) => {
    expect(callHelper("detect_format", header)).toEqual({ ok: expected });
  });

  it("refuses a font collection with a user-facing reason", () => {
    expect(callHelper("detect_format", hex("ttcf"))).toEqual({
      inputError: expect.stringContaining("collections"),
    });
  });
});

describe.skipIf(!hasPython)("font_convert.plan", () => {
  const TT = ["head", "glyf", "loca"];
  const CFF = ["head", "CFF "];

  it.each([
    [TT, "ttf", "keep"],
    [TT, "woff2", "keep"],
    [TT, "otf", "to_cff"],
    [CFF, "otf", "keep"],
    [CFF, "woff", "keep"],
    [CFF, "ttf", "to_truetype"],
    [["head", "CFF2", "fvar"], "otf", "keep"],
  ])("%j to %s needs %s", (tags, target, expected) => {
    expect(callHelper("plan", tags, target)).toEqual({ ok: expected });
  });

  it("refuses variable CFF2 to TTF", () => {
    expect(callHelper("plan", ["head", "CFF2", "fvar"], "ttf")).toEqual({
      inputError: expect.stringContaining("CFF2"),
    });
  });

  it("refuses variable TrueType to OTF, since CFF cannot carry the variations", () => {
    expect(callHelper("plan", [...TT, "fvar", "gvar"], "otf")).toEqual({
      inputError: expect.stringContaining("Variable TrueType"),
    });
  });

  it("refuses a font with no outlines", () => {
    expect(callHelper("plan", ["head", "cmap"], "ttf")).toEqual({
      inputError: expect.stringContaining("no glyph outlines"),
    });
  });

  it("treats an unknown target as a bug, not the user's input", () => {
    expect(callHelper("plan", TT, "eot")).toEqual({ error: "ValueError" });
  });
});

/** A one-table WOFF whose table inflates to `actual` bytes but declares `declared`. */
function woffWithTable(declared: number, actual: number): string {
  const payload = deflateSync(Buffer.alloc(actual, 0x41));
  const header = Buffer.alloc(44);
  header.write("wOFF", 0, "latin1");
  header.writeUInt32BE(0x00010000, 4);
  header.writeUInt16BE(1, 12);
  header.writeUInt32BE(declared, 16);
  const entry = Buffer.alloc(20);
  entry.write("head", 0, "latin1");
  entry.writeUInt32BE(64, 4);
  entry.writeUInt32BE(payload.length, 8);
  entry.writeUInt32BE(declared, 12);
  return `hex:${Buffer.concat([header, entry, payload]).toString("hex")}`;
}

describe.skipIf(!hasPython)("font_convert.check_woff_size", () => {
  it("accepts tables that inflate to their declared size", () => {
    expect(callHelper("check_woff_size", woffWithTable(6000, 5000))).toEqual({ ok: null });
  });

  it("refuses a table that inflates past its declared size", () => {
    expect(callHelper("check_woff_size", woffWithTable(4000, 5000))).toEqual({
      inputError: expect.stringContaining("damaged"),
    });
  });

  it("refuses a font that declares more than the decompression cap", () => {
    expect(callHelper("check_woff_size", woffWithTable(65 * 1024 * 1024, 10))).toEqual({
      inputError: expect.stringContaining("too large"),
    });
  });
});

describe.skipIf(!hasPython)("font_convert CFF name strings", () => {
  it("keeps a PostScript name to printable ASCII without delimiters", () => {
    expect(callHelper("postscript_name", "My Font (Bold)/x")).toEqual({ ok: "MyFontBoldx" });
    expect(callHelper("postscript_name", "宋体")).toEqual({ ok: "Font" });
  });

  it("drops what Latin-1 cannot hold instead of failing", () => {
    expect(callHelper("latin1_text", "© 2020–2024 Café")).toEqual({ ok: "© 20202024 Café" });
  });
});

describe.skipIf(!hasFontTools)("font_convert end to end (fontTools)", () => {
  const work = mkdtempSync(join(tmpdir(), "font-convert-"));
  afterAll(() => rmSync(work, { recursive: true, force: true }));

  function run(input: string, format: string) {
    const out = join(work, `${input.replace(/\W/g, "_")}-${format}`);
    const res = spawnSync(
      pythonBin as string,
      [SCRIPT, JSON.stringify({ path: input, out, format })],
      { encoding: "utf8", timeout: 60_000 },
    );
    return { out, status: res.status, stdout: JSON.parse(res.stdout.trim()) };
  }

  /** Container flavor, outline table, fsType and the glyph mapped to "O". */
  function inspect(path: string) {
    const code = [
      "import sys, json",
      "from fontTools.ttLib import TTFont",
      "f = TTFont(sys.argv[1])",
      "json.dump({'flavor': f.flavor, 'outlines': 'glyf' if 'glyf' in f else ('CFF ' if 'CFF ' in f else None),",
      "  'fsType': f['OS/2'].fsType, 'O': f.getBestCmap().get(79), 'glyphs': len(f.getGlyphOrder())}, sys.stdout)",
    ].join("\n");
    const res = spawnSync(pythonBin as string, ["-c", code, path], { encoding: "utf8" });
    if (res.status !== 0) throw new Error(res.stderr);
    return JSON.parse(res.stdout);
  }

  const EXPECTED: Record<string, { flavor: string | null; outlines?: string }> = {
    ttf: { flavor: null, outlines: "glyf" },
    otf: { flavor: null, outlines: "CFF " },
    woff: { flavor: "woff" },
    woff2: { flavor: "woff2" },
  };

  for (const source of ["ttf", "otf", "woff", "woff2"]) {
    for (const target of ["ttf", "otf", "woff", "woff2"]) {
      it(`converts ${source} to ${target}, keeping glyphs and fsType`, () => {
        const { out, status, stdout } = run(join(FIXTURES, `tiny.${source}`), target);
        expect(status).toBe(0);
        expect(stdout).toEqual({ ok: true, format: target });
        const sourceOutlines = source === "otf" ? "CFF " : "glyf";
        expect(inspect(out)).toEqual({
          flavor: EXPECTED[target].flavor,
          outlines: EXPECTED[target].outlines ?? sourceOutlines,
          fsType: 8,
          O: "O",
          glyphs: 3,
        });
      });
    }
  }

  it("reports a non-font as inputError and exits 0", () => {
    const { status, stdout } = run(join(process.cwd(), "package.json"), "ttf");
    expect(status).toBe(0);
    expect(stdout).toEqual({ inputError: expect.stringContaining("isn't a TTF") });
  });

  it("reports a truncated font as inputError, not a crash", () => {
    const truncated = join(work, "truncated.ttf");
    writeFileSync(truncated, readFileSync(join(FIXTURES, "tiny.ttf")).subarray(0, 600));
    for (const format of ["woff2", "otf"]) {
      const { status, stdout } = run(truncated, format);
      expect(status).toBe(0);
      expect(stdout).toEqual({ inputError: expect.stringContaining("damaged") });
    }
  });

  /** Run a fontTools snippet over FIXTURES/tiny.ttf, saving the result to `out`. */
  function derive(out: string, body: string) {
    const code = [
      "import sys",
      "from fontTools.ttLib import TTFont",
      "f = TTFont(sys.argv[1])",
      body,
      "f.save(sys.argv[2])",
    ].join("\n");
    const res = spawnSync(pythonBin as string, ["-c", code, join(FIXTURES, "tiny.ttf"), out], {
      encoding: "utf8",
    });
    if (res.status !== 0) throw new Error(res.stderr);
    return out;
  }

  it("converts a TTF whose names are not Latin-1 to OTF", () => {
    const input = derive(
      join(work, "unicode.ttf"),
      [
        "f['name'].setName('Copyright \u00a9 2020\u20132024', 0, 3, 1, 0x409)",
        "f['name'].setName('\u5b8b\u4f53', 6, 3, 1, 0x409)",
      ].join("\n"),
    );
    const { status, stdout } = run(input, "otf");
    expect(status).toBe(0);
    expect(stdout).toEqual({ ok: true, format: "otf" });
  });

  it("reverses contour direction between TrueType and CFF", () => {
    const { out } = run(join(FIXTURES, "tiny.ttf"), "otf");
    const area = (path: string) => {
      const code = [
        "import sys",
        "from fontTools.ttLib import TTFont",
        "from fontTools.pens.areaPen import AreaPen",
        "f = TTFont(sys.argv[1]); gs = f.getGlyphSet(); pen = AreaPen(gs)",
        "gs['O'].draw(pen); print(pen.value)",
      ].join("\n");
      return Number(
        spawnSync(pythonBin as string, ["-c", code, path], { encoding: "utf8" }).stdout,
      );
    };
    const before = area(join(FIXTURES, "tiny.ttf"));
    const after = area(out);
    expect(Math.sign(after)).toBe(-Math.sign(before));
    expect(Math.abs(after)).toBeCloseTo(Math.abs(before), -2);
  });

  it("reports a font with garbled glyph data as inputError for every target", () => {
    const input = join(work, "garbled-glyf.ttf");
    const bytes = readFileSync(join(FIXTURES, "tiny.ttf"));
    const offsetCode =
      "import sys\nfrom fontTools.ttLib import TTFont\nprint(TTFont(sys.argv[1]).reader.tables['glyf'].offset)";
    const offset = Number(
      spawnSync(pythonBin as string, ["-c", offsetCode, join(FIXTURES, "tiny.ttf")], {
        encoding: "utf8",
      }).stdout,
    );
    bytes.fill(0xff, offset, offset + 40);
    writeFileSync(input, bytes);
    for (const format of ["woff2", "otf", "woff"]) {
      const { status, stdout } = run(input, format);
      expect(status).toBe(0);
      expect(stdout).toEqual({ inputError: expect.stringContaining("damaged") });
    }
  });

  it("reports a WOFF with scrambled compressed data as inputError", () => {
    const input = join(work, "scrambled.woff");
    const bytes = readFileSync(join(FIXTURES, "tiny.woff"));
    for (let i = 200; i < bytes.length; i++) bytes[i] ^= 0x5a;
    writeFileSync(input, bytes);
    for (const format of ["ttf", "woff2"]) {
      const { status, stdout } = run(input, format);
      expect(status).toBe(0);
      expect(stdout).toEqual({ inputError: expect.stringContaining("damaged") });
    }
  });

  it("caps WOFF2 brotli decompression instead of inflating a bomb", () => {
    const code = [
      "import sys, json, brotli",
      `sys.path.insert(0, ${JSON.stringify(SCRIPT_DIR)})`,
      "import font_convert as m",
      "bomb = brotli.compress(b'\\0' * (m.MAX_SFNT_BYTES + 1), quality=1)",
      "capped = m.CappedBrotli(brotli)",
      "assert capped.decompress(brotli.compress(b'abc')) == b'abc'",
      "try:",
      "    capped.decompress(bomb); print('inflated')",
      "except m.FontInputError as e:",
      "    print(e)",
    ].join("\n");
    const res = spawnSync(pythonBin as string, ["-c", code], { encoding: "utf8", timeout: 60_000 });
    expect(res.stderr).toBe("");
    expect(res.stdout.trim()).toContain("too large");
  });
});
