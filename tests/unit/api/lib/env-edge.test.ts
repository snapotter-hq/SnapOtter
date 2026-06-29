import { afterEach, describe, expect, it } from "vitest";
import {
  loadEnv,
  resolveConcurrency,
  resolveWorkerThreads,
} from "../../../../apps/api/src/lib/env.js";

const originalEnv = { ...process.env };

function restoreEnv(): void {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
}

function expectLoadEnvError(overrides: Record<string, string | undefined>, message: string): void {
  restoreEnv();
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  expect(() => loadEnv()).toThrow(message);
}

afterEach(() => {
  restoreEnv();
});

describe("loadEnv edge validation", () => {
  it("rejects S3 storage mode when required credentials are absent", () => {
    expectLoadEnvError(
      {
        STORAGE_MODE: "s3",
        S3_BUCKET: "",
        S3_ACCESS_KEY_ID: "",
        S3_SECRET_ACCESS_KEY: "",
      },
      "S3_BUCKET is required when STORAGE_MODE=s3",
    );
  });

  it("rejects enabled OIDC without issuer, client credentials, and external URL", () => {
    expectLoadEnvError(
      {
        OIDC_ENABLED: "true",
        OIDC_ISSUER_URL: "",
        OIDC_CLIENT_ID: "",
        OIDC_CLIENT_SECRET: "",
        EXTERNAL_URL: "",
      },
      "OIDC_ISSUER_URL is required when OIDC_ENABLED=true",
    );
  });

  it("rejects enabled SAML without IdP settings and external URL", () => {
    expectLoadEnvError(
      {
        SAML_ENABLED: "true",
        SAML_IDP_SSO_URL: "",
        SAML_IDP_CERTIFICATE: "",
        EXTERNAL_URL: "",
      },
      "SAML_IDP_SSO_URL is required when SAML_ENABLED=true",
    );
  });

  it("rejects malformed encryption keys before settings encryption is used", () => {
    expectLoadEnvError(
      {
        DATA_ENCRYPTION_KEY: "not-hex",
      },
      "DATA_ENCRYPTION_KEY must be a 64-character hex string",
    );
  });

  it("accepts valid encryption key material", () => {
    restoreEnv();
    process.env.DATA_ENCRYPTION_KEY = "a".repeat(64);
    process.env.DATA_ENCRYPTION_KEY_PREVIOUS = "b".repeat(64);

    const env = loadEnv();

    expect(env.DATA_ENCRYPTION_KEY).toBe("a".repeat(64));
    expect(env.DATA_ENCRYPTION_KEY_PREVIOUS).toBe("b".repeat(64));
  });
});

describe("worker sizing helpers", () => {
  it("honors explicit concurrency and thread overrides", () => {
    const env = loadEnv();

    expect(resolveConcurrency({ ...env, CONCURRENT_JOBS: 7 })).toBe(7);
    expect(resolveWorkerThreads({ ...env, MAX_WORKER_THREADS: 9 })).toBe(9);
  });

  it("falls back to at least two workers when overrides are zero", () => {
    const env = loadEnv();

    expect(resolveConcurrency({ ...env, CONCURRENT_JOBS: 0 })).toBeGreaterThanOrEqual(2);
    expect(resolveWorkerThreads({ ...env, MAX_WORKER_THREADS: 0 })).toBeGreaterThanOrEqual(2);
  });
});
