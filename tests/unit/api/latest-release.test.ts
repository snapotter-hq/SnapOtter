// @vitest-environment node
import { APP_VERSION } from "@snapotter/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const gate = vi.hoisted(() => ({ enabled: true }));
const getFlagPayload = vi.hoisted(() => vi.fn());

vi.mock("../../../apps/api/src/lib/analytics-gate.js", () => ({
  analyticsEnabled: () => gate.enabled,
}));
vi.mock("../../../apps/api/src/lib/analytics.js", () => ({ getFlagPayload }));

import {
  getNewerRelease,
  resetLatestReleaseCache,
} from "../../../apps/api/src/lib/latest-release.js";

function bump(version: string): string {
  const [major, minor] = version.split(".").map(Number);
  return `${major}.${minor + 1}.0`;
}

const NEWER = bump(APP_VERSION);
const URL_OK = `https://github.com/snapotter-hq/SnapOtter/releases/tag/v${NEWER}`;

beforeEach(() => {
  gate.enabled = true;
  getFlagPayload.mockReset();
  resetLatestReleaseCache();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getNewerRelease", () => {
  it("makes no PostHog lookup when analytics is off", async () => {
    gate.enabled = false;
    expect(await getNewerRelease()).toBeNull();
    expect(getFlagPayload).not.toHaveBeenCalled();
  });

  it("returns a release newer than this instance", async () => {
    getFlagPayload.mockResolvedValue({ version: NEWER, url: URL_OK });
    expect(await getNewerRelease()).toEqual({ version: NEWER, url: URL_OK });
    expect(getFlagPayload).toHaveBeenCalledWith("latest-release");
  });

  it("returns null for the running version or an older one", async () => {
    getFlagPayload.mockResolvedValue({
      version: APP_VERSION,
      url: "https://github.com/snapotter-hq/SnapOtter/releases/",
    });
    expect(await getNewerRelease()).toBeNull();
  });

  it("ignores a payload that fails validation", async () => {
    getFlagPayload.mockResolvedValue({ version: NEWER, url: "https://example.com/" });
    expect(await getNewerRelease()).toBeNull();
  });

  it("caches the answer instead of asking PostHog on every request", async () => {
    getFlagPayload.mockResolvedValue({ version: NEWER, url: URL_OK });
    await Promise.all([getNewerRelease(), getNewerRelease()]);
    await getNewerRelease();
    expect(getFlagPayload).toHaveBeenCalledTimes(1);
  });

  it("asks again after a failed lookup's shorter cache expires", async () => {
    vi.useFakeTimers();
    getFlagPayload.mockResolvedValueOnce(null);
    expect(await getNewerRelease()).toBeNull();
    getFlagPayload.mockResolvedValueOnce({ version: NEWER, url: URL_OK });
    expect(await getNewerRelease()).toBeNull();
    vi.advanceTimersByTime(31 * 60 * 1000);
    expect(await getNewerRelease()).toEqual({ version: NEWER, url: URL_OK });
    expect(getFlagPayload).toHaveBeenCalledTimes(2);
  });

  it("drops the cached answer once analytics is turned off", async () => {
    getFlagPayload.mockResolvedValue({ version: NEWER, url: URL_OK });
    expect(await getNewerRelease()).not.toBeNull();
    gate.enabled = false;
    expect(await getNewerRelease()).toBeNull();
    gate.enabled = true;
    await getNewerRelease();
    expect(getFlagPayload).toHaveBeenCalledTimes(2);
  });
});
