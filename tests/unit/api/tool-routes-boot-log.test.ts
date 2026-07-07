import { TOOLS } from "@snapotter/shared";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerToolRoutes } from "../../../apps/api/src/routes/tools/index.js";

describe("tool routes boot log", () => {
  it("reports the full active tool count, including conversion presets", async () => {
    const app = Fastify({ logger: true });
    const infoSpy = vi.spyOn(app.log, "info");

    await registerToolRoutes(app);
    await app.close();

    const bootLine = infoSpy.mock.calls
      .map((call) => String(call[0]))
      .find((line) => line.startsWith("Tool routes:"));

    expect(bootLine).toBeDefined();
    const active = Number(bootLine?.match(/Tool routes: (\d+) active/)?.[1]);
    const skipped = Number(bootLine?.match(/(\d+) skipped/)?.[1]);

    expect(active + skipped).toBe(TOOLS.length);
  });
});
