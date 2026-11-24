import { createRequire } from "node:module";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../apps/api/src/config.js", () => ({
  env: { MAX_SVG_SIZE_MB: 10 },
}));

import {
  decompressSvgz,
  isSvgBuffer,
  isSvgClientError,
  isSvgzClientError,
  sanitizeSvg,
} from "../../../apps/api/src/lib/svg-sanitize.js";

// fast-xml-parser is an apps/api dependency, so resolve it from there.
const require = createRequire(path.resolve(__dirname, "../../../apps/api/package.json"));
const { XMLValidator } = require("fast-xml-parser") as typeof import("fast-xml-parser");

describe("sanitizeSvg", () => {
  it("removes DOCTYPE declarations", () => {
    const input = Buffer.from(
      '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg><rect/></svg>',
    );
    const result = sanitizeSvg(input).toString("utf-8");
    expect(result).not.toContain("DOCTYPE");
    expect(result).toContain("<svg>");
  });

  it("removes DOCTYPE with internal subset (XXE prevention)", () => {
    const input = Buffer.from(
      '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg><text>&xxe;</text></svg>',
    );
    const result = sanitizeSvg(input).toString("utf-8");
    expect(result).not.toContain("DOCTYPE");
    expect(result).not.toContain("ENTITY");
  });

  it("removes script tags", () => {
    const input = Buffer.from(
      '<svg><script>alert("xss")</script><rect width="10" height="10"/></svg>',
    );
    const result = sanitizeSvg(input).toString("utf-8");
    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert");
    expect(result).toContain("<rect");
  });

  it("removes foreignObject elements", () => {
    const input = Buffer.from("<svg><foreignObject><body>evil</body></foreignObject><rect/></svg>");
    const result = sanitizeSvg(input).toString("utf-8");
    expect(result).not.toContain("foreignObject");
    expect(result).toContain("<rect/>");
  });

  it("removes event handlers (onload, onclick, onerror)", () => {
    const input = Buffer.from(
      '<svg onload="alert(1)"><rect onclick="steal()" onerror="hack()"/></svg>',
    );
    const result = sanitizeSvg(input).toString("utf-8");
    expect(result).not.toContain("onload=");
    expect(result).not.toContain("onclick=");
    expect(result).not.toContain("onerror=");
  });

  it("blocks javascript: URIs in href", () => {
    const input = Buffer.from('<svg><a href="javascript:alert(1)"><text>click</text></a></svg>');
    const result = sanitizeSvg(input).toString("utf-8");
    expect(result).not.toContain("javascript:");
  });

  it("blocks http/https URLs in href", () => {
    const input = Buffer.from('<svg><image href="https://evil.com/track.png"/></svg>');
    const result = sanitizeSvg(input).toString("utf-8");
    expect(result).not.toContain("https://evil.com");
  });

  it("blocks http/https URLs in xlink:href", () => {
    const input = Buffer.from('<svg><use xlink:href="http://evil.com/sprite.svg#icon"/></svg>');
    const result = sanitizeSvg(input).toString("utf-8");
    expect(result).not.toContain("http://evil.com");
  });

  it("blocks data:text/html URIs", () => {
    const input = Buffer.from(
      '<svg><a href="data:text/html,<script>alert(1)</script>"><text>x</text></a></svg>',
    );
    const result = sanitizeSvg(input).toString("utf-8");
    expect(result).not.toContain("data:text/html");
  });

  it("blocks file: URIs", () => {
    const input = Buffer.from('<svg><image href="file:///etc/passwd"/></svg>');
    const result = sanitizeSvg(input).toString("utf-8");
    expect(result).not.toContain("file:///etc/passwd");
  });

  it("blocks external url() references", () => {
    const input = Buffer.from("<svg><rect style=\"fill: url('https://evil.com/track')\"/></svg>");
    const result = sanitizeSvg(input).toString("utf-8");
    expect(result).not.toContain("https://evil.com");
  });

  it("blocks file: url() references", () => {
    const input = Buffer.from('<svg><rect style="fill: url(file:///etc/passwd)"/></svg>');
    const result = sanitizeSvg(input).toString("utf-8");
    expect(result).not.toContain("file:///etc/passwd");
  });

  it("removes XInclude elements", () => {
    const input = Buffer.from(
      '<svg xmlns:xi="http://www.w3.org/2001/XInclude"><xi:include href="file:///etc/passwd"/></svg>',
    );
    const result = sanitizeSvg(input).toString("utf-8");
    expect(result).not.toContain("xi:include");
  });

  it("preserves valid SVG content", () => {
    const input = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect x="0" y="0" width="100" height="100" fill="red"/><circle cx="50" cy="50" r="25" fill="blue"/></svg>',
    );
    const result = sanitizeSvg(input).toString("utf-8");
    expect(result).toContain("<svg");
    expect(result).toContain("<rect");
    expect(result).toContain("<circle");
    expect(result).toContain('fill="red"');
    expect(result).toContain('fill="blue"');
  });

  it("throws on oversized SVG", async () => {
    const configMod = await import("../../../apps/api/src/config.js");
    const saved = configMod.env.MAX_SVG_SIZE_MB;
    configMod.env.MAX_SVG_SIZE_MB = 0.000001;
    try {
      const input = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');
      expect(() => sanitizeSvg(input)).toThrow("SVG exceeds maximum size");
    } finally {
      configMod.env.MAX_SVG_SIZE_MB = saved;
    }
  });

  it("does NOT remove xml processing instruction", () => {
    const input = Buffer.from('<?xml version="1.0" encoding="UTF-8"?><svg><rect/></svg>');
    const result = sanitizeSvg(input).toString("utf-8");
    expect(result).toContain("<?xml");
  });
});

describe("decompressSvgz", () => {
  it("returns non-gzipped buffer unchanged", () => {
    const input = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');
    const result = decompressSvgz(input);
    expect(result).toBe(input);
  });

  it("decompresses valid SVGZ content", () => {
    const svgContent =
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';
    const compressed = gzipSync(Buffer.from(svgContent));
    const result = decompressSvgz(compressed);
    expect(result.toString("utf-8")).toBe(svgContent);
  });

  it("throws on decompressed content that is not SVG", () => {
    const notSvg = gzipSync(Buffer.from("this is just plain text, not SVG at all"));
    expect(() => decompressSvgz(notSvg)).toThrow("does not contain valid SVG");
  });

  it("returns short buffer unchanged (less than 2 bytes)", () => {
    const tiny = Buffer.from([0x42]);
    expect(decompressSvgz(tiny)).toBe(tiny);
  });

  it("returns buffer unchanged when first bytes do not match gzip magic", () => {
    const notGzip = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    expect(decompressSvgz(notGzip)).toBe(notGzip);
  });
});

describe("isSvgBuffer", () => {
  it("returns true for buffer starting with <svg", () => {
    const input = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(isSvgBuffer(input)).toBe(true);
  });

  it("returns true for buffer starting with <?xml followed by <svg", () => {
    const input = Buffer.from('<?xml version="1.0"?><svg><rect/></svg>');
    expect(isSvgBuffer(input)).toBe(true);
  });

  it("returns false for PNG buffer", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(isSvgBuffer(png)).toBe(false);
  });

  it("returns false for empty buffer", () => {
    expect(isSvgBuffer(Buffer.alloc(0))).toBe(false);
  });

  it("returns false for plain text buffer", () => {
    const text = Buffer.from("Hello, this is not an SVG file");
    expect(isSvgBuffer(text)).toBe(false);
  });

  it("returns true for SVG with leading whitespace", () => {
    const input = Buffer.from('  \n  <svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(isSvgBuffer(input)).toBe(true);
  });

  it("returns true for <?xml with leading whitespace before <svg", () => {
    const input = Buffer.from('<?xml version="1.0"?>\n<svg><rect/></svg>');
    expect(isSvgBuffer(input)).toBe(true);
  });
});
describe("sanitizeSvg: namespace-prefixed element names", () => {
  it("removes an XHTML-namespaced <x:script> element and its body", () => {
    const input = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:x="http://www.w3.org/1999/xhtml">' +
        "<x:script>alert('XSS-NAMESPACE')</x:script><rect/></svg>",
    );
    const result = sanitizeSvg(input).toString("utf-8");
    expect(result).not.toMatch(/<\/?x:script/i);
    expect(result).not.toContain("alert");
    expect(result).toContain("<rect/>");
  });

  it("removes an svg-prefixed <svg:script> element", () => {
    const input = Buffer.from(
      '<svg:svg xmlns:svg="http://www.w3.org/2000/svg">' +
        "<svg:script>alert(1)</svg:script><svg:rect/></svg:svg>",
    );
    const result = sanitizeSvg(input).toString("utf-8");
    expect(result).not.toMatch(/<\/?svg:script/i);
    expect(result).not.toContain("alert");
    expect(result).toContain("<svg:rect/>");
  });

  it("removes a prefixed <svg:foreignObject> element", () => {
    const input = Buffer.from(
      '<svg:svg xmlns:svg="http://www.w3.org/2000/svg">' +
        "<svg:foreignObject><body>evil</body></svg:foreignObject><svg:rect/></svg:svg>",
    );
    const result = sanitizeSvg(input).toString("utf-8");
    expect(result).not.toContain("foreignObject");
    expect(result).toContain("<svg:rect/>");
  });

  it("removes a prefixed <x:iframe> element", () => {
    const input = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:x="http://www.w3.org/1999/xhtml">' +
        '<x:iframe src="javascript:alert(1)"></x:iframe><rect/></svg>',
    );
    const result = sanitizeSvg(input).toString("utf-8");
    expect(result).not.toMatch(/<\/?x:iframe/i);
    expect(result).toContain("<rect/>");
  });

  // The strip loop applies the prefix independently to open and close tags, so
  // a payload whose open and close prefixes disagree (a DOMPurify-style
  // mutation) is still removed.
  it("removes a script whose open and close tags use different prefixes", () => {
    const openOnly = sanitizeSvg(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><x:script>alert(1)</script><rect/></svg>',
      ),
    ).toString("utf-8");
    expect(openOnly).not.toContain("alert");
    expect(openOnly).not.toMatch(/<x:script|<\/script/i);
    expect(openOnly).toContain("<rect/>");

    const closeOnly = sanitizeSvg(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</x:script><rect/></svg>',
      ),
    ).toString("utf-8");
    expect(closeOnly).not.toContain("alert");
    expect(closeOnly).not.toMatch(/<script|<\/x:script/i);
    expect(closeOnly).toContain("<rect/>");
  });
});

describe("sanitizeSvg: DOCTYPE removal skips quoted strings", () => {
  it("still removes the whole DOCTYPE when an entity value contains ]", () => {
    const input = Buffer.from(
      '<!DOCTYPE svg [<!ENTITY z "]"><!ENTITY s "&#38;#60;script&#38;#62;alert(1)&#38;#60;/script&#38;#62;">]>' +
        '<svg xmlns="http://www.w3.org/2000/svg">&s;<rect/></svg>',
    );
    const result = sanitizeSvg(input).toString("utf-8");
    expect(result).not.toContain("DOCTYPE");
    expect(result).not.toContain("ENTITY");
    expect(result).not.toContain("alert");
    expect(result).toContain("<rect/>");
  });

  it("removes a DOCTYPE whose quoted external id contains a > character", () => {
    const input = Buffer.from(
      '<!DOCTYPE svg SYSTEM "http://example.com/a>b.dtd">' +
        '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>',
    );
    const result = sanitizeSvg(input).toString("utf-8");
    expect(result).not.toContain("DOCTYPE");
    expect(result).not.toContain("example.com");
    expect(result).toContain("<rect/>");
  });

  it("removes a DOCTYPE using single-quoted values", () => {
    const input = Buffer.from(
      "<!DOCTYPE svg [<!ENTITY z ']'>]>" + '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>',
    );
    const result = sanitizeSvg(input).toString("utf-8");
    expect(result).not.toContain("DOCTYPE");
    expect(result).not.toContain("ENTITY");
    expect(result).toContain("<rect/>");
  });

  it("removes a DOCTYPE that only forms once an inner one is removed", () => {
    const input = Buffer.from(
      '<!DOC<!DOCTYPE x>TYPE svg [<!ENTITY a SYSTEM "file:///etc/passwd">]>' +
        '<svg xmlns="http://www.w3.org/2000/svg"><text>&a;</text></svg>',
    );
    const result = sanitizeSvg(input).toString("utf-8");
    expect(result).not.toMatch(/DOCTYPE|ENTITY|passwd/);
    expect(result).toContain("<text>&a;</text>");
  });

  it("rejects an SVG with more than one DOCTYPE", () => {
    const input = Buffer.from(
      '<!DOCTYPE svg><!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>',
    );
    expect(() => sanitizeSvg(input)).toThrow(
      expect.objectContaining({ statusCode: 400, message: "SVG contains more than one DOCTYPE" }),
    );
  });
});

// Each case below used to rescan the rest of the input from every opening, so
// its cost grew with the square of the input size. The time bounds are loose on
// purpose: the fixed code finishes these in milliseconds, the old code took
// seconds to minutes.
describe("sanitizeSvg: bounded work on unterminated markup", () => {
  const SVG_OPEN = '<svg xmlns="http://www.w3.org/2000/svg">';

  function timed(input: string): { ms: number; run: () => string } {
    const start = performance.now();
    let out: string | Error;
    try {
      out = sanitizeSvg(Buffer.from(input)).toString("utf-8");
    } catch (err) {
      out = err as Error;
    }
    const ms = performance.now() - start;
    return {
      ms,
      run: () => {
        if (out instanceof Error) throw out;
        return out;
      },
    };
  }

  it("rejects 512KB of unterminated <set openings quickly with a 400", () => {
    const { ms, run } = timed(`${SVG_OPEN}${"<set".repeat(131_072)}</svg>`);
    expect(run).toThrow(
      expect.objectContaining({
        statusCode: 400,
        message: "SVG exceeds maximum element count of 5000",
      }),
    );
    expect(ms).toBeLessThan(1000);
  });

  it("leaves entity-encoded openings as text instead of counting them (#5102)", () => {
    // `&#60;` stays encoded, so it never becomes an opening for the scanners
    // to chase and has no reason to count toward the element cap.
    const { ms, run } = timed(`${SVG_OPEN}${"&#60;set".repeat(6000)}</svg>`);
    const out = run();
    expect(out).not.toMatch(/<set/i);
    expect(out).toContain("&#60;set");
    expect(ms).toBeLessThan(1000);
  });

  it("still counts raw openings toward the element cap", () => {
    const { run } = timed(`${SVG_OPEN}${"<set".repeat(6000)}</svg>`);
    expect(run).toThrow("maximum element count of 5000");
  });

  it("sanitizes a multi-MB SVG just under the element cap in linear time", () => {
    // Each run of unterminated openings is followed by a long stretch of text
    // and then a real tag, so every opening has a distant `>` to scan toward.
    const pad = `${"a".repeat(600_000)}<rect/>`;
    const input =
      SVG_OPEN +
      ["<set", "<", "<use href='http://", "<xi:include", "<![CDATA["]
        .map((opening) => opening.repeat(950) + pad)
        .join("") +
      "</svg>";
    const { ms, run } = timed(input);
    expect(run()).not.toMatch(/<set|<use|xi:include/i);
    expect(ms).toBeLessThan(2000);
  });

  it("rejects tags that keep re-forming after removal with a 400", () => {
    const nested = `${"<se".repeat(6)}<set>${"t>".repeat(6)}`;
    const { run } = timed(`${SVG_OPEN}${nested}<rect/></svg>`);
    expect(run).toThrow(
      expect.objectContaining({ statusCode: 400, message: "SVG nesting is too deep to sanitize" }),
    );
  });
});

describe("sanitizeSvg: character references that encode XML syntax (#5102)", () => {
  const clean = (svg: string) => sanitizeSvg(Buffer.from(svg)).toString("utf-8");

  it.each([
    ["&#34; in a double-quoted attribute", '<svg><rect fill="url(&#34;#grad&#34;)"/></svg>'],
    ["&#x22; in a double-quoted attribute", '<svg><rect fill="url(&#x22;#grad&#x22;)"/></svg>'],
    [
      "&#39; in a single-quoted attribute",
      "<svg><text font-family='&#39;Open Sans&#39;'>a</text></svg>",
    ],
    [
      "&#x27; in a single-quoted attribute",
      "<svg><text font-family='&#x27;Open Sans&#x27;'>a</text></svg>",
    ],
    ["&#60; in text", "<svg><text>a &#60; b</text></svg>"],
    ["&#x3C; in text", "<svg><text>a &#x3C; b</text></svg>"],
    ["&#38; in text", "<svg><text>R&#38;D</text></svg>"],
    ["&#x26; in text", "<svg><text>R&#x26;D</text></svg>"],
    ["&#60; in an attribute", '<svg><rect data-x="a &#60; b"/></svg>'],
    ["&#62; in text", "<svg><text>]]&#62;</text></svg>"],
  ])("keeps %s well-formed", (_label, input) => {
    expect(XMLValidator.validate(input)).toBe(true);
    const out = clean(input);
    expect(XMLValidator.validate(out)).toBe(true);
    expect(out).toBe(input);
  });

  it("does not turn an encoded quote into a new attribute", () => {
    const out = clean('<svg><rect fill="x&#34; stroke=&#34;red"/></svg>');
    expect(XMLValidator.validate(out)).toBe(true);
    expect(out).toContain('fill="x&#34; stroke=&#34;red"');
    expect(out).not.toContain('stroke="red"');
  });

  it("does not turn encoded markup into an element", () => {
    const out = clean("<svg><text>&#60;script>alert(1)&#60;/script></text></svg>");
    expect(XMLValidator.validate(out)).toBe(true);
    expect(out).not.toMatch(/<script/i);
  });

  it("does not decode an encoded ampersand a second time", () => {
    // XML reads `&#38;#106;` as the literal text `&#106;`, not as `j`.
    const out = clean('<svg><a href="&#38;#106;avascript:x"><text>c</text></a></svg>');
    expect(out).toContain('href="&#38;#106;avascript:x"');
  });

  it("decodes a code point above U+FFFF whole instead of truncating it", () => {
    // String.fromCharCode wrapped these to 16 bits: &#65570; came out as `"`.
    const out = clean('<svg><rect data-x="&#65570;"/><text>&#x1F600;</text></svg>');
    expect(XMLValidator.validate(out)).toBe(true);
    expect(out).toBe(
      `<svg><rect data-x="${String.fromCodePoint(65570)}"/><text>${String.fromCodePoint(0x1f600)}</text></svg>`,
    );
  });

  it("leaves a reference past U+10FFFF untouched", () => {
    const out = clean("<svg><text>&#x110000;&#99999999;</text></svg>");
    expect(out).toContain("&#x110000;&#99999999;");
  });

  it.each([
    ["a decoded digit", '<svg><a href="&#&#49;06;avascript:alert(1)"><text>c</text></a></svg>'],
    ["a decoded #", '<svg><a href="&&#35;x6A;avascript:alert(1)"><text>c</text></a></svg>'],
    ["an uppercase X", '<svg><a href="&#X6A;avascript:alert(1)"><text>c</text></a></svg>'],
  ])("catches a scheme hidden behind %s", (_label, input) => {
    const out = clean(input);
    expect(out).not.toMatch(/javascript:/i);
    expect(out).not.toMatch(/&#[xX]?[0-9a-fA-F]+;avascript/);
  });

  it("rejects references nested deeper than the decode pass cap", () => {
    // Each level encodes the first digit, so it needs one more pass to decode.
    let ref = "&#106;";
    for (let level = 0; level < 6; level++) {
      const i = ref.search(/\d/);
      ref = `${ref.slice(0, i)}&#${ref.charCodeAt(i)};${ref.slice(i + 1)}`;
    }
    expect(() => clean(`<svg><text>${ref}</text></svg>`)).toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
  });

  it.each([
    ["&#34;", '<svg><rect fill="url(&#34;https://evil.test/x&#34;)"/></svg>', "&#34;"],
    ["&#x22;", '<svg><rect fill="url(&#x22;file:///etc/passwd&#x22;)"/></svg>', "&#x22;"],
    ["&#39;", "<svg><rect style='fill:url(&#39;data:text/html,x&#39;)'/></svg>", "&#39;"],
    ["&#X27;", "<svg><rect style='fill:url(&#X27;https://evil.test/x&#X27;)'/></svg>", "&#X27;"],
  ])("blocks an external url() quoted with %s", (_label, input, quote) => {
    // A renderer reads the reference as a quote, so this is a quoted external URL.
    const out = clean(input);
    expect(out).toContain(`url(${quote}data:,`);
    expect(out).not.toMatch(/https:\/\/|file:\/\/|data:text/);
    expect(XMLValidator.validate(out)).toBe(true);
  });

  it("still decodes letters so an encoded scheme is caught", () => {
    const out = clean(
      '<svg><rect fill="&#34;"/><a href="&#106;avascript:alert(1)"><text>c</text></a></svg>',
    );
    expect(out).toContain('fill="&#34;"');
    expect(out).not.toMatch(/javascript:/i);
  });
});

describe("sanitizeSvg: paired dangerous-element removal", () => {
  const strip = (body: string) =>
    sanitizeSvg(
      Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg">${body}<rect/></svg>`),
    ).toString("utf-8");

  it("removes nested <set> elements", () => {
    const out = strip('<set attributeName="href" to="a"><set to="b"></set></set>');
    expect(out).not.toMatch(/<\/?set/i);
    expect(out).toContain("<rect/>");
  });

  it("removes a prefixed <x:set> with a whitespace-padded end tag", () => {
    const out = strip('<x:set attributeName="href" to="javascript:alert(1)">body</x:set >');
    expect(out).not.toMatch(/x:set|body/);
    expect(out).toContain("<rect/>");
  });

  it("removes uppercase element names", () => {
    const out = strip("<SET to='a'>body</SET><SCRIPT>alert(1)</SCRIPT>");
    expect(out).not.toMatch(/<\/?set|<\/?script|body|alert/i);
    expect(out).toContain("<rect/>");
  });

  it("removes an open tag that never gets a close tag", () => {
    const out = strip('<set attributeName="href" to="javascript:alert(1)">');
    expect(out).not.toMatch(/<set|javascript/i);
    expect(out).toContain("<rect/>");
  });

  it("removes an open tag that runs into the next tag without a >", () => {
    const out = strip('<set to="javascript:alert(1)"');
    expect(out).not.toMatch(/<set|javascript/i);
  });

  it("keeps an element whose name only starts with a dangerous name", () => {
    const out = strip('<settings id="s"/>');
    expect(out).toContain('<settings id="s"/>');
  });
});

describe("isSvgBuffer: prolog before the root element", () => {
  it("detects an SVG whose first construct is a DOCTYPE", () => {
    const input = Buffer.from(
      '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n' +
        '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>',
    );
    expect(isSvgBuffer(input)).toBe(true);
  });

  it("detects an SVG whose first construct is a comment", () => {
    const input = Buffer.from(
      '<!-- exported -->\n<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>',
    );
    expect(isSvgBuffer(input)).toBe(true);
  });

  it("detects an SVG behind a DOCTYPE whose internal subset has ] in a quoted value", () => {
    const input = Buffer.from(
      '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY z "]">]>' +
        '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>',
    );
    expect(isSvgBuffer(input)).toBe(true);
  });

  it("detects a namespace-prefixed root element", () => {
    const input = Buffer.from(
      '<svg:svg xmlns:svg="http://www.w3.org/2000/svg"><svg:rect/></svg:svg>',
    );
    expect(isSvgBuffer(input)).toBe(true);
  });

  it("does not match a root element that merely starts with svg (svgother)", () => {
    const input = Buffer.from("<svgother><rect/></svgother>");
    expect(isSvgBuffer(input)).toBe(false);
  });

  it("detects an SVG with a UTF-8 byte order mark", () => {
    const input = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    ]);
    expect(isSvgBuffer(input)).toBe(true);
  });

  it("does not treat an HTML document with an inline <svg> as SVG", () => {
    const input = Buffer.from("<!DOCTYPE html><html><body><svg><rect/></svg></body></html>");
    expect(isSvgBuffer(input)).toBe(false);
  });
});

describe("isSvgBuffer", () => {
  it("identifies standard SVG", () => {
    expect(isSvgBuffer(Buffer.from("<svg></svg>"))).toBe(true);
  });

  it("identifies SVG with DOCTYPE", () => {
    expect(isSvgBuffer(Buffer.from("<!DOCTYPE svg><svg></svg>"))).toBe(true);
  });

  it("identifies padded SVG", () => {
    const padded = " ".repeat(5000) + "<svg></svg>";
    expect(isSvgBuffer(Buffer.from(padded))).toBe(true);
  });

  it("identifies heavily padded SVG with mixed whitespace", () => {
    const padded = " \n\t\r".repeat(2000) + "<svg></svg>";
    expect(isSvgBuffer(Buffer.from(padded))).toBe(true);
  });

  it("rejects non-SVG", () => {
    expect(isSvgBuffer(Buffer.from("<html><body></body></html>"))).toBe(false);
  });
});

describe("decompressSvgz", () => {
  it("decompresses valid SVGZ", () => {
    const compressed = gzipSync(Buffer.from("<svg></svg>"));
    const result = decompressSvgz(compressed);
    expect(result.toString("utf-8")).toBe("<svg></svg>");
  });

  it("throws RangeError on decompression bomb", () => {
    // 60MB of spaces compresses to very small gzip
    const bomb = gzipSync(Buffer.alloc(60 * 1024 * 1024, 0x20));
    expect(() => decompressSvgz(bomb)).toThrow(RangeError);
  });
});

describe("isSvgzClientError", () => {
  it("recognizes statusCode 400, Z_DATA_ERROR, Z_BUF_ERROR, ERR_BUFFER_TOO_LARGE, and non-OOM RangeError as client errors", () => {
    expect(isSvgzClientError(Object.assign(new Error("over cap"), { statusCode: 400 }))).toBe(true);
    expect(isSvgzClientError(Object.assign(new Error("corrupt"), { code: "Z_DATA_ERROR" }))).toBe(
      true,
    );
    expect(isSvgzClientError(Object.assign(new Error("truncated"), { code: "Z_BUF_ERROR" }))).toBe(
      true,
    );
    expect(
      isSvgzClientError(Object.assign(new Error("buffer cap"), { code: "ERR_BUFFER_TOO_LARGE" })),
    ).toBe(true);
    expect(isSvgzClientError(new RangeError("Cannot create a Buffer larger than 52428800"))).toBe(
      true,
    );
  });

  it("rejects non-client errors and non-objects", () => {
    expect(isSvgzClientError(new RangeError("Array buffer allocation failed"))).toBe(false);
    expect(isSvgzClientError(new Error("unexpected sanitizer crash"))).toBe(false);
    expect(isSvgzClientError(Object.assign(new Error("server error"), { statusCode: 500 }))).toBe(
      false,
    );
    expect(isSvgzClientError({})).toBe(false);
    expect(isSvgzClientError(null)).toBe(false);
    expect(isSvgzClientError(undefined)).toBe(false);
    expect(isSvgzClientError("string error")).toBe(false);
  });
});

describe("isSvgClientError (#3580)", () => {
  it("recognizes isSvgzClientError matches plus non-SVG SVGZ content errors", () => {
    expect(isSvgClientError(Object.assign(new Error("over cap"), { statusCode: 400 }))).toBe(true);
    expect(isSvgClientError(Object.assign(new Error("corrupt"), { code: "Z_DATA_ERROR" }))).toBe(
      true,
    );
    expect(isSvgClientError(Object.assign(new Error("truncated"), { code: "Z_BUF_ERROR" }))).toBe(
      true,
    );
    expect(
      isSvgClientError(Object.assign(new Error("buffer cap"), { code: "ERR_BUFFER_TOO_LARGE" })),
    ).toBe(true);
    expect(isSvgClientError(new RangeError("Cannot create a Buffer larger than 52428800"))).toBe(
      true,
    );
    expect(
      isSvgClientError(
        new Error("SVGZ file does not contain valid SVG content after decompression"),
      ),
    ).toBe(true);
  });

  it("rejects unexpected runtime faults and non-client errors", () => {
    expect(isSvgClientError(new RangeError("Array buffer allocation failed"))).toBe(false);
    expect(isSvgClientError(new TypeError("unexpected sanitizer fault"))).toBe(false);
    expect(isSvgClientError(new Error("unexpected sanitizer crash"))).toBe(false);
    expect(isSvgClientError(Object.assign(new Error("server error"), { statusCode: 500 }))).toBe(
      false,
    );
    expect(isSvgClientError(Object.assign(new Error("ENOSPC"), { code: "ENOSPC" }))).toBe(false);
    expect(isSvgClientError({})).toBe(false);
    expect(isSvgClientError(null)).toBe(false);
    expect(isSvgClientError(undefined)).toBe(false);
    expect(isSvgClientError("string error")).toBe(false);
  });
});

describe("sanitizeSvg: base64 raster data URIs on <image> (#5101)", () => {
  const clean = (svg: string) => sanitizeSvg(Buffer.from(svg)).toString("utf-8");
  // Real 3x2 files written by sharp.
  const PNG =
    "iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAYAAACddGYaAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWP4z8DQAMMMyBwAeUMI+0cxNA0AAAAASUVORK5CYII=";
  const JPEG =
    "/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAACAAMDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABQf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCDgBlJf//Z";
  const GIF = "R0lGODlhAwACAIAAAExpcf8AACH5BAUAAAAALAAAAAADAAIAAAICjF8AOw==";
  const WEBP =
    "UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoDAAIAAUAmJaACdLoB+AADsAD+8ut//NgVzXPv9//S4P0uD9Lg/9KQAAA=";
  const SVG_B64 = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>',
  ).toString("base64");

  /** A PNG signature and IHDR declaring `width` x `height`, then `pad` zero bytes. */
  function pngHeader(width: number, height: number, pad = 0): string {
    const buf = Buffer.alloc(33 + pad);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
    buf.writeUInt32BE(13, 8);
    buf.write("IHDR", 12, "latin1");
    buf.writeUInt32BE(width, 16);
    buf.writeUInt32BE(height, 20);
    buf[24] = 8;
    buf[25] = 6;
    return buf.toString("base64");
  }

  const kept = (out: string, payload: string) => out.includes(payload) && !out.includes("data:,");

  it.each([
    ["png on href", `<image href="data:image/png;base64,${PNG}" width="1" height="1"/>`, PNG],
    ["png on xlink:href", `<image xlink:href="data:image/png;base64,${PNG}"/>`, PNG],
    ["jpeg", `<image href="data:image/jpeg;base64,${JPEG}"/>`, JPEG],
    ["gif", `<image href="data:image/gif;base64,${GIF}"/>`, GIF],
    ["webp", `<image href="data:image/webp;base64,${WEBP}"/>`, WEBP],
    ["single quotes", `<image href='data:image/png;base64,${PNG}'/>`, PNG],
    ["mixed case scheme and type", `<image href="DATA:Image/PNG;Base64,${PNG}"/>`, PNG],
    ["leading whitespace", `<image href="  data:image/png;base64,${PNG}"/>`, PNG],
    [
      "spaces in base64",
      `<image href="data:image/png;base64,${PNG.slice(0, 20)} ${PNG.slice(20)}"/>`,
      PNG.slice(20),
    ],
    ["namespace-prefixed element", `<svg:image href="data:image/png;base64,${PNG}"/>`, PNG],
    ["href after other attributes", `<image x="0" y="0" href="data:image/png;base64,${PNG}">`, PNG],
    ["entity-encoded data:", `<image href="&#100;ata:image/png;base64,${PNG}"/>`, PNG],
    [
      "a quoted > earlier in the tag",
      `<image title="a > b" href="data:image/png;base64,${PNG}"/>`,
      PNG,
    ],
    [
      "after a comment with a quote",
      `<!-- it's --><image href="data:image/png;base64,${PNG}"/>`,
      PNG,
    ],
  ])("keeps a raster: %s", (_label, image, payload) => {
    expect(kept(clean(`<svg>${image}</svg>`), payload)).toBe(true);
  });

  it("keeps a line-wrapped raster", () => {
    // The control-character pass already joins the lines inside an href value.
    const out = clean(
      `<svg><image href="data:image/png;base64,${PNG.slice(0, 20)}\n  ${PNG.slice(20)}"/></svg>`,
    );
    expect(out).toContain(`href="data:image/png;base64,${PNG.slice(0, 20)}  ${PNG.slice(20)}"`);
  });

  it.each([
    ["svg+xml base64", `<image href="data:image/svg+xml;base64,${SVG_B64}"/>`],
    ["svg+xml plain", '<image href="data:image/svg+xml,<svg onload=alert(1)/>"/>'],
    ["entity-encoded svg+xml", `<image href="&#100;ata:image/svg+xml;base64,${SVG_B64}"/>`],
    ["upper-case svg+xml", `<image href="DATA:IMAGE/SVG+XML;BASE64,${SVG_B64}"/>`],
    ["text/html", '<image href="data:text/html;base64,PHNjcmlwdD4="/>'],
    ["svg bytes labelled png", `<image href="data:image/png;base64,${SVG_B64}"/>`],
    ["jpeg bytes labelled png", `<image href="data:image/png;base64,${JPEG}"/>`],
    ["png bytes labelled webp", `<image href="data:image/webp;base64,${PNG}"/>`],
    ["truncated png", `<image href="data:image/png;base64,${PNG.slice(0, 12)}"/>`],
    ["empty payload", '<image href="data:image/png;base64,"/>'],
    ["non-base64 png", '<image href="data:image/png,rawbytes"/>'],
    ["charset parameter", `<image href="data:image/png;charset=utf-8;base64,${PNG}"/>`],
    ["parameter after base64", `<image href="data:image/png;base64;x=y,${PNG}"/>`],
    ["parameter before base64", `<image href="data:image/png;x=1;base64,${PNG}"/>`],
    ["lookalike type", `<image href="data:image/pngx;base64,${PNG}"/>`],
    ["image/jpg", `<image href="data:image/jpg;base64,${JPEG}"/>`],
    ["space before ;base64", `<image href="data:image/png ;base64,${PNG}"/>`],
    ["non-base64 payload character", `<image href="data:image/png;base64,${PNG})"/>`],
    ["named entity in payload", `<image href="data:image/png;base64,${PNG}&amp;"/>`],
    ["unicode whitespace", `<image href="\u00a0data:image/png;base64,${PNG}"/>`],
    ["unquoted value", `<image href=data:image/png;base64,${PNG}/>`],
    ["unterminated value", `<image href="data:image/png;base64,${PNG}/>`],
    ["mismatched quotes", `<image href="data:image/png;base64,${PNG}'/>`],
    ["on <a href>", `<a href="data:image/png;base64,${PNG}"><text>x</text></a>`],
    ["on <use>", `<use href="data:image/png;base64,${PNG}"/>`],
    ["on a lookalike element", `<imagex href="data:image/png;base64,${PNG}"/>`],
    ["on a lookalike attribute", `<image data-href="data:image/png;base64,${PNG}"/>`],
    ["on a prefixed attribute", `<image x:href="data:image/png;base64,${PNG}"/>`],
    ["outside any tag", `href="data:image/png;base64,${PNG}"`],
    ["inside a comment", `<!-- <image href="data:image/png;base64,${PNG}"/> -->`],
    [
      "an <image> inside another tag's quoted value",
      `<a title=">" <image href="data:image/png;base64,${PNG}">x</a>`,
    ],
    [
      "an <image> inside a <use> tag's quoted value",
      `<use title=">" <image href="data:image/png;base64,${PNG}"/>`,
    ],
    [
      "an <a> after a stray quote that does not open a value",
      `<image title=x"y > <a href="data:image/png;base64,${PNG}">" >`,
    ],
  ])("still blocks: %s", (_label, markup) => {
    const out = clean(`<svg>${markup}</svg>`);
    expect(out).not.toMatch(/href\s*=\s*["']?[\s\u00a0]*data:[^,]/i);
  });

  it("still strips <feImage> with a raster data URI", () => {
    const out = clean(`<svg><filter><feImage href="data:image/png;base64,${PNG}"/></filter></svg>`);
    expect(out).not.toContain("feImage");
  });

  it("neutralizes javascript: on the same element while keeping the raster", () => {
    const out = clean(
      `<svg><image href="data:image/png;base64,${PNG}" xlink:href="javascript:alert(1)"/></svg>`,
    );
    expect(out).toContain(`href="data:image/png;base64,${PNG}"`);
    expect(out).not.toContain("javascript:");
    expect(out).toContain('xlink:href="data:,');
  });

  it("neutralizes javascript: before a raster on the same element", () => {
    const out = clean(
      `<svg><image xlink:href="javascript:alert(1)" href="data:image/png;base64,${PNG}"/></svg>`,
    );
    expect(out).not.toContain("javascript:");
    expect(out).toContain(`href="data:image/png;base64,${PNG}"`);
  });

  it("does not let a raster prefix carry an event handler", () => {
    const out = clean(
      `<svg><image href="data:image/png;base64,${PNG}&#34; onload=&#34;alert(1)"/></svg>`,
    );
    expect(out).not.toMatch(/\bonload\s*=/i);
  });

  it("blocks a raster wider than the side ceiling", () => {
    const out = clean(`<svg><image href="data:image/png;base64,${pngHeader(16384, 1)}"/></svg>`);
    expect(out).toContain('href="data:,');
  });

  it("blocks a raster that declares more pixels than the budget", () => {
    const out = clean(
      `<svg><image href="data:image/png;base64,${pngHeader(10000, 10000)}"/></svg>`,
    );
    expect(out).toContain('href="data:,');
  });

  it("shares the pixel budget across every raster in the document", () => {
    // 6000 x 6000 is 36 MP: one fits the 64 MP budget, the second does not.
    const big = pngHeader(6000, 6000);
    const out = clean(
      `<svg><image href="data:image/png;base64,${big}"/><image href="data:image/png;base64,${big}"/>` +
        `<image href="data:image/png;base64,${PNG}"/></svg>`,
    );
    expect(out.split(`data:image/png;base64,${big}`)).toHaveLength(2);
    expect(out).toContain(`data:image/png;base64,${PNG}`);
    expect(out).toContain('href="data:,');
  });

  it("allows rasters on many <image> tags in linear time", () => {
    const image = `<image href="data:image/png;base64,${pngHeader(1, 1, 1500)}"/>`;
    const start = performance.now();
    const out = clean(`<svg>${image.repeat(4000)}</svg>`);
    expect(performance.now() - start).toBeLessThan(2000);
    expect(out.includes("data:,")).toBe(false);
  });

  it("does unbounded-quote raster scans in linear time", () => {
    const start = performance.now();
    const out = clean(`<svg><image ${'href="data:image/png;base64,AAAA '.repeat(20_000)}/></svg>`);
    expect(performance.now() - start).toBeLessThan(2000);
    expect(out.includes("data:,")).toBe(true);
  });

  it("scans many unterminated quoted values in linear time", () => {
    const start = performance.now();
    const out = clean(`<svg>${'<image a="'.repeat(4000)}${"x".repeat(1_000_000)}</svg>`);
    expect(performance.now() - start).toBeLessThan(2000);
    expect(out.length).toBeGreaterThan(1_000_000);
  });
});
