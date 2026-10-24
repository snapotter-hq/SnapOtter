import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createUniqueNamer } from "../../../apps/api/src/lib/filename.js";
import { receiveUpload } from "../../../apps/api/src/lib/upload-stream.js";

const stored = new Map<string, Buffer>();
vi.mock("../../../apps/api/src/lib/object-storage.js", () => ({
  putObjectStream: async (key: string, stream: AsyncIterable<Buffer>) => {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    const data = Buffer.concat(chunks);
    stored.set(key, data);
    return data.length;
  },
}));
beforeEach(() => stored.clear());

describe("multipart upload name collisions", () => {
  it.each([
    ["document.pdf", "document.pdf"],
    ["document.pdf.exe", "document.pdf"],
    [`${"a".repeat(240)}.pdf`, `${"a".repeat(240)}.pdf`],
    ["song.pdf", "\u{017f}ong.pdf"],
    ["masse.pdf", "ma\u{00df}e.pdf"],
    ["post.pdf", "po\u{fb05}.pdf"],
    ["\u{03bf}\u{03c2}.pdf", "\u{03bf}\u{03c3}.pdf"],
    ["10\u{00b5}m.pdf", "10\u{03bc}m.pdf"],
    ["\u{0587}.pdf", "\u{0565}\u{0582}.pdf"],
  ])("preserves both streams for %s and %s", async (first, second) => {
    const uniqueName = createUniqueNamer();
    const upload = (filename: string, text: string) =>
      receiveUpload(
        {
          filename,
          file: Readable.from([Buffer.from(text)]),
        } as never,
        "job-1",
        { uniqueName },
      );
    const a = await upload(first, "first PDF");
    const b = await upload(second, "second PDF");
    expect(a.key).not.toBe(b.key);
    expect(a.key).toBe(`uploads/job-1/${a.filename}`);
    expect(b.key).toBe(`uploads/job-1/${b.filename}`);
    expect(stored.get(a.key)?.toString()).toBe("first PDF");
    expect(stored.get(b.key)?.toString()).toBe("second PDF");
    expect(b.filename).toMatch(/_1\.pdf$/);
  });
});
