import { describe, expect, it, vi } from "vitest";
import { runSiemForward } from "../../../apps/api/src/jobs/siem-forward.js";

const readSiemConfig = vi.hoisted(() => vi.fn());

vi.mock("@snapotter/enterprise", () => ({ isFeatureEnabled: () => false }));
vi.mock("../../../apps/api/src/routes/enterprise/siem.js", () => ({ readSiemConfig }));

describe("runSiemForward license gate", () => {
  it("returns before any DB read when the siem_forwarding feature is unlicensed", async () => {
    await expect(runSiemForward()).resolves.toBeUndefined();
    expect(readSiemConfig).not.toHaveBeenCalled();
  });
});
