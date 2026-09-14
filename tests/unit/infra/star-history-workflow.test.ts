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

/** Cover for a run GitHub delays or drops, so one bad slot never costs a day. */
const MIN_GAP_MINUTES = 6 * 60;

interface Workflow {
  on?: { schedule?: { cron?: string }[] };
  jobs?: Record<string, { steps?: { run?: string }[] }>;
}

function workflow(): Workflow {
  return load(
    readFileSync(path.join(root, ".github/workflows/star-history.yml"), "utf8"),
  ) as Workflow;
}

function crons(): string[] {
  return (workflow().on?.schedule ?? []).map((entry) => entry.cron ?? "");
}

/** Plain integers only, list form included, so "5,17" counts as two hours. */
function fixedValues(field: string): number[] {
  return field
    .split(",")
    .filter((part) => /^\d+$/.test(part))
    .map(Number);
}

/** Minutes past midnight UTC for every run the schedule fires on every day. */
function dailyRunTimes(): number[] {
  const times: number[] = [];

  for (const cron of crons()) {
    const fields = cron.trim().split(/\s+/);
    if (fields.length !== 5) continue;
    const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
    if (dayOfMonth !== "*" || month !== "*" || dayOfWeek !== "*") continue;

    for (const h of fixedValues(hour)) {
      for (const m of fixedValues(minute)) times.push(h * 60 + m);
    }
  }

  return times.sort((a, b) => a - b);
}

describe("star history workflow", () => {
  it("regenerates the chart every day", () => {
    expect(
      dailyRunTimes(),
      `every cron field after the hour must be "*" so the chart refreshes daily, got ${crons().join(", ")}`,
    ).not.toHaveLength(0);
  });

  it("keeps a spare run far enough from the first to cover a dropped one", () => {
    const times = dailyRunTimes();
    expect(times.length, `expected two daily runs, got ${crons().join(", ")}`).toBeGreaterThan(1);

    const gaps = times.map((time, i) => (times[(i + 1) % times.length] - time + 1440) % 1440);
    expect(
      Math.min(...gaps),
      `daily runs must sit at least ${MIN_GAP_MINUTES} minutes apart to be real cover, got ${crons().join(", ")}`,
    ).toBeGreaterThanOrEqual(MIN_GAP_MINUTES);
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
