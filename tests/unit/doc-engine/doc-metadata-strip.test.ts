// Runs doc_metadata.py's "strip" mode against PDFs built with pikepdf, then
// reads the output back with pikepdf. Gated on pikepdf because the script
// needs it to open the file at all (#4837, #4972, #5182).

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

/**
 * Write a PDF the way InDesign or Illustrator leaves one: XMP on the catalog,
 * the page, a placed image and an inline annotation, plus PieceInfo on the
 * catalog, the page and an inline resource dictionary, and a structure tree
 * (#4972).
 */
function makeLayeredPdf(name: string): string {
  const path = join(dir, name);
  python(
    [
      "import sys, pikepdf",
      "pdf = pikepdf.new()",
      "pdf.add_blank_page()",
      "xmp = lambda who: pdf.make_stream(",
      "    ('<x:xmpmeta xmlns:x=\"adobe:ns:meta/\"><dc:creator>' + who + '</dc:creator></x:xmpmeta>').encode(),",
      "    Type=pikepdf.Name.Metadata, Subtype=pikepdf.Name.XML)",
      "piece = lambda: pikepdf.Dictionary(Illustrator=pikepdf.Dictionary(",
      "    LastModified=pikepdf.String('D:20200101000000Z'), Private=pikepdf.String('layers')))",
      "img = pdf.make_stream(b'\\xff\\x00\\x00', Type=pikepdf.Name.XObject, Subtype=pikepdf.Name.Image,",
      "    Width=1, Height=1, ColorSpace=pikepdf.Name.DeviceRGB, BitsPerComponent=8)",
      "img.Metadata = xmp('Photoshop user')",
      "page = pdf.pages[0]",
      "page.Resources = pikepdf.Dictionary(XObject=pikepdf.Dictionary(Im0=img))",
      "page.Contents = pdf.make_stream(b'q 10 0 0 10 0 0 cm /Im0 Do Q')",
      "page.Metadata = xmp('Page author')",
      "page.PieceInfo = piece()",
      "page.Annots = pikepdf.Array([pikepdf.Dictionary(Type=pikepdf.Name.Annot, Subtype=pikepdf.Name.Text,",
      "    Rect=[0, 0, 10, 10], Metadata=xmp('Reviewer'))])",
      "page.Resources.Properties = pikepdf.Dictionary(MC0=pikepdf.Dictionary(PieceInfo=piece()))",
      "pdf.Root.Metadata = xmp('Catalog author')",
      "pdf.Root.PieceInfo = piece()",
      "pdf.Root.StructTreeRoot = pdf.make_indirect(pikepdf.Dictionary(Type=pikepdf.Name.StructTreeRoot))",
      "pdf.save(sys.argv[1])",
    ].join("\n"),
    path,
  );
  return path;
}

/** Every /Metadata and /PieceInfo key a reader could still find, and what must survive. */
function inspectDeep(path: string): {
  metadata: number;
  pieceInfo: number;
  structTree: boolean;
  image: boolean;
} {
  return JSON.parse(
    python(
      [
        "import sys, json, pikepdf",
        "pdf = pikepdf.open(sys.argv[1])",
        "dicts, stack = [], list(pdf.objects)",
        "while stack:",
        "    o = stack.pop()",
        "    if isinstance(o, pikepdf.Array):",
        "        kids = list(o)",
        "    elif isinstance(o, (pikepdf.Dictionary, pikepdf.Stream)):",
        "        dicts.append(o)",
        "        kids = [o[k] for k in o.keys()]",
        "    else:",
        "        continue",
        "    stack += [k for k in kids if isinstance(k, (pikepdf.Array, pikepdf.Dictionary)) and not k.is_indirect]",
        "xobjects = pdf.pages[0].Resources.get('/XObject', {})",
        "print(json.dumps({",
        "    'metadata': sum('/Metadata' in o for o in dicts),",
        "    'pieceInfo': sum('/PieceInfo' in o for o in dicts),",
        "    'structTree': '/StructTreeRoot' in pdf.Root,",
        "    'image': '/Im0' in xobjects,",
        "}))",
      ].join("\n"),
      path,
    ),
  );
}

/**
 * Write a PDF with attachments in all three places a reader finds them: the
 * catalog EmbeddedFiles name tree, a FileAttachment annotation (with its
 * popup) and /AF associated-file arrays on the catalog and the page, as
 * ZUGFeRD invoices do. A link annotation stands in for content that must
 * survive (#5182).
 */
function makeAttachmentPdf(name: string): string {
  const path = join(dir, name);
  python(
    [
      "import sys, pikepdf",
      "pdf = pikepdf.new()",
      "pdf.add_blank_page()",
      "spec = pikepdf.AttachedFileSpec(pdf, b'internal', description='Draft by Alice',",
      "    creation_date='D:20200101000000Z', mod_date='D:20200102000000Z')",
      "pdf.attachments['notes.txt'] = spec",
      "named = pdf.Root.Names.EmbeddedFiles.Names[1]",
      "pdf.Root.AF = pikepdf.Array([named])",
      "annot_spec = pikepdf.AttachedFileSpec(pdf, b'annotated', filename='review.docx').obj",
      "page = pdf.pages[0]",
      "attach = pdf.make_indirect(pikepdf.Dictionary(Type=pikepdf.Name.Annot,",
      "    Subtype=pikepdf.Name.FileAttachment, Rect=[0, 0, 10, 10], FS=annot_spec))",
      "popup = pdf.make_indirect(pikepdf.Dictionary(Type=pikepdf.Name.Annot,",
      "    Subtype=pikepdf.Name.Popup, Rect=[10, 10, 50, 50], Parent=attach))",
      "attach.Popup = popup",
      "link = pikepdf.Dictionary(Type=pikepdf.Name.Annot, Subtype=pikepdf.Name.Link, Rect=[0, 20, 10, 30])",
      "page.Annots = pikepdf.Array([attach, popup, link])",
      "page.AF = pikepdf.Array([annot_spec])",
      "pdf.save(sys.argv[1])",
    ].join("\n"),
    path,
  );
  return path;
}

/**
 * Write a portfolio whose name tree holds a direct filespec, plus a Launch
 * action whose filespec embeds its own file outside the name tree (#5182).
 */
function makePortfolioPdf(name: string): string {
  const path = join(dir, name);
  python(
    [
      "import sys, pikepdf",
      "pdf = pikepdf.new()",
      "pdf.add_blank_page()",
      "embedded = lambda data: pdf.make_stream(data, Type=pikepdf.Name.EmbeddedFile)",
      "spec = pikepdf.Dictionary(Type=pikepdf.Name.Filespec, F=pikepdf.String('a.txt'),",
      "    EF=pikepdf.Dictionary(F=embedded(b'portfolio')))",
      "pdf.Root.Names = pikepdf.Dictionary(EmbeddedFiles=pikepdf.Dictionary(",
      "    Names=pikepdf.Array([pikepdf.String('a.txt'), spec])))",
      "pdf.Root.Collection = pikepdf.Dictionary(Type=pikepdf.Name.Collection)",
      "pdf.Root.OpenAction = pikepdf.Dictionary(S=pikepdf.Name.Launch, F=pikepdf.Dictionary(",
      "    Type=pikepdf.Name.Filespec, F=pikepdf.String('run.bin'),",
      "    EF=pikepdf.Dictionary(F=embedded(b'payload'))))",
      "pdf.save(sys.argv[1])",
    ].join("\n"),
    path,
  );
  return path;
}

/** What a reader could still find of the attachments, and the link that must survive. */
function inspectAttachments(path: string): {
  named: string[];
  annots: string[];
  af: number;
  embeddedStreams: number;
  collection: boolean;
} {
  return JSON.parse(
    python(
      [
        "import sys, json, pikepdf",
        "pdf = pikepdf.open(sys.argv[1])",
        "page = pdf.pages[0]",
        "objs = list(pdf.objects)",
        "dicts = [o for o in objs if isinstance(o, (pikepdf.Dictionary, pikepdf.Stream))]",
        "print(json.dumps({",
        "    'named': sorted(pdf.attachments.keys()),",
        "    'annots': [str(a.Subtype) for a in page.obj.get('/Annots', [])],",
        "    'af': sum('/AF' in o for o in dicts),",
        "    'embeddedStreams': sum(o.get('/Type') == pikepdf.Name.EmbeddedFile for o in dicts),",
        "    'collection': '/Collection' in pdf.Root,",
        "}))",
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

  it("removes page, image and inline-dict XMP and PieceInfo but keeps the structure tree and the image", () => {
    const input = makeLayeredPdf("layered.pdf");
    expect(inspectDeep(input)).toEqual({
      metadata: 4,
      pieceInfo: 3,
      structTree: true,
      image: true,
    });
    const out = join(dir, "layered-out.pdf");

    const result = runScript({ path: input, out, mode: "strip" });

    expect(inspectDeep(out)).toEqual({ metadata: 0, pieceInfo: 0, structTree: true, image: true });
    expect(result.xmpRemoved).toBe(true);
    expect(result.objectXmpRemoved).toBe(3);
    expect(result.pieceInfoRemoved).toBe(3);
  });

  it("reports zero object XMP and PieceInfo for a plain PDF", () => {
    const input = makePdf("plain.pdf", { xmp: true });
    const out = join(dir, "plain-out.pdf");

    const result = runScript({ path: input, out, mode: "strip" });

    expect(result.objectXmpRemoved).toBe(0);
    expect(result.pieceInfoRemoved).toBe(0);
  });

  it("keeps attachments unless removeAttachments is set", () => {
    const input = makeAttachmentPdf("attach-kept.pdf");
    const out = join(dir, "attach-kept-out.pdf");

    const result = runScript({ path: input, out, mode: "strip" });

    expect(inspectAttachments(out)).toEqual(inspectAttachments(input));
    expect(result.attachmentsRemoved).toBe(0);
  });

  it("removes named, annotation and associated-file attachments with removeAttachments", () => {
    const input = makeAttachmentPdf("attach.pdf");
    expect(inspectAttachments(input)).toEqual({
      named: ["notes.txt"],
      annots: ["/FileAttachment", "/Popup", "/Link"],
      af: 2,
      embeddedStreams: 2,
      collection: false,
    });
    const out = join(dir, "attach-out.pdf");

    const result = runScript({ path: input, out, mode: "strip", removeAttachments: true });

    expect(inspectAttachments(out)).toEqual({
      named: [],
      annots: ["/Link"],
      af: 0,
      embeddedStreams: 0,
      collection: false,
    });
    expect(result.attachmentsRemoved).toBe(2);
  });

  it("counts and removes direct filespecs, the portfolio and files embedded outside the name tree", () => {
    const input = makePortfolioPdf("portfolio.pdf");
    expect(inspectAttachments(input)).toMatchObject({
      named: ["a.txt"],
      embeddedStreams: 2,
      collection: true,
    });
    const out = join(dir, "portfolio-out.pdf");

    const result = runScript({ path: input, out, mode: "strip", removeAttachments: true });

    expect(inspectAttachments(out)).toMatchObject({
      named: [],
      embeddedStreams: 0,
      collection: false,
    });
    expect(result.attachmentsRemoved).toBe(2);
  });
});
