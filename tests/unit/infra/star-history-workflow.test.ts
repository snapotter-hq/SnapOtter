import { readFileSync } from "node:fs";
import path from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

/**
 * The README embeds the star-history chart by raw URL off the `star-history`
 * branch, and the only thing that ever refreshes that branch is this workflow's
 * schedule. On a weekly cron the published chart sat seven days and 195 stars
 * behind the repo, which is what these assertions exist to stop.
 */

const root = path.resolve(import.meta.dirname, "../../..");

const CHART_URL =
  "https://raw.githubusercontent.com/snapotter-hq/SnapOtter/star-history/star-history.svg";

interface Workflow {
  on?: { schedule?: { cron?: string }[] };
  jobs?: Record<string, { steps?: { run?: string }[] }>;
}

function workflow(): Workflow {
  return load(
    readFileSync(path.join(root, ".github/workflows/star-history.yml"), "utf8"),
  ) as Workflow;
}

describe("star history workflow", () => {
  it("regenerates the chart every day", () => {
    const schedules = workflow().on?.schedule ?? [];
    expect(schedules.length).toBeGreaterThan(0);

    const daily = schedules.filter((entry) => {
      const fields = (entry.cron ?? "").trim().split(/\s+/);
      if (fields.length !== 5) return false;
      const [, , dayOfMonth, month, dayOfWeek] = fields;
      return dayOfMonth === "*" && month === "*" && dayOfWeek === "*";
    });

    expect(
      daily,
      `every cron field after the hour must be "*" so the chart refreshes daily, got ${schedules
        .map((entry) => entry.cron)
        .join(", ")}`,
    ).not.toHaveLength(0);
  });

  it("publishes to the branch the README embeds", () => {
    const commands = Object.values(workflow().jobs ?? {})
      .flatMap((job) => job.steps ?? [])
      .map((step) => step.run ?? "")
      .join("\n");

    expect(commands).toContain("HEAD:star-history");
    expect(readFileSync(path.join(root, "README.md"), "utf8")).toContain(CHART_URL);
  });
});
