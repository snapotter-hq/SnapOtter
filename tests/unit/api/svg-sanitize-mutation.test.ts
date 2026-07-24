import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";

// Same config mock as svg-sanitize.test.ts: a fixed 10MB SVG cap so the size /
// element-count guards are deterministic under the container-free mutation lane.
vi.mock("../../../apps/api/src/config.js", () => ({
  env: { MAX_SVG_SIZE_MB: 10 },
}));

import { decompressSvgz, sanitizeSvg } from "../../../apps/api/src/lib/svg-sanitize.js";

// Helper: run the real sanitizer and return the UTF-8 output string.
function clean(svg: string): string {
  return sanitizeSvg(Buffer.from(svg)).toString("utf-8");
}

// Every payload embeds a benign `<rect id="keep"/>` sibling. Asserting the
// sibling survives proves the regex mutant that would over-strip (or that the
// removal ran at all) is not silently eating valid markup, and asserting the
// dangerous construct is ABSENT proves the ORIGINAL regex stripped something a
// mutated (case-flag-dropped, anchor-flipped, char-class-narrowed) variant
// would let through.
const KEEP = '<rect id="keep"/>';
function expectKept(out: string): void {
  expect(out).toContain(KEEP);
}

describe("sanitizeSvg mutation kills: <script> element", () => {
  it("removes a plain <script> block and its body", () => {
    const out = clean(`<svg><script>alert("xss")</script>${KEEP}</svg>`);
    expect(out).not.toContain("<script");
    expect(out).not.toContain("</script");
    expect(out).not.toContain("alert");
    expectKept(out);
  });

  it("removes <script> case-insensitively (uppercase)", () => {
    const out = clean(`<svg><SCRIPT>alert(1)</SCRIPT>${KEEP}</svg>`);
    expect(out.toLowerCase()).not.toContain("<script");
    expect(out).not.toContain("alert");
    expectKept(out);
  });

  it("removes <script> case-insensitively (mixed case)", () => {
    const out = clean(`<svg><ScRiPt>alert(1)</ScRiPt>${KEEP}</svg>`);
    expect(out.toLowerCase()).not.toContain("<script");
    expect(out).not.toContain("alert");
    expectKept(out);
  });

  it("removes <script> with attributes on the open tag", () => {
    const out = clean(
      `<svg><script type="text/javascript" src="evil.js">alert(1)</script>${KEEP}</svg>`,
    );
    expect(out).not.toContain("<script");
    expect(out).not.toContain("evil.js");
    expect(out).not.toContain("alert");
    expectKept(out);
  });

  it("removes <script> with a whitespace-tolerant end tag", () => {
    const out = clean(`<svg><script>alert(1)</script >${KEEP}</svg>`);
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert");
    expectKept(out);
  });

  it("removes a residual open <script> tag with no close (open-tag pattern)", () => {
    const out = clean(`<svg><script src="evil.js">${KEEP}</svg>`);
    expect(out).not.toContain("<script");
    expect(out).not.toContain("evil.js");
    expectKept(out);
  });

  it("removes a residual closing </script> tag with no open", () => {
    const out = clean(`<svg>text</script>${KEEP}</svg>`);
    expect(out).not.toContain("</script");
    expectKept(out);
  });
});

describe("sanitizeSvg mutation kills: stripUntilStable (nested/overlapping tags)", () => {
  it("fully removes a nested <scr<script></script>ipt> payload (one pass is not enough)", () => {
    // After the first removal of the inner <script></script>, the outer
    // <script> re-forms; a single pass would leave `<script>`. The loop must
    // repeat until stable.
    const out = clean(`<svg><scr<script></script>ipt>bad</script>${KEEP}</svg>`);
    expect(out).not.toContain("<script");
    expect(out).not.toContain("</script");
    expectKept(out);
  });

  it("neutralizes an event handler exposed only after an inner <script> is stripped", () => {
    // `on<script>load="x()"` -> stripping <script> reveals `onload="x()"`,
    // which the handler pass then removes. Kills the stripUntilStable loop AND
    // proves the handler pass runs after tag stripping.
    const out = clean(`<svg><rect on<script>load="steal()"/>${KEEP}</svg>`);
    expect(out).not.toContain("<script");
    expect(out).not.toContain("onload");
    expect(out).not.toContain("steal");
    expectKept(out);
  });
});

describe("sanitizeSvg mutation kills: event-handler attributes", () => {
  it("removes onload= (quoted)", () => {
    const out = clean(`<svg onload="alert(1)">${KEEP}</svg>`);
    expect(out).not.toContain("onload");
    expect(out).not.toContain("alert");
    expect(out).toContain('data-removed=""');
    expectKept(out);
  });

  it("removes onclick= and onerror= together", () => {
    const out = clean(`<svg><rect onclick="steal()" onerror="hack()"/>${KEEP}</svg>`);
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("steal");
    expect(out).not.toContain("hack");
    expectKept(out);
  });

  it("removes onmouseover=", () => {
    const out = clean(`<svg><rect onmouseover="evil()"/>${KEEP}</svg>`);
    expect(out).not.toContain("onmouseover");
    expect(out).not.toContain("evil");
    expectKept(out);
  });

  it("removes an unquoted event-handler value (second on* pattern)", () => {
    // `onerror=alert(1)` with no quotes is caught by the `\bon\w+\s*=\s*\S+`
    // pass, not the quoted one. Kills mutants that drop the unquoted variant.
    const out = clean(`<svg><rect onerror=alert(1) id="keep"/></svg>`);
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("alert");
    expect(out).toContain('id="keep"');
  });

  it("removes event handlers case-insensitively (ONLOAD)", () => {
    const out = clean(`<svg ONLOAD="alert(1)">${KEEP}</svg>`);
    expect(out.toLowerCase()).not.toContain("onload");
    expect(out).not.toContain("alert");
    expectKept(out);
  });

  it("removes on* with whitespace around the equals sign", () => {
    const out = clean(`<svg><rect onload = "alert(1)"/>${KEEP}</svg>`);
    expect(out).not.toContain("onload");
    expect(out).not.toContain("alert");
    expectKept(out);
  });
});

describe("sanitizeSvg mutation kills: dangerous URI schemes in href/xlink:href", () => {
  it("neutralizes javascript: in href", () => {
    const out = clean(`<svg><a href="javascript:alert(1)"><text>c</text></a>${KEEP}</svg>`);
    expect(out).not.toContain("javascript:");
    expect(out).toContain('href="data:,');
    expectKept(out);
  });

  it("neutralizes javascript: in xlink:href (prefix preserved)", () => {
    const out = clean(`<svg><a xlink:href="javascript:alert(1)"><text>c</text></a>${KEEP}</svg>`);
    expect(out).not.toContain("javascript:");
    expect(out).toContain('xlink:href="data:,');
    expectKept(out);
  });

  it("neutralizes JavaScript: case-insensitively", () => {
    const out = clean(`<svg><a href="JavaScript:alert(1)"><text>c</text></a>${KEEP}</svg>`);
    expect(out.toLowerCase()).not.toContain("javascript:");
    expectKept(out);
  });

  it("neutralizes javascript: with leading whitespace before the scheme", () => {
    // Browsers trim leading whitespace; the regex tolerates it. A mutant that
    // drops the `\s*` would leave `  javascript:` intact.
    const out = clean(`<svg><a href="  javascript:alert(1)"><text>c</text></a>${KEEP}</svg>`);
    expect(out).not.toContain("javascript:");
    expectKept(out);
  });

  it("neutralizes data:text/html in href (whole scheme, not just data:)", () => {
    const out = clean(`<svg><a href="data:text/html,<b>x</b>"><text>c</text></a>${KEEP}</svg>`);
    expect(out).not.toContain("data:text/html");
    expect(out).toContain('href="data:,');
    expectKept(out);
  });

  it("neutralizes file: in href", () => {
    const out = clean(`<svg><image href="file:///etc/passwd"/>${KEEP}</svg>`);
    expect(out).not.toContain("file:///etc/passwd");
    expect(out).not.toContain("file:");
    expectKept(out);
  });

  it("neutralizes an http: scheme in href", () => {
    const out = clean(`<svg><image href="http://evil.com/track.png"/>${KEEP}</svg>`);
    expect(out).not.toContain("http://evil.com");
    expect(out).not.toContain('href="http');
    expectKept(out);
  });

  it("preserves a safe fragment href (#icon) and a relative href", () => {
    // Proves the scheme regex is NOT over-broad. Kills mutants that widen the
    // alternation to swallow any href.
    const out = clean('<svg><use href="#icon"/><image href="local.png"/><rect id="keep"/></svg>');
    expect(out).toContain('href="#icon"');
    expect(out).toContain('href="local.png"');
    expect(out).toContain('id="keep"');
  });
});

describe("sanitizeSvg mutation kills: entity-encoded scheme obfuscation (decodeNumericEntities)", () => {
  it("decodes a decimal entity that forms javascript: then neutralizes it", () => {
    // &#106; -> 'j'. Kills the decimal-entity decode regex: without decoding,
    // the scheme reads `&#106;avascript:` and the URI pass never sees it.
    const out = clean(`<svg><a href="&#106;avascript:alert(1)"><text>c</text></a>${KEEP}</svg>`);
    expect(out).not.toContain("&#106;");
    expect(out).not.toContain("javascript:");
    expect(out).toContain('href="data:,');
    expectKept(out);
  });

  it("decodes a hex entity that forms javascript: then neutralizes it", () => {
    // &#x6a; -> 'j'. Kills the hex-entity decode regex.
    const out = clean(`<svg><a href="&#x6a;avascript:alert(1)"><text>c</text></a>${KEEP}</svg>`);
    expect(out).not.toContain("&#x6a;");
    expect(out).not.toContain("javascript:");
    expect(out).toContain('href="data:,');
    expectKept(out);
  });

  it("decodes a hex entity case-insensitively (&#x6A;)", () => {
    // Uppercase hex digits exercise the [0-9a-fA-F] class in the decode regex.
    const out = clean(`<svg><a href="&#x6A;avascript:alert(1)"><text>c</text></a>${KEEP}</svg>`);
    expect(out).not.toContain("&#x6A;");
    expect(out).not.toContain("javascript:");
    expectKept(out);
  });

  it("decodes a fully hex-entity-encoded javascript scheme", () => {
    const enc = "&#x6a;&#x61;&#x76;&#x61;&#x73;&#x63;&#x72;&#x69;&#x70;&#x74;:";
    const out = clean(`<svg><a href="${enc}alert(1)"><text>c</text></a>${KEEP}</svg>`);
    expect(out).not.toContain("&#x");
    expect(out).not.toContain("javascript:");
    expect(out).toContain('href="data:,');
    expectKept(out);
  });

  it("decodes a decimal entity that forms data:", () => {
    // &#100; -> 'd'.
    const out = clean(`<svg><a href="&#100;ata:text/html,x"><text>c</text></a>${KEEP}</svg>`);
    expect(out).not.toContain("&#100;");
    expect(out).not.toContain("data:text/html");
    expectKept(out);
  });

  it("decodes decimal entities in a benign text node (decode is global, not href-scoped)", () => {
    // &#65;&#66;&#67; -> ABC. This kills the decimal decode regex INDEPENDENTLY
    // of any URI pass: the only thing that turns the entities into "ABC" is the
    // decode replace, so a mutated decode regex leaves the raw entities.
    const out = clean(`<svg><text>&#65;&#66;&#67;</text>${KEEP}</svg>`);
    expect(out).toContain("ABC");
    expect(out).not.toContain("&#65;");
    expectKept(out);
  });

  it("decodes a stray decimal entity to its character (junk)", () => {
    const out = clean('<svg><rect id="keep" data-x="&#106;unk"/></svg>');
    expect(out).toContain("junk");
    expect(out).not.toContain("&#106;");
  });
});

describe("sanitizeSvg mutation kills: control-char / whitespace obfuscation in href", () => {
  it("strips a TAB inside a java\\tscript: href and neutralizes the scheme", () => {
    const out = clean(`<svg><a href="java\tscript:alert(1)"><text>c</text></a>${KEEP}</svg>`);
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("java\tscript");
    expect(out).toContain('href="data:,');
    expectKept(out);
  });

  it("strips a NEWLINE inside a java\\nscript: href and neutralizes the scheme", () => {
    const out = clean(`<svg><a href="java\nscript:alert(1)"><text>c</text></a>${KEEP}</svg>`);
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("java\nscript");
    expectKept(out);
  });

  it("strips a NULL byte inside a java\\x00script: href", () => {
    const out = clean(`<svg><a href="java\x00script:alert(1)"><text>c</text></a>${KEEP}</svg>`);
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("\x00");
    expectKept(out);
  });
});

describe("sanitizeSvg mutation kills: <use> with external reference", () => {
  it("removes <use> with an https href", () => {
    const out = clean(`<svg><use href="https://evil.com/x.svg#i"/>${KEEP}</svg>`);
    expect(out).not.toContain("<use");
    expect(out).not.toContain("https://evil.com");
    expectKept(out);
  });

  it("removes <use> with an http xlink:href", () => {
    const out = clean(`<svg><use xlink:href="http://evil.com/x.svg#i"/>${KEEP}</svg>`);
    expect(out).not.toContain("<use");
    expect(out).not.toContain("http://evil.com");
    expectKept(out);
  });

  it("removes <use> when the external href is preceded by other attributes", () => {
    const out = clean(`<svg><use x="0" href="https://evil.com/x#i" y="0"/>${KEEP}</svg>`);
    expect(out).not.toContain("<use");
    expect(out).not.toContain("https://evil.com");
    expectKept(out);
  });
});

describe("sanitizeSvg mutation kills: <feImage> external reference (SSRF via filter)", () => {
  it("removes <feImage> with an https href", () => {
    const out = clean(`<svg><feImage href="https://evil.com/x.png"/>${KEEP}</svg>`);
    expect(out).not.toContain("<feImage");
    expect(out).not.toContain("https://evil.com");
    expectKept(out);
  });

  it("removes <feImage> with an http xlink:href", () => {
    const out = clean(`<svg><feImage xlink:href="http://evil.com/x.png"/>${KEEP}</svg>`);
    expect(out).not.toContain("<feImage");
    expect(out).not.toContain("http://evil.com");
    expectKept(out);
  });

  it("removes <feImage> with a file: href", () => {
    const out = clean(`<svg><feImage href="file:///etc/passwd"/>${KEEP}</svg>`);
    expect(out).not.toContain("<feImage");
    expect(out).not.toContain("file:///etc/passwd");
    expectKept(out);
  });

  it("removes <feImage> with a data: href", () => {
    const out = clean(`<svg><feImage href="data:image/svg+xml,evil"/>${KEEP}</svg>`);
    expect(out).not.toContain("<feImage");
    expect(out).not.toContain("data:image/svg+xml");
    expectKept(out);
  });

  it("removes <feImage> when the external href is preceded by other attributes", () => {
    const out = clean(
      `<svg><feImage x="0" href="https://evil.com/x.png" width="10"/>${KEEP}</svg>`,
    );
    expect(out).not.toContain("<feImage");
    expect(out).not.toContain("https://evil.com");
    expectKept(out);
  });
});

describe("sanitizeSvg mutation kills: HTML-embedding elements", () => {
  it("removes <foreignObject> and its body", () => {
    const out = clean(`<svg><foreignObject><body>evil</body></foreignObject>${KEEP}</svg>`);
    expect(out).not.toContain("foreignObject");
    expect(out).not.toContain("evil");
    expectKept(out);
  });

  it("removes <foreignObject> case-insensitively", () => {
    const out = clean(`<svg><FOREIGNOBJECT>x</FOREIGNOBJECT>${KEEP}</svg>`);
    expect(out.toLowerCase()).not.toContain("foreignobject");
    expectKept(out);
  });

  it("removes <iframe>", () => {
    const out = clean(`<svg><iframe src="http://evil.com"></iframe>${KEEP}</svg>`);
    expect(out).not.toContain("<iframe");
    expect(out).not.toContain("evil.com");
    expectKept(out);
  });

  it("removes <embed>", () => {
    const out = clean(`<svg><embed src="http://evil.com"/>${KEEP}</svg>`);
    expect(out).not.toContain("<embed");
    expect(out).not.toContain("evil.com");
    expectKept(out);
  });
});

describe("sanitizeSvg mutation kills: SMIL / animation elements", () => {
  it("removes <set> (attribute injection at runtime)", () => {
    const out = clean(`<svg><set attributeName="href" to="javascript:alert(1)"/>${KEEP}</svg>`);
    expect(out).not.toContain("<set");
    expect(out).not.toContain("javascript:");
    expectKept(out);
  });

  it("removes <animate>", () => {
    const out = clean(`<svg><animate attributeName="href" to="x"/>${KEEP}</svg>`);
    expect(out).not.toContain("<animate");
    expectKept(out);
  });

  it("removes <animateTransform> (distinct element name)", () => {
    const out = clean(`<svg><animateTransform attributeName="transform"/>${KEEP}</svg>`);
    expect(out).not.toContain("<animateTransform");
    expectKept(out);
  });

  it("removes <animateMotion>", () => {
    const out = clean(`<svg><animateMotion/>${KEEP}</svg>`);
    expect(out).not.toContain("<animateMotion");
    expectKept(out);
  });

  it("removes <animateColor>", () => {
    const out = clean(`<svg><animateColor/>${KEEP}</svg>`);
    expect(out).not.toContain("<animateColor");
    expectKept(out);
  });

  it("removes <handler> (SVG-Tiny event handler element)", () => {
    const out = clean(`<svg><handler ev:event="load">bad</handler>${KEEP}</svg>`);
    expect(out).not.toContain("<handler");
    expect(out).not.toContain("bad");
    expectKept(out);
  });

  it("removes <mpath>", () => {
    const out = clean(`<svg><mpath xlink:href="#x"/>${KEEP}</svg>`);
    expect(out).not.toContain("<mpath");
    expectKept(out);
  });

  it("removes both <animate/> and <animateTransform/> in one document (word-boundary)", () => {
    const out = clean(`<svg><animate/><animateTransform/>${KEEP}</svg>`);
    expect(out).not.toContain("<animate");
    expectKept(out);
  });
});

describe("sanitizeSvg mutation kills: url() CSS schemes", () => {
  it("neutralizes an https url() reference", () => {
    const out = clean(`<svg><rect style="fill:url('https://evil.com/t')" id="keep"/></svg>`);
    expect(out).not.toContain("https://evil.com");
    expect(out).toContain('url("data:,');
    expect(out).toContain('id="keep"');
  });

  it("neutralizes a file: url() reference", () => {
    const out = clean(`<svg><rect style="fill:url(file:///etc/passwd)" id="keep"/></svg>`);
    expect(out).not.toContain("file:///etc/passwd");
    expect(out).toContain('url("data:,');
    expect(out).toContain('id="keep"');
  });

  it("neutralizes a data: url() reference", () => {
    const out = clean(`<svg><rect style="fill:url(data:image/png;base64,AAA)" id="keep"/></svg>`);
    expect(out).not.toContain("url(data:");
    expect(out).toContain('url("data:,');
    expect(out).toContain('id="keep"');
  });

  it("neutralizes url() case-insensitively (URL / HTTPS)", () => {
    const out = clean(`<svg><rect style="fill:URL('HTTPS://evil.com/t')" id="keep"/></svg>`);
    expect(out.toLowerCase()).not.toContain("https://evil.com");
    expect(out).toContain('id="keep"');
  });
});

describe("sanitizeSvg mutation kills: DOCTYPE / XInclude / CDATA / processing instructions", () => {
  it("removes a DOCTYPE with an internal ENTITY subset (XXE)", () => {
    const out = clean(
      `<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg><text>x</text>${KEEP}</svg>`,
    );
    expect(out).not.toContain("DOCTYPE");
    expect(out).not.toContain("ENTITY");
    expect(out).not.toContain("file:///etc/passwd");
    expectKept(out);
  });

  it("removes a DOCTYPE with an external SYSTEM DTD (no internal subset)", () => {
    const out = clean(`<!DOCTYPE svg SYSTEM "http://evil.com/x.dtd"><svg>${KEEP}</svg>`);
    expect(out).not.toContain("DOCTYPE");
    expect(out).not.toContain("evil.com");
    expectKept(out);
  });

  it("removes DOCTYPE case-insensitively (lowercase doctype)", () => {
    const out = clean(`<!doctype svg><svg>${KEEP}</svg>`);
    expect(out.toLowerCase()).not.toContain("doctype");
    expectKept(out);
  });

  it("removes XInclude elements and the xmlns:xi declaration", () => {
    const out = clean(
      `<svg xmlns:xi="http://www.w3.org/2001/XInclude"><xi:include href="file:///etc/passwd"/>${KEEP}</svg>`,
    );
    expect(out).not.toContain("xi:include");
    expect(out).not.toContain("xmlns:xi");
    expect(out).not.toContain("file:///etc/passwd");
    expectKept(out);
  });

  it("strips CDATA sections (which can hide dangerous content from later passes)", () => {
    const out = clean(
      `<svg><style><![CDATA[ .x{fill:url(https://evil.com)} ]]></style>${KEEP}</svg>`,
    );
    expect(out).not.toContain("CDATA");
    expect(out).not.toContain("evil.com");
    expectKept(out);
  });

  it("removes a non-xml processing instruction (<?php ... ?>)", () => {
    const out = clean(`<svg><?php echo "x" ?>${KEEP}</svg>`);
    expect(out).not.toContain("<?php");
    expectKept(out);
  });

  it("preserves the <?xml ... ?> declaration (negative-lookahead branch)", () => {
    // Kills the mutant that drops the `(?!xml\s)` guard and would strip the
    // legitimate XML prolog too.
    const out = clean(`<?xml version="1.0" encoding="UTF-8"?><svg>${KEEP}</svg>`);
    expect(out).toContain("<?xml");
    expectKept(out);
  });
});

describe("sanitizeSvg mutation kills: size and element-count guards", () => {
  it("throws when the element count exceeds MAX_SVG_ELEMENTS (5000)", () => {
    const many = `<svg>${"<rect/>".repeat(5001)}</svg>`;
    expect(() => sanitizeSvg(Buffer.from(many))).toThrow("maximum element count of 5000");
  });

  it("does NOT throw at 4000 elements (boundary: guard is not over-eager)", () => {
    const many = `<svg>${"<rect/>".repeat(4000)}</svg>`;
    expect(() => sanitizeSvg(Buffer.from(many))).not.toThrow();
  });

  it("throws when the buffer exceeds the configured max size", () => {
    // 10MB cap from the mock; feed 11MB.
    const big = Buffer.alloc(11 * 1024 * 1024, 0x20);
    expect(() => sanitizeSvg(big)).toThrow("SVG exceeds maximum size");
  });
});

describe("sanitizeSvg: benign content is preserved intact", () => {
  it("keeps a full valid SVG with <path>, <rect>, and <circle>", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">' +
      '<path d="M0 0 L10 10" fill="#abc"/>' +
      '<rect x="1" y="2" width="3" height="4" fill="red"/>' +
      '<circle cx="50" cy="50" r="25" fill="blue"/></svg>';
    const out = clean(svg);
    expect(out).toContain("<svg");
    expect(out).toContain('<path d="M0 0 L10 10"');
    expect(out).toContain("<rect");
    expect(out).toContain("<circle");
    expect(out).toContain('fill="red"');
    expect(out).toContain('fill="blue"');
  });
});

describe("decompressSvgz mutation kills: gzip magic and bomb guard", () => {
  it("throws on a decompression bomb over the 50MB limit", () => {
    const huge = Buffer.alloc(60 * 1024 * 1024, 0x41);
    const bomb = gzipSync(huge);
    expect(() => decompressSvgz(bomb)).toThrow();
  });

  it("decompresses a small valid svgz to its SVG content", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';
    const out = decompressSvgz(gzipSync(Buffer.from(svg)));
    expect(out.toString("utf-8")).toBe(svg);
  });

  it("returns the buffer unchanged when only the first gzip magic byte matches", () => {
    // 0x1f present but 0x8b absent: kills the mutant that drops the second-byte
    // check and would try to gunzip non-gzip data.
    const notGzip = Buffer.from([0x1f, 0x00, 0x00, 0x00]);
    expect(decompressSvgz(notGzip)).toBe(notGzip);
  });

  it("returns the buffer unchanged when only the second gzip magic byte matches", () => {
    const notGzip = Buffer.from([0x00, 0x8b, 0x00, 0x00]);
    expect(decompressSvgz(notGzip)).toBe(notGzip);
  });

  it("throws when decompressed content is not SVG", () => {
    const notSvg = gzipSync(Buffer.from("plain text, definitely not svg"));
    expect(() => decompressSvgz(notSvg)).toThrow("does not contain valid SVG");
  });
});
