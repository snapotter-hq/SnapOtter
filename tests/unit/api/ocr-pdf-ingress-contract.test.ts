import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const batchSource = readFileSync(resolve(root, "apps/api/src/routes/batch.ts"), "utf8");
const pipelineSource = readFileSync(resolve(root, "apps/api/src/routes/pipeline.ts"), "utf8");

function between(source: string, start: string, end?: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = end ? source.indexOf(end, startIndex + start.length) : source.length;
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe("OCR PDF route streaming contract", () => {
  it("keeps the tool batch OCR-PDF branch path-backed while retaining buffered non-OCR files", () => {
    expect(batchSource).toMatch(
      /if \(toolId === "ocr-pdf"\)[\s\S]*spoolMultipartFile[\s\S]*else \{[\s\S]*Buffer\.concat\(chunks\)/,
    );
    expect(batchSource).toContain("storeValidatedOcrPdf");
  });

  it("spools execute-pipeline multipart input and never buffers OCR-PDF validation", () => {
    const executeRoute = between(
      pipelineSource,
      '"/api/v1/pipeline/execute"',
      '"/api/v1/pipeline/save"',
    );
    expect(executeRoute).toContain("spoolMultipartFile");
    expect(executeRoute).not.toContain("Buffer.concat(chunks)");
    expect(executeRoute).toContain("storeValidatedOcrPdf");
    expect(executeRoute).not.toMatch(
      /inputHandlerFor\([\s\S]{0,300}rejectPasswordProtected: firstToolId === "ocr-pdf"/,
    );
  });

  it("spools batch-pipeline multipart inputs and takes the OCR-PDF path branch", () => {
    const batchRoute = between(pipelineSource, '"/api/v1/pipeline/batch"');
    expect(batchRoute).toContain("spoolMultipartFile");
    expect(batchRoute).not.toContain("Buffer.concat(chunks)");
    expect(batchRoute).toContain("storeValidatedOcrPdf");
    expect(batchRoute).not.toMatch(/inputHandlerFor\([\s\S]{0,300}resolvedToolId === "ocr-pdf"/);
  });
});
