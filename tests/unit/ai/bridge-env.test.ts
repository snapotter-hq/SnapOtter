import { afterEach, describe, expect, it } from "vitest";
import { buildMinimalEnv } from "../../../packages/ai/src/bridge.js";

const modelDownloadEnvKey = "SNAPOTTER_ALLOW_MODEL_DOWNLOAD";
const originalAllowModelDownload = process.env[modelDownloadEnvKey];

function setModelDownloadPolicy(value?: string): void {
  if (value === undefined) delete process.env[modelDownloadEnvKey];
  else process.env[modelDownloadEnvKey] = value;
}

afterEach(() => {
  setModelDownloadPolicy(originalAllowModelDownload);
});

describe("AI sidecar model download policy", () => {
  it("defaults the runtime sidecar to strict offline mode", () => {
    setModelDownloadPolicy();

    expect(buildMinimalEnv()).toMatchObject({
      SNAPOTTER_ALLOW_MODEL_DOWNLOAD: "0",
      HF_HUB_OFFLINE: "1",
      TRANSFORMERS_OFFLINE: "1",
    });
  });

  it("allows an explicit model download opt-in", () => {
    setModelDownloadPolicy("1");

    const env = buildMinimalEnv();
    expect(env.SNAPOTTER_ALLOW_MODEL_DOWNLOAD).toBe("1");
    expect(env.HF_HUB_OFFLINE).toBeUndefined();
    expect(env.TRANSFORMERS_OFFLINE).toBeUndefined();
  });

  it("keeps unknown policy values fail-closed", () => {
    setModelDownloadPolicy("yes");

    expect(buildMinimalEnv()).toMatchObject({
      SNAPOTTER_ALLOW_MODEL_DOWNLOAD: "0",
      HF_HUB_OFFLINE: "1",
      TRANSFORMERS_OFFLINE: "1",
    });
  });
});
