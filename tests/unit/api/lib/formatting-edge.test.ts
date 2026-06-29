import { describe, expect, it } from "vitest";
import { sanitizeEventProperties } from "../../../../apps/api/src/lib/analytics-allowlist.js";
import { toSrt, toVtt } from "../../../../apps/api/src/lib/subtitle-format.js";

describe("subtitle timestamp edge formatting", () => {
  it("rounds millisecond overflow into the next second", () => {
    expect(toSrt([{ startS: 1.9996, endS: 3661.2344, text: "  rounded  " }])).toBe(
      "1\n00:00:02,000 --> 01:01:01,234\nrounded\n",
    );
  });

  it("clamps negative timestamps to zero in WebVTT output", () => {
    expect(toVtt([{ startS: -3.25, endS: 0.0044, text: "early" }])).toBe(
      "WEBVTT\n\n00:00:00.000 --> 00:00:00.004\nearly\n",
    );
  });
});

describe("analytics allowlist edge filtering", () => {
  it("keeps pipeline tool id arrays while dropping mixed arrays and nulls", () => {
    const out = sanitizeEventProperties("pipeline_executed", {
      tool_ids: ["resize", "compress"],
      status: "completed",
      file_count: null,
      step_count: ["not", 2],
      is_batch: true,
    });

    expect(out).toEqual({
      tool_ids: ["resize", "compress"],
      status: "completed",
      is_batch: true,
    });
  });

  it("drops allowlisted object-shaped values instead of serializing free-form data", () => {
    const out = sanitizeEventProperties("tool_used", {
      tool_id: "resize",
      error_code: { nested: "E_SECRET" },
      duration_ms: 42,
    });

    expect(out).toEqual({
      tool_id: "resize",
      duration_ms: 42,
    });
  });
});
