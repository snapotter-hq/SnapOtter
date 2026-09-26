import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureRoot } from "../../fixtures/index.js";

/**
 * A QPDF_PATH that points at nothing is the operator's container, not the
 * caller's file (#1310). No doc-engine mock here: the real spawn has to come
 * back as a 503 naming the variable, and it has to do so both with the binary
 * spawned directly (errno from Node) and under the SUBPROCESS_MEMORY_LIMIT_MB
 * shim, where /bin/sh starts fine and only the exec inside it fails.
 */
const PDF = join(fixtureRoot, "document", "valid", "test-3page.pdf");
const SAVED = new Map<string, string | undefined>();

function setEnv(name: string, value: string | undefined): void {
  if (!SAVED.has(name)) SAVED.set(name, process.env[name]);
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  for (const [name, value] of SAVED) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  SAVED.clear();
  vi.resetModules();
});

/**
 * doc-engine resolves each binary once and caches it, so the override has to
 * be in place before a fresh module graph loads.
 */
async function freshValidator() {
  vi.resetModules();
  const { validatePdfPath } = await import("../../../apps/api/src/modality/document-input.js");
  return validatePdfPath;
}

describe("PDF validation when qpdf cannot be started", () => {
  it.each([
    ["off", undefined],
    ["on", "64"],
  ])("names QPDF_PATH with the memory limit %s", async (_label, limit) => {
    setEnv("QPDF_PATH", join(tmpdir(), "definitely-not-qpdf-1310"));
    setEnv("SUBPROCESS_MEMORY_LIMIT_MB", limit);
    const validatePdfPath = await freshValidator();

    const error = await validatePdfPath(PDF, { rejectPasswordProtected: true }).then(
      () => null,
      (caught: unknown) => caught,
    );

    // Shape, not instanceof: the fresh module graph holds its own error class.
    const failure = error as {
      name?: string;
      message: string;
      statusCode?: number;
      code?: string;
      details?: string;
    };
    expect(failure?.name, "a missing engine must still reject the request").toBe(
      "InputValidationError",
    );
    expect(failure.statusCode).toBe(503);
    expect(failure.code).toBe("ENGINE_UNAVAILABLE");
    expect(failure.details).toContain("QPDF_PATH");
    expect(failure.message).not.toMatch(/damaged/i);
  });
});
