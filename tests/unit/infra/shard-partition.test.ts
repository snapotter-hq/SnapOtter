import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { costOf, FILE_COST_SECONDS, partitionByCost } from "../../helpers/shard-partition.js";

const repoRoot = path.resolve(__dirname, "../../..");

/** Every integration spec on disk, repo-relative, sorted. Mirrors the CI glob. */
function integrationSpecs(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".test.ts")) out.push(path.relative(repoRoot, full));
    }
  };
  walk(path.join(repoRoot, "tests/integration"));
  return out.sort();
}

/**
 * The four costliest specs, read from the table rather than hardcoded so this
 * survives specs being split, renamed, or reweighted.
 */
const HEAVYWEIGHTS = Object.entries(FILE_COST_SECONDS)
  .sort(([, a], [, b]) => b - a)
  .slice(0, 4)
  .map(([file]) => file);

describe("partitionByCost", () => {
  // The whole point of the helper: a shard must never silently drop a spec.
  // These two invariants are what make the CI change coverage-neutral.
  describe("partition is total and disjoint", () => {
    it("places every input file in exactly one bin", () => {
      const files = integrationSpecs();
      const bins = partitionByCost(files, 4);
      const flat = bins.flat();

      expect(flat.slice().sort()).toEqual(files.slice().sort());
      expect(new Set(flat).size).toBe(files.length);
    });

    it("holds for shard counts 1 through 8", () => {
      const files = integrationSpecs();
      for (let count = 1; count <= 8; count++) {
        const flat = partitionByCost(files, count).flat();
        expect(new Set(flat).size, `count=${count} lost or duplicated a file`).toBe(files.length);
        expect(flat.slice().sort(), `count=${count} changed the file set`).toEqual(
          files.slice().sort(),
        );
      }
    });

    it("returns exactly `count` bins even when files are scarce", () => {
      expect(partitionByCost(["a.test.ts", "b.test.ts"], 4)).toHaveLength(4);
      expect(partitionByCost([], 4)).toHaveLength(4);
      expect(partitionByCost([], 4).flat()).toEqual([]);
    });
  });

  // Each shard is a separate vitest process computing the partition
  // independently, so all of them must agree or specs get run twice or never.
  describe("determinism across processes", () => {
    it("is stable across repeated calls", () => {
      const files = integrationSpecs();
      expect(partitionByCost(files, 4)).toEqual(partitionByCost(files, 4));
    });

    it("ignores input ordering", () => {
      const files = integrationSpecs();
      const shuffled = files.slice().reverse();
      expect(partitionByCost(shuffled, 4)).toEqual(partitionByCost(files, 4));
    });
  });

  describe("balance", () => {
    it("splits the four heavyweight matrix specs across different bins", () => {
      const bins = partitionByCost(integrationSpecs(), 4);
      const landedIn = HEAVYWEIGHTS.map((h) => bins.findIndex((b) => b.includes(h)));

      expect(landedIn).not.toContain(-1);
      expect(new Set(landedIn).size).toBe(HEAVYWEIGHTS.length);
    });

    it("keeps the costliest bin within 25% of the ideal share", () => {
      const files = integrationSpecs();
      const bins = partitionByCost(files, 4);
      const cost = (b: string[]) => b.reduce((sum, f) => sum + costOf(f), 0);
      const ideal = cost(files) / 4;
      const heaviest = Math.max(...bins.map(cost));

      // A spec is never split, so the floor is the single costliest file.
      const floor = Math.max(ideal, ...files.map(costOf));
      expect(heaviest).toBeLessThanOrEqual(floor * 1.25);
    });
  });

  describe("costOf", () => {
    it("returns the measured cost for every listed spec", () => {
      for (const [file, seconds] of Object.entries(FILE_COST_SECONDS)) {
        expect(costOf(file)).toBe(seconds);
      }
    });

    it("falls back to a default for unmeasured specs", () => {
      expect(costOf("tests/integration/does/not/exist.test.ts")).toBeGreaterThan(0);
    });

    it("matches regardless of leading slash or absolute prefix", () => {
      const known = HEAVYWEIGHTS[0];
      expect(costOf(`/${known}`)).toBe(costOf(known));
      expect(costOf(path.join(repoRoot, known))).toBe(costOf(known));
    });
  });

  describe("cost table hygiene", () => {
    it("only lists specs that still exist", () => {
      const onDisk = new Set(integrationSpecs());
      const stale = Object.keys(FILE_COST_SECONDS).filter((f) => !onDisk.has(f));
      expect(stale, `cost table references deleted specs: ${stale.join(", ")}`).toEqual([]);
    });
  });
});
