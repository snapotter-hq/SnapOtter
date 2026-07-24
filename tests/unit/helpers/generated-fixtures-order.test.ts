import { beforeEach, describe, expect, it, vi } from "vitest";

const entries = vi.hoisted(() => ["z-last.png", "a-first.png", "m-middle.png"]);

vi.mock("node:fs", () => ({
  existsSync: () => true,
  readdirSync: () => [...entries],
}));

import { buildGeneratedFixtureIndex } from "../../helpers/generated-fixtures.js";

describe("generated fixture ordering", () => {
  beforeEach(() => {
    entries.splice(0, entries.length, "z-last.png", "a-first.png", "m-middle.png");
  });

  it("sorts filesystem discovery deterministically", () => {
    const fixtures = buildGeneratedFixtureIndex(["/fixtures"]);

    expect(fixtures.get(".png")?.map(({ filename }) => filename)).toEqual([
      "a-first.png",
      "m-middle.png",
      "z-last.png",
    ]);
  });
});
