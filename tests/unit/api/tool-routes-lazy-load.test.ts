import { apiToolPath } from "@snapotter/shared";
import { eq } from "drizzle-orm";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { registerToolRoutes } from "../../../apps/api/src/routes/tools/index.js";

// A module loads once per file, so this file holds only the lazy-load cases:
// the disabled boot must run before any boot that loads the module.
const loaded = vi.hoisted(() => new Set<string>());

vi.mock("../../../apps/api/src/routes/tools/vignette.js", async (importOriginal) => {
  loaded.add("vignette");
  return importOriginal();
});

async function bootWithDisabled(ids: string[]) {
  const value = JSON.stringify(ids);
  await db
    .insert(schema.settings)
    .values({ key: "disabledTools", value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: new Date() } });
  const app = Fastify();
  await registerToolRoutes(app);
  await app.ready();
  return app;
}

describe("tool routes lazy load (#4805)", () => {
  afterEach(async () => {
    await db.delete(schema.settings).where(eq(schema.settings.key, "disabledTools"));
  });

  it("does not import the module of a disabled tool", async () => {
    const app = await bootWithDisabled(["vignette"]);
    expect(app.hasRoute({ method: "POST", url: apiToolPath("vignette") })).toBe(false);
    expect(app.hasRoute({ method: "POST", url: apiToolPath("pixelate") })).toBe(true);
    expect(loaded.has("vignette")).toBe(false);
    await app.close();
  });

  it("imports and registers the tool once it is enabled", async () => {
    const app = await bootWithDisabled([]);
    expect(app.hasRoute({ method: "POST", url: apiToolPath("vignette") })).toBe(true);
    expect(loaded.has("vignette")).toBe(true);
    await app.close();
  });
});
