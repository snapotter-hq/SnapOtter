import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const source = readFileSync(resolve(root, "apps/api/src/index.ts"), "utf8");

describe("API graceful shutdown order", () => {
  it("drains BullMQ workers before force-stopping the Accurate OCR dispatcher", () => {
    const shutdownStart = source.indexOf("async function shutdown(signal: string)");
    const shutdownEnd = source.indexOf('process.on("SIGTERM"', shutdownStart);
    const shutdownSource = source.slice(shutdownStart, shutdownEnd);
    const closeWorkers = shutdownSource.indexOf("await closeWorkers();");
    const shutdownOcrDispatcher = shutdownSource.indexOf("shutdownOcrDispatcher");

    expect(shutdownStart).toBeGreaterThanOrEqual(0);
    expect(shutdownEnd).toBeGreaterThan(shutdownStart);
    expect(closeWorkers).toBeGreaterThanOrEqual(0);
    expect(shutdownOcrDispatcher).toBeGreaterThanOrEqual(0);
    expect(closeWorkers).toBeLessThan(shutdownOcrDispatcher);
  });
});
