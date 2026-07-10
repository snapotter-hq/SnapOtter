// tests/unit/scripts/i18n/docs-md.test.ts
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createDocsAdapter } from "../../../../scripts/i18n/adapters/docs-md.mjs";

let root: string;

async function seed(rel: string, body: string) {
  const abs = join(root, rel);
  await mkdir(join(abs, ".."), { recursive: true });
  await writeFile(abs, body, "utf8");
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "docs-i18n-"));
});

describe("docs-md adapter", () => {
  it("extracts one unit per root markdown file, keyed by relative path", async () => {
    await seed(
      "guide/getting-started.md",
      "---\ndescription: Install it\n---\n# Getting Started\n\nHi.",
    );
    await seed("index.md", "---\nlayout: page\n---\n# Home\n");
    const adapter = createDocsAdapter({ root });
    const units = await adapter.extract();
    const ids = units.map((u) => u.id).sort();
    expect(ids).toEqual(["guide/getting-started.md", "index.md"]);
    expect(units[0].kind).toBe("markdown");
  });

  it("injects stable explicit anchors into English headings, idempotently", async () => {
    await seed("guide/x.md", "# Getting Started\n\n## Quick Start\n\n## Already {#pinned}\n");
    const adapter = createDocsAdapter({ root });
    await adapter.extract();
    const onDisk = await readFile(join(root, "guide/x.md"), "utf8");
    expect(onDisk).toContain("# Getting Started {#getting-started}");
    expect(onDisk).toContain("## Quick Start {#quick-start}");
    expect(onDisk).toContain("## Already {#pinned}"); // untouched
    // Running extract again does not double-anchor.
    await adapter.extract();
    const again = await readFile(join(root, "guide/x.md"), "utf8");
    expect(again).toBe(onDisk);
  });

  it("de-duplicates repeated heading slugs like markdown-it-anchor (-1, -2)", async () => {
    await seed(
      "guide/z.md",
      "## Example Request\n\ntext\n\n## Example Request\n\nmore\n\n## Example Request\n",
    );
    const adapter = createDocsAdapter({ root });
    await adapter.extract();
    const onDisk = await readFile(join(root, "guide/z.md"), "utf8");
    expect(onDisk).toContain("## Example Request {#example-request}");
    expect(onDisk).toContain("## Example Request {#example-request-1}");
    expect(onDisk).toContain("## Example Request {#example-request-2}");
  });

  it("does not treat fenced # lines as headings", async () => {
    await seed("guide/y.md", "# Real Heading\n\n```bash\n# not a heading\n```\n");
    const adapter = createDocsAdapter({ root });
    await adapter.extract();
    const onDisk = await readFile(join(root, "guide/y.md"), "utf8");
    expect(onDisk).toContain("# Real Heading {#real-heading}");
    expect(onDisk).toContain("# not a heading\n"); // still inside the fence, no anchor
    expect(onDisk).not.toContain("# not a heading {#");
  });

  it("write persists translated body under the locale path with the source hash", async () => {
    await seed(
      "guide/x.md",
      "---\ndescription: Install it\n---\n# Getting Started {#getting-started}\n\nHi.",
    );
    const adapter = createDocsAdapter({ root });
    const units = await adapter.extract();
    const entry = {
      text: units[0].sourceText.replace("Hi.", "Hallo."),
      sourceHash: "abc123def456",
      provenance: "machine" as const,
      outputHash: "0".repeat(12),
      stale: false,
    };
    await adapter.write("de", new Map([[units[0].id, entry]]));
    const out = await readFile(join(root, "de/guide/x.md"), "utf8");
    expect(out).toContain("i18n_source_hash: abc123def456");
    expect(out).toContain("{#getting-started}"); // anchor restored intact
    expect(out).not.toContain("i18n_fallback");
  });

  it("write rewrites internal links to the locale path", async () => {
    await seed("guide/x.md", "# X {#x}\n");
    const adapter = createDocsAdapter({ root });
    const units = await adapter.extract();
    const entry = {
      text: `${units[0].sourceText}\n\nSee [Config](/guide/configuration#embedded-mode) and [ext](https://example.test/guide/x).`,
      sourceHash: "hash00000001",
      provenance: "machine" as const,
      outputHash: "0".repeat(12),
      stale: false,
    };
    await adapter.write("de", new Map([[units[0].id, entry]]));
    const out = await readFile(join(root, "de/guide/x.md"), "utf8");
    expect(out).toContain("[Config](/de/guide/configuration#embedded-mode)");
    expect(out).toContain("[ext](https://example.test/guide/x)"); // external untouched
  });

  it("load reads back a StoredEntry from a translated file's frontmatter", async () => {
    await seed("guide/x.md", "# X {#x}\n");
    await mkdir(join(root, "de/guide"), { recursive: true });
    await writeFile(
      join(root, "de/guide/x.md"),
      "---\ni18n_source_hash: abc123def456\ni18n_provenance: human\n---\n# Iks {#x}\n",
      "utf8",
    );
    const adapter = createDocsAdapter({ root });
    const stored = await adapter.load("de");
    const e = stored.get("guide/x.md");
    expect(e?.sourceHash).toBe("abc123def456");
    expect(e?.provenance).toBe("human");
    expect(e?.text).toContain("# Iks {#x}");
  });

  it("writeFallback emits an English copy flagged for a missing translation", async () => {
    await seed("guide/x.md", "---\ndescription: Install it\n---\n# X {#x}\n\nBody.");
    const adapter = createDocsAdapter({ root });
    await adapter.extract();
    await adapter.writeFallback("de", "guide/x.md");
    const out = await readFile(join(root, "de/guide/x.md"), "utf8");
    expect(out).toContain("i18n_fallback: true");
    expect(out).toContain("# X {#x}"); // English content preserved
  });

  it("docs pre-mask hides ::: markers and [[toc]] but keeps the container title translatable", async () => {
    await seed("guide/x.md", "# X {#x}\n\n::: tip Try before installing\nBody.\n:::\n\n[[toc]]\n");
    const adapter = createDocsAdapter({ root });
    const units = await adapter.extract();
    const src = units[0].sourceText;
    expect(src).not.toContain(":::");
    expect(src).not.toContain("[[toc]]");
    expect(src).toContain("Try before installing"); // title label stays for the model
  });
});

import { quoteFrontmatterScalars } from "../../../../scripts/i18n/adapters/docs-md.mjs";

describe("quoteFrontmatterScalars", () => {
  it("quotes a bare description containing a colon", () => {
    const out = quoteFrontmatterScalars(
      "---\ndescription: Formats: over 55 inputs\ni18n_source_hash: abc\n---\nBody",
    );
    expect(out).toContain('description: "Formats: over 55 inputs"');
    expect(out).toContain("i18n_source_hash: abc");
    expect(out).toContain("Body");
  });

  it("leaves already-quoted and non-target values untouched", () => {
    const src = '---\ntitle: "Already quoted: x"\ni18n_source_hash: abc\n---\nBody';
    expect(quoteFrontmatterScalars(src)).toBe(src);
  });

  it("escapes embedded double quotes", () => {
    const out = quoteFrontmatterScalars('---\ndescription: say "hi" now\n---\nB');
    expect(out).toContain('description: "say \\"hi\\" now"');
  });
});
