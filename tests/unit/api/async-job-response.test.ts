import { describe, expect, it } from "vitest";
import { buildAsyncAcceptedPayload } from "../../../apps/api/src/routes/async-response.js";

describe("buildAsyncAcceptedPayload", () => {
  it("keeps legacy async shape when the progress and artifact IDs match", () => {
    expect(buildAsyncAcceptedPayload("job-123")).toEqual({
      jobId: "job-123",
      async: true,
    });
  });

  it("exposes both progress and artifact IDs when a client progress ID is supplied", () => {
    expect(buildAsyncAcceptedPayload("artifact-123", "progress-456")).toEqual({
      jobId: "progress-456",
      progressJobId: "progress-456",
      artifactJobId: "artifact-123",
      async: true,
    });
  });
});
