import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import { hasFitz, pythonBin } from "../../../helpers/python-gate.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const PDF = readFixture(fixtures.document.pdf3);

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

async function runTool(content: Buffer = PDF, filename = "test-3page.pdf") {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, contentType: "application/pdf", content },
    { name: "settings", content: JSON.stringify({}) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/pdf/pdf-to-text",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

/** Build a one-page PDF whose only content is a rendered image, so it has no
 *  text layer (the shape of a scanned document). Uses the same PyMuPDF that
 *  gates this suite. */
function makeImageOnlyPdf(): Buffer {
  const dir = mkdtempSync(join(tmpdir(), "pdf-scan-"));
  const out = join(dir, "scanned.pdf");
  const script = [
    "import sys, fitz",
    "d = fitz.open(); p = d.new_page()",
    "tmp = fitz.open(); tp = tmp.new_page(); tp.insert_text((50, 50), 'SCANNED PAGE')",
    "pix = tp.get_pixmap(dpi=100); tmp.close()",
    "p.insert_image(p.rect, pixmap=pix)",
    "d.save(sys.argv[-1]); d.close()",
  ].join("\n");
  const res = spawnSync(pythonBin as string, ["-c", script, out], { encoding: "utf8" });
  if (res.status !== 0) throw new Error(`could not build image-only PDF: ${res.stderr}`);
  return readFileSync(out);
}

const FONT_TEXT = "Hello world 2026. The quick brown fox jumps over the lazy dog.";

type FontPdfKind =
  | "type0"
  | "type0-no-tounicode"
  | "type0-cid-is-unicode"
  | "type0-inline"
  | "type0-inline-no-tounicode"
  | "type0-identity-name"
  | "type0-identity-name-mixed"
  | "type0-identity-name-plus-cid-is-unicode"
  | "type0-identity-stream"
  | "type0-identity-name-plus-type3"
  | "type0-identity-name-plus-type3-codes"
  | "simple-unmapped-names";

/** Build a one-page PDF of FONT_TEXT in one of these font shapes:
 *  - "type0": Roboto embedded as a composite (Type0, Identity-H) font, as
 *    PyMuPDF writes it, with its ToUnicode map intact.
 *  - "type0-no-tounicode": the same with ToUnicode removed, so MuPDF cannot map
 *    any glyph and PyMuPDF substitutes glyph ids ("Hello" becomes ",IPPS", #955).
 *  - "type0-cid-is-unicode": no ToUnicode either, but the CIDs are Unicode and a
 *    CIDToGIDMap stream turns them into glyphs (the tFPDF and TCPDF shape).
 *    PyMuPDF's CID fallback then yields the right text.
 *  - "type0-inline": the mapped Type0 font dict written inline in the page
 *    resources, which get_fonts reports as xref 0.
 *  - "type0-inline-no-tounicode": the same inline dict with ToUnicode removed,
 *    so it extracts as glyph ids like "type0-no-tounicode" (#1566).
 *  - "type0-identity-name": ToUnicode written as the name /Identity-H instead
 *    of a stream. MuPDF takes it as an identity map, so the glyph ids come back
 *    as if they were Unicode, with no U+FFFD to catch (#1566 case 2).
 *  - "type0-identity-name-mixed": the same, plus a second line in Helvetica
 *    that reads fine.
 *  - "type0-identity-name-plus-cid-is-unicode": the same, plus a second line
 *    in Montserrat in the "type0-cid-is-unicode" shape, which only reads right
 *    through MuPDF's CID fallback. Set smaller because Montserrat Black at 12pt
 *    runs past the page edge.
 *  - "type0-identity-stream": ToUnicode is a real stream, but one that maps
 *    every code to itself, so the glyph ids come back as text just like the
 *    /Identity-H name (#1754).
 *  - "type0-identity-name-plus-type3": the /Identity-H line plus a line in a
 *    hand-built Type3 font. MuPDF reports a Type3 glyph as its character code,
 *    so that readable line also has Unicode equal to its glyph ids.
 *  - "type0-identity-name-plus-type3-codes": the same, but the Type3 line is
 *    drawn with control codes, so it reads as nothing.
 *  - "simple-unmapped-names": base-14 Helvetica re-encoded with glyph names
 *    nothing can map. MuPDF falls back to the character code for simple fonts,
 *    and these codes are ASCII, so the text still extracts correctly.
 *  Roboto comes from the repo's own font directory (Apache-2.0), so no font
 *  file has to exist on the host and no binary fixture needs committing. */
function makeFontPdf(kind: FontPdfKind): Buffer {
  const dir = mkdtempSync(join(tmpdir(), "pdf-font-"));
  const out = join(dir, `${kind}.pdf`);
  const font = join(process.cwd(), "apps", "api", "static", "fonts", "Roboto-Black.ttf");
  const script = [
    "import re, sys, fitz",
    "kind, font, text, out = sys.argv[-4:]",
    "d = fitz.open(); p = d.new_page()",
    "if kind == 'simple-unmapped-names':",
    "    p.insert_text((72, 72), text, fontname='helv', fontsize=12)",
    "else:",
    "    p.insert_text((72, 72), text, fontname='rob', fontfile=font, fontsize=12)",
    "if kind == 'type0-identity-name-mixed':",
    "    p.insert_text((72, 120), text, fontname='helv', fontsize=12)",
    "IDENTITY_CMAP = b'1 begincodespacerange\\n<0000> <FFFF>\\nendcodespacerange\\n1 beginbfrange\\n<0000> <FFFF> <0000>\\nendbfrange\\n'",
    "def add_type3(codes):",
    "    proc = d.get_new_xref(); d.update_object(proc, '<<>>')",
    "    d.update_stream(proc, b'600 0 0 0 500 700 d1 0 0 500 700 re f')",
    "    used = sorted(set(codes))",
    "    procs = ' '.join('/g%d %d 0 R' % (c, proc) for c in used)",
    "    diffs = ' '.join('%d /g%d' % (c, c) for c in used)",
    "    t3 = d.get_new_xref()",
    "    d.update_object(t3, '<</Type/Font/Subtype/Type3/FontBBox[0 0 600 700]/FontMatrix[0.001 0 0 0.001 0 0]/CharProcs<<%s>>/Encoding<</Type/Encoding/Differences[%s]>>/FirstChar 1/LastChar 126/Widths[%s]>>' % (procs, diffs, ' '.join(['600'] * 126)))",
    "    resources = int(d.xref_get_key(p.xref, 'Resources')[1].split()[0])",
    "    d.xref_set_key(resources, 'Font/T3', '%d 0 R' % t3)",
    "    content = d.get_new_xref(); d.update_object(content, '<<>>')",
    "    d.update_stream(content, ('BT /T3 9 Tf 72 150 Td <%s> Tj ET' % ''.join('%02x' % c for c in codes)).encode('latin1'))",
    "    d.xref_set_key(p.xref, 'Contents', '[%s]' % ' '.join('%d 0 R' % x for x in p.get_contents() + [content]))",
    "if kind == 'type0-identity-stream':",
    "    for xref, _ext, ftype, *_ in p.get_fonts():",
    "        if ftype == 'Type0':",
    "            d.update_stream(int(d.xref_get_key(xref, 'ToUnicode')[1].split()[0]), IDENTITY_CMAP)",
    "if kind.startswith('type0-identity-name-plus-type3'):",
    "    for xref, _ext, ftype, *_ in p.get_fonts():",
    "        if ftype == 'Type0':",
    "            d.xref_set_key(xref, 'ToUnicode', '/Identity-H')",
    "    add_type3([ord(ch) for ch in text] if kind == 'type0-identity-name-plus-type3' else list(range(1, 20)))",
    "mont = font.replace('Roboto-Black', 'Montserrat-Black')",
    "if kind == 'type0-identity-name-plus-cid-is-unicode':",
    "    p.insert_text((72, 120), text, fontname='mont', fontfile=mont, fontsize=9)",
    "    fonts = {r[4]: r[0] for r in p.get_fonts() if r[2] == 'Type0'}",
    "    d.xref_set_key(fonts['rob'], 'ToUnicode', '/Identity-H')",
    "    d.xref_set_key(fonts['mont'], 'ToUnicode', 'null')",
    "    cid_font = int(d.xref_get_key(fonts['mont'], 'DescendantFonts')[1].strip('[]').split()[0])",
    "    glyphs = fitz.Font(fontfile=mont); table = bytearray(2 * 0x80)",
    "    for ch in set(text):",
    "        gid = glyphs.has_glyph(ord(ch))",
    "        table[2 * ord(ch)] = gid >> 8; table[2 * ord(ch) + 1] = gid & 0xFF",
    "    stream = d.get_new_xref(); d.update_object(stream, '<<>>')",
    "    d.update_stream(stream, bytes(table))",
    "    d.xref_set_key(cid_font, 'CIDToGIDMap', '%d 0 R' % stream)",
    "    content = p.get_contents()[-1]",
    "    cids = '<%s>' % ''.join('%04x' % ord(ch) for ch in text)",
    "    drawn = d.xref_stream(content).decode('latin1')",
    "    d.update_stream(content, re.sub(r'<[0-9a-fA-F]+>', cids, drawn, count=1).encode('latin1'))",
    "for xref, _ext, ftype, *_ in p.get_fonts():",
    "    if kind in ('type0-no-tounicode', 'type0-cid-is-unicode', 'type0-inline-no-tounicode') and ftype == 'Type0':",
    "        d.xref_set_key(xref, 'ToUnicode', 'null')",
    "    if kind in ('type0-identity-name', 'type0-identity-name-mixed') and ftype == 'Type0':",
    "        d.xref_set_key(xref, 'ToUnicode', '/Identity-H')",
    "    if kind == 'type0-cid-is-unicode' and ftype == 'Type0':",
    "        cid_font = int(d.xref_get_key(xref, 'DescendantFonts')[1].strip('[]').split()[0])",
    "        glyphs = fitz.Font(fontfile=font); table = bytearray(2 * 0x80)",
    "        for ch in set(text):",
    "            gid = glyphs.has_glyph(ord(ch))",
    "            table[2 * ord(ch)] = gid >> 8; table[2 * ord(ch) + 1] = gid & 0xFF",
    "        stream = d.get_new_xref(); d.update_object(stream, '<<>>')",
    "        d.update_stream(stream, bytes(table))",
    "        d.xref_set_key(cid_font, 'CIDToGIDMap', '%d 0 R' % stream)",
    "        content = p.get_contents()[0]",
    "        cids = '<%s>' % ''.join('%04x' % ord(ch) for ch in text)",
    "        drawn = d.xref_stream(content).decode('latin1')",
    "        d.update_stream(content, re.sub(r'<[0-9a-fA-F]+>', cids, drawn, count=1).encode('latin1'))",
    "    if kind in ('type0-inline', 'type0-inline-no-tounicode') and ftype == 'Type0':",
    "        resources = int(d.xref_get_key(p.xref, 'Resources')[1].split()[0])",
    "        d.xref_set_key(resources, 'Font', '<</rob %s>>' % d.xref_object(xref, compressed=True))",
    "    if kind == 'simple-unmapped-names' and ftype == 'Type1':",
    "        names = ' '.join('/zz%d' % i for i in range(256))",
    "        d.xref_set_key(xref, 'Encoding', '<</Type/Encoding/Differences[0 %s]>>' % names)",
    "d.save(out); d.close()",
    "if kind.startswith('type0-inline'):",
    "    rows = [r for r in fitz.open(out)[0].get_fonts() if r[2] == 'Type0']",
    "    assert rows and all(r[0] == 0 for r in rows), 'font dict is not inline: %r' % rows",
  ].join("\n");
  const res = spawnSync(pythonBin as string, ["-c", script, kind, font, FONT_TEXT, out], {
    encoding: "utf8",
  });
  if (res.status !== 0) throw new Error(`could not build ${kind} PDF: ${res.stderr}`);
  return readFileSync(out);
}
async function downloadText(res: { body: string }): Promise<string> {
  const { downloadUrl } = JSON.parse(res.body);
  const dl = await testApp.app.inject({ method: "GET", url: downloadUrl });
  expect(dl.statusCode).toBe(200);
  return dl.rawPayload.toString("utf8");
}

describe.skipIf(!hasFitz)("pdf-to-text (requires PyMuPDF)", () => {
  it("extracts text and serves the .txt as UTF-8", async () => {
    const res = await runTool();
    expect(res.statusCode).toBe(200);
    const envelope = JSON.parse(res.body);
    expect(envelope.downloadUrl).toBeDefined();

    const dl = await testApp.app.inject({ method: "GET", url: envelope.downloadUrl });
    expect(dl.statusCode).toBe(200);
    // The 3-page fixture has a text layer, so the output has content.
    expect(dl.rawPayload.length).toBeGreaterThan(0);
    // Charset must be explicit so non-Latin scripts don't mojibake inline (#589).
    expect(dl.headers["content-type"]).toContain("charset=utf-8");
  }, 60_000);

  it("tells the user to run OCR when the PDF has no text layer", async () => {
    const res = await runTool(makeImageOnlyPdf(), "scanned.pdf");
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.body);
    expect(body.details).toMatch(/text layer/i);
    expect(body.details).toMatch(/OCR/);
  }, 60_000);

  it("tells the user to run OCR when a composite font has no ToUnicode map (#955)", async () => {
    const res = await runTool(makeFontPdf("type0-no-tounicode"), "glyph-ids.pdf");
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.body);
    expect(body.details).toMatch(/text layer/i);
    expect(body.details).toMatch(/OCR/);
  }, 60_000);

  it("still extracts a composite font that carries its ToUnicode map", async () => {
    const res = await runTool(makeFontPdf("type0"), "type0.pdf");
    expect(res.statusCode).toBe(200);
    expect(await downloadText(res)).toContain(FONT_TEXT);
  }, 60_000);

  it("still extracts a simple font whose glyph names are unmappable but codes are ASCII", async () => {
    // Pins why the check is limited to composite fonts: judging this page on
    // MuPDF's U+FFFD marker would 422 a PDF whose text comes out right today.
    const res = await runTool(makeFontPdf("simple-unmapped-names"), "simple.pdf");
    expect(res.statusCode).toBe(200);
    expect(await downloadText(res)).toContain(FONT_TEXT);
  }, 60_000);

  it("still extracts CID = Unicode through a CIDToGIDMap stream with no ToUnicode", async () => {
    // tFPDF and TCPDF write this shape. The CID fallback is the right text here,
    // so the glyph-id check must not send it to OCR.
    const res = await runTool(makeFontPdf("type0-cid-is-unicode"), "cid-unicode.pdf");
    expect(res.statusCode).toBe(200);
    expect(await downloadText(res)).toContain(FONT_TEXT);
  }, 60_000);

  it("tells the user to run OCR when an inline composite font has no ToUnicode map (#1566)", async () => {
    const res = await runTool(makeFontPdf("type0-inline-no-tounicode"), "inline-glyph-ids.pdf");
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.body);
    expect(body.details).toMatch(/text layer/i);
    expect(body.details).toMatch(/OCR/);
  }, 60_000);

  it("tells the user to run OCR when ToUnicode is the name /Identity-H (#1566)", async () => {
    // MuPDF honours the name as an identity map, so unlike #955 there's no
    // U+FFFD to judge by: the glyph ids come back as ordinary letters.
    const res = await runTool(makeFontPdf("type0-identity-name"), "identity-name.pdf");
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.body);
    expect(body.details).toMatch(/text layer/i);
    expect(body.details).toMatch(/OCR/);
  }, 60_000);

  it("still extracts a page whose other text reads fine next to an /Identity-H line", async () => {
    const res = await runTool(makeFontPdf("type0-identity-name-mixed"), "identity-mixed.pdf");
    expect(res.statusCode).toBe(200);
    expect(await downloadText(res)).toContain(FONT_TEXT);
  }, 60_000);

  it("still extracts CID = Unicode text next to an /Identity-H line", async () => {
    // Pins why the verdict reads the rest of the page with MuPDF's CID
    // fallback: without it this line judges as U+FFFD and a PDF that reads
    // fine today would be sent to OCR.
    const res = await runTool(
      makeFontPdf("type0-identity-name-plus-cid-is-unicode"),
      "identity-cid-unicode.pdf",
    );
    expect(res.statusCode).toBe(200);
    expect(await downloadText(res)).toContain(FONT_TEXT);
  }, 60_000);

  it("tells the user to run OCR when ToUnicode is a stream mapping every code to itself (#1754)", async () => {
    const res = await runTool(makeFontPdf("type0-identity-stream"), "identity-stream.pdf");
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.body);
    expect(body.details).toMatch(/text layer/i);
    expect(body.details).toMatch(/OCR/);
  }, 60_000);

  it("still extracts a page whose Type3 text reads fine next to an /Identity-H line (#1754)", async () => {
    const res = await runTool(makeFontPdf("type0-identity-name-plus-type3"), "identity-type3.pdf");
    expect(res.statusCode).toBe(200);
    expect(await downloadText(res)).toContain(FONT_TEXT);
  }, 60_000);

  it("tells the user to run OCR when the only other text is a Type3 line of control codes (#1754)", async () => {
    // Before #1754 any Type3 font switched the check off, so the soup counted
    // as readable here.
    const res = await runTool(
      makeFontPdf("type0-identity-name-plus-type3-codes"),
      "identity-type3-codes.pdf",
    );
    expect(res.statusCode).toBe(422);
  }, 60_000);

  it("still extracts a composite font whose dict is written inline", async () => {
    // get_fonts reports an inline dict as xref 0; reading its keys would raise
    // and fail the whole extraction.
    const res = await runTool(makeFontPdf("type0-inline"), "inline.pdf");
    expect(res.statusCode).toBe(200);
    expect(await downloadText(res)).toContain(FONT_TEXT);
  }, 60_000);
});
