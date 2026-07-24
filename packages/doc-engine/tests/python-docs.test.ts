import type { SignPlacement } from "@snapotter/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * python-docs.ts wraps runDocsScript (from @snapotter/ai) around the doc_* Python
 * scripts. We mock only runDocsScript and use the real @snapotter/shared SafeError
 * so parseDocsJson's error type is exercised faithfully.
 */
const runDocsScript = vi.fn<(script: string, args: unknown, opts?: unknown) => Promise<string>>();
vi.mock("@snapotter/ai", () => ({
  runDocsScript: (script: string, args: unknown, opts?: unknown) =>
    runDocsScript(script, args, opts),
}));

function firstCall() {
  return runDocsScript.mock.calls[0];
}

beforeEach(() => {
  runDocsScript.mockReset();
});

describe("pdfPageCountPy", () => {
  it("calls doc_pagecount with the path and returns the page count", async () => {
    runDocsScript.mockResolvedValueOnce('{"pages": 7}');
    const n = await import("../src/python-docs.js").then((m) => m.pdfPageCountPy("/abs/doc.pdf"));
    expect(n).toBe(7);
    expect(firstCall()).toEqual(["doc_pagecount", { path: "/abs/doc.pdf" }, undefined]);
  });

  it("throws the reported error message", async () => {
    runDocsScript.mockResolvedValueOnce('{"error": "corrupt xref"}');
    await expect(
      import("../src/python-docs.js").then((m) => m.pdfPageCountPy("/x.pdf")),
    ).rejects.toThrow("doc_pagecount failed: corrupt xref");
  });

  it("throws when pages is not a number", async () => {
    runDocsScript.mockResolvedValueOnce('{"pages": "seven"}');
    await expect(
      import("../src/python-docs.js").then((m) => m.pdfPageCountPy("/x.pdf")),
    ).rejects.toThrow("doc_pagecount failed:");
  });

  it("returns 0 pages faithfully", async () => {
    runDocsScript.mockResolvedValueOnce('{"pages": 0}');
    await expect(
      import("../src/python-docs.js").then((m) => m.pdfPageCountPy("/x.pdf")),
    ).resolves.toBe(0);
  });
});

describe("parseDocsJson (via pdfFlattenPy non-JSON)", () => {
  it("resolves on a valid ok:true payload", async () => {
    runDocsScript.mockResolvedValueOnce('{"ok": true}');
    await expect(
      import("../src/python-docs.js").then((m) => m.pdfFlattenPy("/in.pdf", "/out.pdf")),
    ).resolves.toBeUndefined();
  });

  it("passes path + out to doc_flatten", async () => {
    runDocsScript.mockResolvedValueOnce('{"ok": true}');
    await import("../src/python-docs.js").then((m) => m.pdfFlattenPy("/in.pdf", "/out.pdf"));
    expect(firstCall()).toEqual(["doc_flatten", { path: "/in.pdf", out: "/out.pdf" }, undefined]);
  });

  it("wraps non-JSON stdout in a SafeError with kind bug, script code, and raw cause", async () => {
    runDocsScript.mockResolvedValueOnce("Traceback (most recent call last): boom");
    try {
      await import("../src/python-docs.js").then((m) => m.pdfFlattenPy("/in.pdf", "/out.pdf"));
      throw new Error("should have thrown");
    } catch (e) {
      const err = e as {
        message: string;
        name: string;
        kind?: string;
        code?: string;
        cause?: Error;
      };
      expect(err.name).toBe("SafeError");
      expect(err.message).toBe("Document tool returned non-JSON output");
      expect(err.kind).toBe("bug");
      expect(err.code).toBe("doc_flatten");
      expect(err.cause?.message).toContain("doc_flatten stdout (first 200 chars):");
      expect(err.cause?.message).toContain("Traceback");
    }
  });

  it("truncates the raw stdout to 200 chars in the SafeError cause", async () => {
    const huge = `X${"y".repeat(500)}`; // not JSON
    runDocsScript.mockResolvedValueOnce(huge);
    try {
      await import("../src/python-docs.js").then((m) => m.pdfFlattenPy("/in.pdf", "/out.pdf"));
      throw new Error("should have thrown");
    } catch (e) {
      const cause = (e as { cause?: Error }).cause;
      const snippet = cause?.message.split("chars): ")[1] ?? "";
      expect(snippet.length).toBe(200);
    }
  });

  it("surfaces a script-reported error (JSON with error field) as a plain Error", async () => {
    runDocsScript.mockResolvedValueOnce('{"error": "flatten blew up"}');
    await expect(
      import("../src/python-docs.js").then((m) => m.pdfFlattenPy("/in.pdf", "/out.pdf")),
    ).rejects.toThrow("doc_flatten failed: flatten blew up");
  });
});

describe("pdfScrubProducerPy", () => {
  it("calls doc_scrub_meta with path + out and resolves on ok", async () => {
    runDocsScript.mockResolvedValueOnce('{"ok": true}');
    await import("../src/python-docs.js").then((m) => m.pdfScrubProducerPy("/in.pdf", "/out.pdf"));
    expect(firstCall()).toEqual([
      "doc_scrub_meta",
      { path: "/in.pdf", out: "/out.pdf" },
      undefined,
    ]);
  });

  it("throws the reported error", async () => {
    runDocsScript.mockResolvedValueOnce('{"error": "scrub failed"}');
    await expect(
      import("../src/python-docs.js").then((m) => m.pdfScrubProducerPy("/in.pdf", "/out.pdf")),
    ).rejects.toThrow("doc_scrub_meta failed: scrub failed");
  });
});

describe("pdfRedactPy", () => {
  it("passes terms + caseSensitive and returns the found count", async () => {
    runDocsScript.mockResolvedValueOnce('{"found": 3, "verified": true}');
    const res = await import("../src/python-docs.js").then((m) =>
      m.pdfRedactPy("/in.pdf", "/out.pdf", ["ssn", "dob"], true),
    );
    expect(res).toEqual({ found: 3 });
    expect(firstCall()).toEqual([
      "doc_redact",
      { path: "/in.pdf", out: "/out.pdf", terms: ["ssn", "dob"], caseSensitive: true },
      undefined,
    ]);
  });

  it("forwards caseSensitive: false verbatim", async () => {
    runDocsScript.mockResolvedValueOnce('{"found": 0}');
    await import("../src/python-docs.js").then((m) =>
      m.pdfRedactPy("/in.pdf", "/out.pdf", ["x"], false),
    );
    expect((firstCall()[1] as { caseSensitive: boolean }).caseSensitive).toBe(false);
  });

  it("returns found: 0 when nothing matched", async () => {
    runDocsScript.mockResolvedValueOnce('{"found": 0, "verified": true}');
    await expect(
      import("../src/python-docs.js").then((m) =>
        m.pdfRedactPy("/in.pdf", "/out.pdf", ["x"], true),
      ),
    ).resolves.toEqual({ found: 0 });
  });

  it("throws the reported error", async () => {
    runDocsScript.mockResolvedValueOnce('{"error": "redaction verify failed"}');
    await expect(
      import("../src/python-docs.js").then((m) =>
        m.pdfRedactPy("/in.pdf", "/out.pdf", ["x"], true),
      ),
    ).rejects.toThrow("doc_redact failed: redaction verify failed");
  });

  it("throws when found is missing but no error field is present", async () => {
    runDocsScript.mockResolvedValueOnce('{"verified": true}');
    await expect(
      import("../src/python-docs.js").then((m) =>
        m.pdfRedactPy("/in.pdf", "/out.pdf", ["x"], true),
      ),
    ).rejects.toThrow("doc_redact failed:");
  });
});

describe("pdfTextPy", () => {
  it("passes path + out and returns chars + hasText", async () => {
    runDocsScript.mockResolvedValueOnce('{"chars": 128, "hasText": true}');
    const res = await import("../src/python-docs.js").then((m) =>
      m.pdfTextPy("/in.pdf", "/out.txt"),
    );
    expect(res).toEqual({ chars: 128, hasText: true });
    expect(firstCall()).toEqual(["doc_text", { path: "/in.pdf", out: "/out.txt" }, undefined]);
  });

  it("respects an explicit hasText:false even with chars > 0", async () => {
    runDocsScript.mockResolvedValueOnce('{"chars": 50, "hasText": false}');
    await expect(
      import("../src/python-docs.js").then((m) => m.pdfTextPy("/in.pdf", "/out.txt")),
    ).resolves.toEqual({ chars: 50, hasText: false });
  });

  it("derives hasText=true from chars>0 when hasText is absent", async () => {
    runDocsScript.mockResolvedValueOnce('{"chars": 5}');
    await expect(
      import("../src/python-docs.js").then((m) => m.pdfTextPy("/in.pdf", "/out.txt")),
    ).resolves.toEqual({ chars: 5, hasText: true });
  });

  it("derives hasText=false from chars===0 when hasText is absent", async () => {
    runDocsScript.mockResolvedValueOnce('{"chars": 0}');
    await expect(
      import("../src/python-docs.js").then((m) => m.pdfTextPy("/in.pdf", "/out.txt")),
    ).resolves.toEqual({ chars: 0, hasText: false });
  });

  it("throws the reported error", async () => {
    runDocsScript.mockResolvedValueOnce('{"error": "text extract failed"}');
    await expect(
      import("../src/python-docs.js").then((m) => m.pdfTextPy("/in.pdf", "/out.txt")),
    ).rejects.toThrow("doc_text failed: text extract failed");
  });

  it("throws when chars is not a number and no error field is present", async () => {
    runDocsScript.mockResolvedValueOnce('{"hasText": true}');
    await expect(
      import("../src/python-docs.js").then((m) => m.pdfTextPy("/in.pdf", "/out.txt")),
    ).rejects.toThrow("doc_text failed:");
  });
});

describe("pdfToWordPy", () => {
  it("calls doc_to_word with a 5-minute timeout", async () => {
    runDocsScript.mockResolvedValueOnce('{"ok": true}');
    await import("../src/python-docs.js").then((m) => m.pdfToWordPy("/in.pdf", "/out.docx"));
    expect(firstCall()).toEqual([
      "doc_to_word",
      { path: "/in.pdf", out: "/out.docx" },
      { timeoutMs: 300_000 },
    ]);
  });

  it("throws the reported error", async () => {
    runDocsScript.mockResolvedValueOnce('{"error": "pdf2docx failed"}');
    await expect(
      import("../src/python-docs.js").then((m) => m.pdfToWordPy("/in.pdf", "/out.docx")),
    ).rejects.toThrow("doc_to_word failed: pdf2docx failed");
  });
});

describe("pdfMetadataGetPy", () => {
  it("calls doc_metadata mode:get and returns the metadata object", async () => {
    runDocsScript.mockResolvedValueOnce('{"metadata": {"Title": "Report", "Author": "Otter"}}');
    const meta = await import("../src/python-docs.js").then((m) => m.pdfMetadataGetPy("/in.pdf"));
    expect(meta).toEqual({ Title: "Report", Author: "Otter" });
    expect(firstCall()).toEqual(["doc_metadata", { path: "/in.pdf", mode: "get" }, undefined]);
  });

  it("throws the reported error", async () => {
    runDocsScript.mockResolvedValueOnce('{"error": "docinfo read failed"}');
    await expect(
      import("../src/python-docs.js").then((m) => m.pdfMetadataGetPy("/in.pdf")),
    ).rejects.toThrow("doc_metadata get failed: docinfo read failed");
  });

  it("throws when metadata is missing/not an object", async () => {
    runDocsScript.mockResolvedValueOnce('{"metadata": "not-an-object"}');
    await expect(
      import("../src/python-docs.js").then((m) => m.pdfMetadataGetPy("/in.pdf")),
    ).rejects.toThrow("doc_metadata get failed:");
  });
});

describe("pdfMetadataSetPy", () => {
  it("calls doc_metadata mode:set with the metadata payload", async () => {
    runDocsScript.mockResolvedValueOnce('{"ok": true}');
    await import("../src/python-docs.js").then((m) =>
      m.pdfMetadataSetPy("/in.pdf", "/out.pdf", { Title: "New Title" }),
    );
    expect(firstCall()).toEqual([
      "doc_metadata",
      { path: "/in.pdf", out: "/out.pdf", mode: "set", metadata: { Title: "New Title" } },
      undefined,
    ]);
  });

  it("throws the reported error", async () => {
    runDocsScript.mockResolvedValueOnce('{"error": "docinfo write failed"}');
    await expect(
      import("../src/python-docs.js").then((m) =>
        m.pdfMetadataSetPy("/in.pdf", "/out.pdf", { Title: "X" }),
      ),
    ).rejects.toThrow("doc_metadata set failed: docinfo write failed");
  });
});

describe("htmlToPdfPy", () => {
  it("calls doc_html_pdf with the mode and a 2-minute timeout", async () => {
    runDocsScript.mockResolvedValueOnce('{"ok": true}');
    await import("../src/python-docs.js").then((m) =>
      m.htmlToPdfPy("/in.html", "/out.pdf", "html"),
    );
    expect(firstCall()).toEqual([
      "doc_html_pdf",
      { path: "/in.html", out: "/out.pdf", mode: "html" },
      { timeoutMs: 120_000 },
    ]);
  });

  it("forwards the markdown mode verbatim", async () => {
    runDocsScript.mockResolvedValueOnce('{"ok": true}');
    await import("../src/python-docs.js").then((m) =>
      m.htmlToPdfPy("/in.md", "/out.pdf", "markdown"),
    );
    expect((firstCall()[1] as { mode: string }).mode).toBe("markdown");
  });

  it("throws the reported error", async () => {
    runDocsScript.mockResolvedValueOnce('{"error": "weasyprint failed"}');
    await expect(
      import("../src/python-docs.js").then((m) => m.htmlToPdfPy("/in.html", "/out.pdf", "html")),
    ).rejects.toThrow("doc_html_pdf failed: weasyprint failed");
  });
});

describe("pdfSignPy", () => {
  const placements: SignPlacement[] = [{ sig: 0, page: 1, x: 0.1, y: 0.2, w: 0.3, h: 0.4 }];

  it("uses input/output keys and passes signatures + placements, returning placed", async () => {
    runDocsScript.mockResolvedValueOnce('{"placed": 2, "ok": true}');
    const res = await import("../src/python-docs.js").then((m) =>
      m.pdfSignPy("/in.pdf", "/out.pdf", ["sig0.png", "sig1.png"], placements),
    );
    expect(res).toEqual({ placed: 2 });
    expect(firstCall()).toEqual([
      "doc_sign",
      {
        input: "/in.pdf",
        output: "/out.pdf",
        signatures: ["sig0.png", "sig1.png"],
        placements,
      },
      undefined,
    ]);
  });

  it("returns placed: 0 faithfully", async () => {
    runDocsScript.mockResolvedValueOnce('{"placed": 0}');
    await expect(
      import("../src/python-docs.js").then((m) =>
        m.pdfSignPy("/in.pdf", "/out.pdf", ["s.png"], placements),
      ),
    ).resolves.toEqual({ placed: 0 });
  });

  it("throws the reported error", async () => {
    runDocsScript.mockResolvedValueOnce('{"error": "sign failed"}');
    await expect(
      import("../src/python-docs.js").then((m) =>
        m.pdfSignPy("/in.pdf", "/out.pdf", ["s.png"], placements),
      ),
    ).rejects.toThrow("doc_sign failed: sign failed");
  });

  it("throws when placed is missing but no error field is present", async () => {
    runDocsScript.mockResolvedValueOnce('{"ok": true}');
    await expect(
      import("../src/python-docs.js").then((m) =>
        m.pdfSignPy("/in.pdf", "/out.pdf", ["s.png"], placements),
      ),
    ).rejects.toThrow("doc_sign failed:");
  });
});
