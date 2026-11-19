/**
 * merge-text joins text and Markdown files into one, in the order given (#1101).
 *
 * Each file loses its BOM and trailing blank lines so the separator sits
 * cleanly between documents, the output ends in exactly one newline, and a
 * file that is not UTF-8 text is refused by name instead of being mangled.
 */
import { describe, expect, it } from "vitest";
import { InputValidationError } from "../../../apps/api/src/modality/contract.js";
import { mergeTexts } from "../../../apps/api/src/routes/tools/merge-text.js";

const file = (filename: string, text: string | Buffer) => ({
  filename,
  buffer: typeof text === "string" ? Buffer.from(text, "utf8") : text,
});

describe("mergeTexts", () => {
  it("joins files in the given order with a blank line between them", () => {
    const out = mergeTexts([file("b.txt", "second\n"), file("a.txt", "first\n")], "blank-line");
    expect(out.text).toBe("second\n\nfirst\n");
  });

  it("puts a horizontal rule between documents", () => {
    const out = mergeTexts([file("a.md", "# A\n"), file("b.md", "# B")], "rule");
    expect(out.text).toBe("# A\n\n---\n\n# B\n");
  });

  it("heads each Markdown document with its filename", () => {
    const out = mergeTexts(
      [file("notes/one.md", "alpha\n"), file("two.markdown", "beta\n")],
      "filename-heading",
    );
    expect(out.text).toBe("# one.md\n\nalpha\n\n# two.markdown\n\nbeta\n");
  });

  it("heads plain-text documents with a marker line instead of a Markdown heading", () => {
    const out = mergeTexts([file("a.txt", "alpha"), file("b.log", "beta")], "filename-heading");
    expect(out.text).toBe("==> a.txt <==\n\nalpha\n\n==> b.log <==\n\nbeta\n");
  });

  it("strips a UTF-8 BOM and trailing blank lines from each file", () => {
    const out = mergeTexts(
      [file("a.txt", "\uFEFFalpha\n\n\n"), file("b.txt", "\uFEFFbeta\r\n\r\n")],
      "blank-line",
    );
    expect(out.text).toBe("alpha\n\nbeta\n");
  });

  it("keeps a file's leading whitespace and inner blank lines", () => {
    const out = mergeTexts([file("a.md", "    code\n\npara\n"), file("b.md", "x")], "blank-line");
    expect(out.text).toBe("    code\n\npara\n\nx\n");
  });

  it("names the output after the shared extension when every input has it", () => {
    expect(mergeTexts([file("a.md", "a"), file("b.MD", "b")], "blank-line")).toMatchObject({
      filename: "merged.md",
      contentType: "text/markdown",
    });
    expect(mergeTexts([file("a.log", "a"), file("b.log", "b")], "blank-line")).toMatchObject({
      filename: "merged.log",
      contentType: "text/plain",
    });
  });

  it("never labels joined CSVs as CSV, since each file brings its own header row", () => {
    expect(mergeTexts([file("a.csv", "h\n1"), file("b.csv", "h\n2")], "blank-line")).toMatchObject({
      filename: "merged.txt",
      contentType: "text/plain",
    });
  });

  it("uses CRLF separators when every file uses CRLF", () => {
    const out = mergeTexts([file("a.txt", "a1\r\na2\r\n"), file("b.txt", "b1\r\nb2")], "rule");
    expect(out.text).toBe("a1\r\na2\r\n\r\n---\r\n\r\nb1\r\nb2\r\n");
  });

  it("falls back to LF separators when line endings are mixed", () => {
    const out = mergeTexts([file("a.txt", "a1\r\na2"), file("b.txt", "b1\nb2")], "blank-line");
    expect(out.text).toBe("a1\r\na2\n\nb1\nb2\n");
  });

  it("trims a long trailing whitespace run quickly", () => {
    const padded = `${" ".repeat(1_000_000)}x${" ".repeat(1_000_000)}`;
    const started = performance.now();
    const out = mergeTexts([file("a.txt", padded), file("b.txt", "y")], "blank-line");
    expect(out.text.endsWith("x\n\ny\n")).toBe(true);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("treats .md and .markdown as the same Markdown output", () => {
    expect(mergeTexts([file("a.md", "a"), file("b.markdown", "b")], "blank-line").filename).toBe(
      "merged.md",
    );
  });

  it("falls back to plain text when the inputs mix extensions", () => {
    expect(mergeTexts([file("a.md", "a"), file("b.txt", "b")], "blank-line")).toMatchObject({
      filename: "merged.txt",
      contentType: "text/plain",
    });
  });

  it("keeps an empty file as an empty section rather than dropping it", () => {
    const out = mergeTexts([file("a.txt", ""), file("b.txt", "beta")], "rule");
    expect(out.text).toBe("\n\n---\n\nbeta\n");
  });

  it("refuses a binary file and names it", () => {
    const bin = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]);
    expect(() => mergeTexts([file("a.txt", "ok"), file("photo.txt", bin)], "blank-line")).toThrow(
      InputValidationError,
    );
    expect(() => mergeTexts([file("a.txt", "ok"), file("photo.txt", bin)], "blank-line")).toThrow(
      /photo\.txt/,
    );
  });

  it("refuses a file with NUL bytes even when it decodes as UTF-8", () => {
    const nul = Buffer.from("PK\u0000\u0000archive", "utf8");
    expect(() => mergeTexts([file("a.txt", "ok"), file("notes.txt", nul)], "blank-line")).toThrow(
      /notes\.txt is not a text file/,
    );
  });

  it("refuses a file that is not valid UTF-8", () => {
    const latin1 = Buffer.from([0x63, 0x61, 0x66, 0xe9]);
    expect(() => mergeTexts([file("a.txt", "ok"), file("cafe.txt", latin1)], "blank-line")).toThrow(
      /cafe\.txt.*UTF-8/,
    );
  });

  it("needs at least two files", () => {
    expect(() => mergeTexts([file("a.txt", "a")], "blank-line")).toThrow(InputValidationError);
  });
});
