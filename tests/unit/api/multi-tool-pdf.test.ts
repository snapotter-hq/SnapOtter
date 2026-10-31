import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { qpdfAvailable, qpdfRotatePages, resolveQpdf } from "@snapotter/doc-engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolRouteConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerMultiToolPdf } from "../../../apps/api/src/routes/tools/multi-tool-pdf.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

let config: ToolRouteConfig<unknown>;
vi.mock("../../../apps/api/src/routes/tool-factory.js", () => ({
  createToolRoute: (_app: unknown, route: ToolRouteConfig<unknown>) => {
    config = route;
  },
}));

let scratchDir: string;
beforeEach(async () => {
  scratchDir = await mkdtemp(join(tmpdir(), "multi-tool-review-"));
  registerMultiToolPdf({} as never);
});
afterEach(async () => {
  await rm(scratchDir, { recursive: true, force: true });
});

type Item = { doc: number; page: number; rot?: 90 | 180 | 270 };
function processPlan(
  items: Item[],
  pageCounts = [3],
  buffers = [readFixture(fixtures.document.pdf3)],
) {
  if (!config.processV2) throw new Error("Missing v2 processor");
  return config.processV2({
    scratchDir,
    inputs: buffers.map((buffer, i) => ({ buffer, filename: `input-${i}.pdf`, ref: `input-${i}` })),
    settings: { items, pageCounts },
    signal: new AbortController().signal,
    report: vi.fn(),
  });
}

// Inspect page content as well as count: a three-page output can still have
// the wrong source pages or apply a rotation to the wrong duplicate.
function inspect(path: string) {
  const bin = resolveQpdf();
  if (!bin) throw new Error("qpdf required");
  const json = JSON.parse(
    execFileSync(bin, ["--json", "--json-stream-data=inline", path], { encoding: "utf8" }),
  );
  const objects = json.qpdf[1];
  return json.pages.map((page: { object: string; contents: string[] }) => ({
    rotation: objects[`obj:${page.object}`].value["/Rotate"] ?? 0,
    content: page.contents.map((ref) => objects[`obj:${ref}`].stream.data).join("\n"),
  })) as { rotation: number; content: string }[];
}

describe("multi-tool-pdf plan validation", () => {
  it("rejects a rotated page outside the declared count before invoking qpdf", async () => {
    await expect(processPlan([{ doc: 0, page: 9, rot: 90 }])).rejects.toMatchObject({
      statusCode: 400,
    });
  });
  it("rejects a missing source document", async () => {
    await expect(processPlan([{ doc: 1, page: 1, rot: 90 }])).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

describe.skipIf(!qpdfAvailable())("multi-tool-pdf output semantics (real qpdf)", () => {
  it("rotates each output copy independently and composes existing rotation", async () => {
    const source = join(scratchDir, "source.pdf");
    const rotated = join(scratchDir, "source-rotated.pdf");
    await writeFile(source, readFixture(fixtures.document.pdf3));
    await qpdfRotatePages(source, [{ page: 1, angle: 90 }], rotated);
    const result = await processPlan(
      [
        { doc: 0, page: 1, rot: 90 },
        { doc: 0, page: 1 },
        { doc: 0, page: 1, rot: 180 },
        { doc: 0, page: 2 },
      ],
      [3],
      [await readFile(rotated)],
    );
    expect(inspect(result.scratchPath as string).map((page) => page.rotation)).toEqual([
      180, 90, 270, 0,
    ]);
  });

  it("preserves interleaved source order and duplicates", async () => {
    const a = inspect(fixtures.document.pdf3);
    const b = inspect(fixtures.document.pdf2);
    const result = await processPlan(
      [
        { doc: 0, page: 3 },
        { doc: 1, page: 2 },
        { doc: 0, page: 1 },
        { doc: 0, page: 1 },
      ],
      [3, 2],
      [readFixture(fixtures.document.pdf3), readFixture(fixtures.document.pdf2)],
    );
    expect(inspect(result.scratchPath as string)).toEqual([a[2], b[1], a[0], a[0]]);
  });

  it("rejects a forged page count with a client error", async () => {
    await expect(processPlan([{ doc: 0, page: 9 }], [99])).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
