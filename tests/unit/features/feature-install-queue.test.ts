import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearActive,
  dequeue,
  enqueue,
  getActiveBundleId,
  getQueuedBundleIds,
  isQueuedOrActive,
  peekQueue,
  resetQueueState,
  setActive,
} from "../../../apps/api/src/lib/feature-install-queue.js";

describe("feature-install-queue", () => {
  beforeEach(() => resetQueueState());
  afterEach(() => resetQueueState());

  it("starts empty", () => {
    expect(getActiveBundleId()).toBeNull();
    expect(getQueuedBundleIds()).toEqual([]);
    expect(peekQueue()).toBeNull();
  });

  it("enqueue appends and returns the new jobId", () => {
    const jobId = enqueue({ bundleId: "ocr", jobId: "job-1", mutationEpoch: "epoch-1" });
    expect(jobId).toBe("job-1");
    expect(getQueuedBundleIds()).toEqual(["ocr"]);
  });

  it("preserves FIFO order across multiple bundles", () => {
    enqueue({ bundleId: "ocr", jobId: "j1", mutationEpoch: "epoch-1" });
    enqueue({ bundleId: "face-detection", jobId: "j2", mutationEpoch: "epoch-1" });
    enqueue({ bundleId: "transcription", jobId: "j3", mutationEpoch: "epoch-1" });
    expect(getQueuedBundleIds()).toEqual(["ocr", "face-detection", "transcription"]);
  });

  it("dedups an already-queued bundle and returns the existing jobId", () => {
    enqueue({ bundleId: "ocr", jobId: "j1", mutationEpoch: "epoch-1" });
    const second = enqueue({ bundleId: "ocr", jobId: "j2-different", mutationEpoch: "epoch-1" });
    // No second entry added; the original job's id is returned so the client
    // attaches to the in-flight job instead of spawning a duplicate.
    expect(second).toBe("j1");
    expect(getQueuedBundleIds()).toEqual(["ocr"]);
  });

  it("refreshes a queued entry when a post-mutation request reauthorizes it", () => {
    enqueue({ bundleId: "ocr", jobId: "j1", mutationEpoch: "epoch-1" });

    const jobId = enqueue({ bundleId: "ocr", jobId: "j2", mutationEpoch: "epoch-2" });

    expect(jobId).toBe("j1");
    expect(peekQueue()).toEqual({
      bundleId: "ocr",
      jobId: "j1",
      mutationEpoch: "epoch-2",
    });
  });

  it("dedups against the active install and returns the active jobId", () => {
    setActive({ bundleId: "ocr", jobId: "active-job", mutationEpoch: "epoch-1" });
    const jobId = enqueue({
      bundleId: "ocr",
      jobId: "would-be-new",
      mutationEpoch: "epoch-1",
    });
    expect(jobId).toBe("active-job");
    // Active bundle is not added to the queue.
    expect(getQueuedBundleIds()).toEqual([]);
  });

  it("isQueuedOrActive is true for both queued and active bundles", () => {
    setActive({ bundleId: "ocr", jobId: "active", mutationEpoch: "epoch-1" });
    enqueue({ bundleId: "face-detection", jobId: "queued", mutationEpoch: "epoch-1" });
    expect(isQueuedOrActive("ocr")).toBe(true);
    expect(isQueuedOrActive("face-detection")).toBe(true);
    expect(isQueuedOrActive("transcription")).toBe(false);
  });

  it("peekQueue does not remove; dequeue removes the head", () => {
    enqueue({ bundleId: "ocr", jobId: "j1", mutationEpoch: "epoch-1" });
    enqueue({ bundleId: "face-detection", jobId: "j2", mutationEpoch: "epoch-1" });
    expect(peekQueue()).toEqual({ bundleId: "ocr", jobId: "j1", mutationEpoch: "epoch-1" });
    expect(getQueuedBundleIds()).toEqual(["ocr", "face-detection"]);
    expect(dequeue()).toEqual({ bundleId: "ocr", jobId: "j1", mutationEpoch: "epoch-1" });
    expect(getQueuedBundleIds()).toEqual(["face-detection"]);
  });

  it("getActiveBundleId reflects setActive / clearActive", () => {
    expect(getActiveBundleId()).toBeNull();
    setActive({ bundleId: "ocr", jobId: "j1", mutationEpoch: "epoch-1" });
    expect(getActiveBundleId()).toBe("ocr");
    clearActive();
    expect(getActiveBundleId()).toBeNull();
  });

  it("a bundle can be re-queued after it stops being active", () => {
    setActive({ bundleId: "ocr", jobId: "j1", mutationEpoch: "epoch-1" });
    clearActive();
    const jobId = enqueue({ bundleId: "ocr", jobId: "j2", mutationEpoch: "epoch-1" });
    expect(jobId).toBe("j2");
    expect(getQueuedBundleIds()).toEqual(["ocr"]);
  });
});
