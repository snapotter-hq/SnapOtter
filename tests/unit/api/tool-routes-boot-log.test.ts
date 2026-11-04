import { apiToolPath, CONVERSION_PRESETS, TOOLS } from "@snapotter/shared";
import { eq } from "drizzle-orm";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { logger } from "../../../apps/api/src/lib/logger.js";
import { registerToolRoutes } from "../../../apps/api/src/routes/tools/index.js";

describe("tool routes boot log", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await db.delete(schema.settings).where(eq(schema.settings.key, "disabledTools"));
  });

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

  it("logs a warning and falls back to [] when disabledTools setting is malformed JSON (#3084)", async () => {
    const warnSpy = vi.spyOn(logger, "warn");
    await db
      .insert(schema.settings)
      .values({ key: "disabledTools", value: "{corrupt" })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: "{corrupt", updatedAt: new Date() },
      });

    const app = Fastify({ logger: true });
    const infoSpy = vi.spyOn(app.log, "info");

    await registerToolRoutes(app);
    await app.close();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(SyntaxError), key: "disabledTools" }),
      "tools: failed to parse stored disabledTools JSON",
    );

    const experimentalCount = TOOLS.filter((t) => t.experimental).length;
    const bootLine = infoSpy.mock.calls
      .map((call) => String(call[0]))
      .find((line) => line.startsWith("Tool routes:"));
    const skipped = Number(bootLine?.match(/(\d+) skipped/)?.[1]);
    expect(skipped).toBe(experimentalCount);
  });

  it("logs a warning and falls back to [] when disabledTools setting is non-array or non-string-array JSON (#3084)", async () => {
    const warnSpy = vi.spyOn(logger, "warn");
    const experimentalCount = TOOLS.filter((t) => t.experimental).length;

    for (const raw of [
      "{}",
      "null",
      "42",
      '"resize"',
      "[null]",
      "[42]",
      "[{}]",
      '["resize", 42]',
    ]) {
      warnSpy.mockClear();
      await db
        .insert(schema.settings)
        .values({ key: "disabledTools", value: raw })
        .onConflictDoUpdate({
          target: schema.settings.key,
          set: { value: raw, updatedAt: new Date() },
        });

      const app = Fastify({ logger: true });
      const infoSpy = vi.spyOn(app.log, "info");

      await registerToolRoutes(app);
      await app.close();

      expect(warnSpy, raw).toHaveBeenCalledTimes(1);
      expect(warnSpy, raw).toHaveBeenCalledWith(
        { key: "disabledTools" },
        "tools: stored disabledTools is not a JSON array of strings",
      );

      const bootLine = infoSpy.mock.calls
        .map((call) => String(call[0]))
        .find((line) => line.startsWith("Tool routes:"));
      const skipped = Number(bootLine?.match(/(\d+) skipped/)?.[1]);
      expect(skipped, raw).toBe(experimentalCount);
    }

    warnSpy.mockClear();
    await db
      .insert(schema.settings)
      .values({ key: "disabledTools", value: "" })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: "", updatedAt: new Date() },
      });

    const emptyApp = Fastify({ logger: true });
    const emptyInfoSpy = vi.spyOn(emptyApp.log, "info");
    await registerToolRoutes(emptyApp);
    await emptyApp.close();
    expect(warnSpy).not.toHaveBeenCalled();
    const emptyBootLine = emptyInfoSpy.mock.calls
      .map((call) => String(call[0]))
      .find((line) => line.startsWith("Tool routes:"));
    expect(Number(emptyBootLine?.match(/(\d+) skipped/)?.[1])).toBe(experimentalCount);

    await db
      .insert(schema.settings)
      .values({ key: "disabledTools", value: JSON.stringify(["resize"]) })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: JSON.stringify(["resize"]), updatedAt: new Date() },
      });

    const validApp = Fastify({ logger: true });
    const validInfoSpy = vi.spyOn(validApp.log, "info");
    await registerToolRoutes(validApp);
    await validApp.close();
    expect(warnSpy).not.toHaveBeenCalled();
    const validBootLine = validInfoSpy.mock.calls
      .map((call) => String(call[0]))
      .find((line) => line.startsWith("Tool routes:"));
    expect(Number(validBootLine?.match(/(\d+) skipped/)?.[1])).toBe(experimentalCount + 1);
  });

  describe("disabledTools covers conversion presets (#4288)", () => {
    async function bootWithDisabled(ids: string[]) {
      const value = JSON.stringify(ids);
      await db
        .insert(schema.settings)
        .values({ key: "disabledTools", value })
        .onConflictDoUpdate({
          target: schema.settings.key,
          set: { value, updatedAt: new Date() },
        });
      const app = Fastify({ logger: true });
      await registerToolRoutes(app);
      await app.ready();
      return app;
    }

    const hasRoute = (app: ReturnType<typeof Fastify>, id: string) =>
      app.hasRoute({ method: "POST", url: apiToolPath(id) });

    it("registers every preset route when nothing is disabled", async () => {
      const app = await bootWithDisabled([]);
      expect(hasRoute(app, "heic-to-jpg")).toBe(true);
      for (const base of ["image-to-pdf", "pdf-to-image", "svg-to-raster"]) {
        const preset = CONVERSION_PRESETS.find((p) => p.base === base);
        expect(hasRoute(app, preset?.id ?? ""), base).toBe(true);
      }
      await app.close();
    });

    it("drops a preset whose own id is disabled and keeps its siblings", async () => {
      const app = await bootWithDisabled(["heic-to-jpg"]);
      expect(hasRoute(app, "heic-to-jpg")).toBe(false);
      expect(hasRoute(app, "heic-to-png")).toBe(true);
      await app.close();
    });

    it.each(["image-to-pdf", "pdf-to-image", "svg-to-raster"])(
      "drops every preset of the %s base when the base is disabled",
      async (base) => {
        const app = await bootWithDisabled([base]);
        const presets = CONVERSION_PRESETS.filter((p) => p.base === base);
        expect(presets.length).toBeGreaterThan(0);
        for (const preset of presets) {
          expect(hasRoute(app, preset.id), preset.id).toBe(false);
        }
        await app.close();
      },
    );

    it("drops registry presets and compress presets when their base is disabled", async () => {
      // The tool registry is module-level and never cleared, so populate it first:
      // otherwise a missing-base fallback would make this pass without the fix.
      await (await bootWithDisabled([])).close();
      const app = await bootWithDisabled(["convert", "compress"]);
      expect(hasRoute(app, "heic-to-jpg")).toBe(false);
      expect(hasRoute(app, "compress-image-to-100kb")).toBe(false);
      await app.close();
    });

    it("counts policy-skipped presets in the boot line so active + skipped stays the total", async () => {
      const value = JSON.stringify(["heic-to-jpg"]);
      await db
        .insert(schema.settings)
        .values({ key: "disabledTools", value })
        .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: new Date() } });
      const app = Fastify({ logger: true });
      const infoSpy = vi.spyOn(app.log, "info");
      await registerToolRoutes(app);
      await app.close();
      const line = infoSpy.mock.calls
        .map((c) => String(c[0]))
        .find((l) => l.startsWith("Tool routes:"));
      const skipped = Number(line?.match(/(\d+) skipped/)?.[1]);
      const active = Number(line?.match(/Tool routes: (\d+) active/)?.[1]);
      const total = Number(line?.match(/\((\d+) total\)/)?.[1]);
      expect(skipped).toBe(TOOLS.filter((t) => t.experimental).length + 1);
      expect(active + skipped).toBe(total);
      expect(total).toBe(TOOLS.length);
    });
  });
});
