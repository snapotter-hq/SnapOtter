// Issue #871: the accelerated (huggingface_hub) bundle download emitted one
// progress frame before the transfer and one after it, so a multi-GB download
// sat at 2% for its whole duration. The UI extrapolated an ETA of hours from
// the frozen percent and the install watchdog killed slow-but-live transfers
// as "no progress for 20 minutes".
//
// The fakes and scenarios live in packages/ai/python/tests/hf_download_scenarios.py
// and are shared with the pytest file next to it. This spec is the CI gate:
// the runners have python3 but no pytest, so it spawns each scenario and
// asserts on the JSON record it prints.

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hasPython, pythonBin } from "../../helpers/python-gate.js";

const PYTHON_DIR = join(process.cwd(), "packages", "ai", "python");
const INSTALLER = join(PYTHON_DIR, "install_feature.py");
const SCENARIOS = join(PYTHON_DIR, "tests", "hf_download_scenarios.py");

interface ScenarioResult {
  ok: boolean;
  frames: Array<[number, string]>;
  seamRestored: boolean;
  archive: string | null;
}

function runScenario(name: string): ScenarioResult {
  const res = spawnSync(pythonBin as string, [SCENARIOS, INSTALLER, name], {
    encoding: "utf8",
    timeout: 20000,
  });
  if (res.status !== 0) throw new Error(`python3 failed for ${name}: ${res.stderr}`);
  return JSON.parse(res.stdout.trim()) as ScenarioResult;
}

/** The frames between the "starting" and "downloaded" frames: the transfer itself. */
function inFlight(frames: Array<[number, string]>): Array<[number, string]> {
  const start = frames.findIndex(([, stage]) => /accelerated/i.test(stage));
  const end = frames.findIndex(([, stage]) => stage.startsWith("Downloaded"));
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return frames.slice(start + 1, end);
}

describe.skipIf(!hasPython)("install_feature.py accelerated download progress (#871)", () => {
  it("reports bytes as moving-percent frames while the transfer is in flight", () => {
    const result = runScenario("inflight");
    expect(result.ok).toBe(true);
    expect(result.archive).toBe("archive");

    // Before the fix this slice was empty.
    const inflight = inFlight(result.frames);
    expect(inflight.length).toBeGreaterThanOrEqual(8);

    const percents = inflight.map(([percent]) => percent);
    expect(percents).toEqual([...percents].sort((a, b) => a - b));
    expect(Math.min(...percents)).toBeGreaterThanOrEqual(2);
    expect(Math.max(...percents)).toBeLessThanOrEqual(85);
    expect(percents[percents.length - 1]).toBeGreaterThanOrEqual(80);
    for (const [, stage] of inflight) expect(stage).toMatch(/^Downloading\.\.\. [0-9.]+ GB$/);

    // The seam is scoped to the download: the library's class comes back.
    expect(result.seamRestored).toBe(true);
  });

  it("throttles frames by bytes so a transfer does not flood the progress store", () => {
    // 12 x 10 MiB with a frozen clock: only the 1st, 5th and 9th cross 32 MiB.
    const percents = inFlight(runScenario("throttle").frames).map(([percent]) => percent);
    expect(percents).toHaveLength(3);
    expect(percents).toEqual([...percents].sort((a, b) => a - b));
  });

  it("keeps a slow link alive by time when the byte threshold is never reached", () => {
    // 1 MiB updates 6 s apart: each one must frame or the watchdog sees a stall.
    expect(inFlight(runScenario("trickle").frames)).toHaveLength(8);
  });

  it("counts a resumed transfer from its offset", () => {
    // http_get hands tqdm initial=resume_size; 96 + 16 of 128 MiB is 87%.
    expect(inFlight(runScenario("resume").frames).map(([percent]) => percent)).toEqual([74]);
  });

  it("never frames without bytes, so a dead transfer still reads as stalled", () => {
    const result = runScenario("no_bytes");
    expect(result.ok).toBe(true);
    expect(inFlight(result.frames)).toEqual([]);
  });

  it("survives a reporter bug without losing the transfer", () => {
    const result = runScenario("reporter_raises");
    expect(result.ok).toBe(true);
    expect(result.archive).toBe("archive");
  });

  it("restores the seam when the transfer raises", () => {
    const result = runScenario("raises");
    expect(result.ok).toBe(false);
    expect(result.seamRestored).toBe(true);
  });

  for (const scenario of ["seam_missing", "not_a_class"]) {
    it(`declines a transfer it cannot watch (${scenario})`, () => {
      // A silent accelerated transfer is exactly what the watchdog kills, so
      // a client with no usable seam hands off to the sequential downloader.
      const result = runScenario(scenario);
      expect(result.ok).toBe(false);
      expect(result.archive).toBeNull();
      expect(result.seamRestored).toBe(true);
      expect(result.frames.some(([, stage]) => /cannot report progress/.test(stage))).toBe(true);
    });
  }
});
