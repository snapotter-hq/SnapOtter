// Runs doc_metadata.py's "strip" mode against PDFs built with pikepdf, then
// reads the output back with pikepdf. Gated on pikepdf because the script
// needs it to open the file at all (#4837).

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { hasPikepdf, pythonBin } from "../../helpers/python-gate.js";

const SCRIPT = join(process.cwd(), "packages", "ai", "python", "doc_metadata.py");
const dir = mkdtempSync(join(tmpdir(), "doc-metadata-strip-"));

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function python(code: string, ...args: string[]): string {
  const res = spawnSync(pythonBin as string, ["-c", code, ...args], {
    encoding: "utf8",
    timeout: 20_000,
  });
  if (res.status !== 0) throw new Error(`python failed: ${res.stderr}`);
  return res.stdout;
}

/** Write a one-page PDF with a full Info dictionary and, optionally, an XMP packet. */
function makePdf(name: string, opts: { xmp?: boolean; pdfa?: boolean } = {}): string {
  const path = join(dir, name);
  python(
    [
      "import sys, pikepdf",
      "pdf = pikepdf.new()",
      "pdf.add_blank_page()",
      "info = {'/Title': 'Secret plan', '/Author': 'Alice', '/Subject': 'S', '/Keywords': 'k',",
      "        '/Creator': 'Word', '/Producer': 'Acrobat', '/CreationDate': 'D:20200101000000Z',",
      "        '/ModDate': 'D:20200102000000Z', '/Trapped': pikepdf.Name('/False'), '/Custom': 'internal-id'}",
      "pdf.trailer.Info = pdf.make_indirect(pikepdf.Dictionary(info))",
      "if sys.argv[2] == '1':",
      "    with pdf.open_metadata(set_pikepdf_as_editor=False, update_docinfo=False) as m:",
      "        m['dc:creator'] = ['Alice']",
      "        m['xmp:CreatorTool'] = 'Word'",
      "        if sys.argv[3] == '1':",
      "            m['pdfaid:part'] = '2'",
      "            m['pdfaid:conformance'] = 'B'",
      "pdf.save(sys.argv[1])",
    ].join("\n"),
    path,
    opts.xmp ? "1" : "0",
    opts.pdfa ? "1" : "0",
  );
  return path;
}

function runScript(args: Record<string, unknown>): Record<string, unknown> {
  const res = spawnSync(pythonBin as string, [SCRIPT, JSON.stringify(args)], {
    encoding: "utf8",
    timeout: 20_000,
  });
  const out = JSON.parse(res.stdout.trim());
  if (res.status !== 0) throw new Error(`doc_metadata failed: ${res.stdout} ${res.stderr}`);
  return out;
}

/** Everything a reader could still find: the trailer Info keys and whether XMP exists. */
function inspect(path: string): { info: Record<string, string>; xmp: boolean } {
  return JSON.parse(
    python(
      [
        "import sys, json, pikepdf",
        "pdf = pikepdf.open(sys.argv[1])",
        "info = pdf.trailer.get('/Info')",
        "keys = {str(k): str(v) for k, v in info.items()} if info is not None else {}",
        "print(json.dumps({'info': keys, 'xmp': '/Metadata' in pdf.Root}))",
      ].join("\n"),
      path,
    ),
  );
}

describe.skipIf(!hasPikepdf)("doc_metadata.py strip mode (requires pikepdf)", () => {
  it("removes the whole Info dictionary and the XMP stream", () => {
    const input = makePdf("full.pdf", { xmp: true });
    const out = join(dir, "full-out.pdf");

    const result = runScript({ path: input, out, mode: "strip" });

    expect(inspect(out)).toEqual({ info: {}, xmp: false });
    expect(result.ok).toBe(true);
    expect(result.xmpRemoved).toBe(true);
    expect(result.pdfa).toBeNull();
    expect([...(result.removed as string[])].sort()).toEqual(
      [
        "Author",
        "CreationDate",
        "Creator",
        "Custom",
        "Keywords",
        "ModDate",
        "Producer",
        "Subject",
        "Title",
        "Trapped",
      ].sort(),
    );
  });

  it("reports the declared PDF/A level so callers can warn that conformance is gone", () => {
    const input = makePdf("pdfa.pdf", { xmp: true, pdfa: true });
    const out = join(dir, "pdfa-out.pdf");

    const result = runScript({ path: input, out, mode: "strip" });

    expect(result.pdfa).toBe("2B");
    expect(inspect(out).xmp).toBe(false);
  });

  it("handles a PDF with no XMP and reports xmpRemoved false", () => {
    const input = makePdf("no-xmp.pdf");
    const out = join(dir, "no-xmp-out.pdf");

    const result = runScript({ path: input, out, mode: "strip" });

    expect(result.xmpRemoved).toBe(false);
    expect(inspect(out)).toEqual({ info: {}, xmp: false });
  });

  it("handles a PDF that has no Info dictionary at all", () => {
    const bare = join(dir, "bare.pdf");
    python(
      "import sys, pikepdf\npdf = pikepdf.new()\npdf.add_blank_page()\npdf.save(sys.argv[1])",
      bare,
    );
    const out = join(dir, "bare-out.pdf");

    const result = runScript({ path: bare, out, mode: "strip" });

    expect(result.removed).toEqual([]);
    expect(inspect(out)).toEqual({ info: {}, xmp: false });
  });

  it("writes the given fields onto the stripped document", () => {
    const input = makePdf("restamp.pdf", { xmp: true });
    const out = join(dir, "restamp-out.pdf");

    runScript({ path: input, out, mode: "strip", metadata: { Title: "Public title", Author: "" } });

    expect(inspect(out)).toEqual({ info: { "/Title": "Public title" }, xmp: false });
  });
});
