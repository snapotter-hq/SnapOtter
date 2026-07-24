// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Contract assertions intentionally match GitHub Actions interpolation syntax.
import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");
const dockerfile = readFileSync(resolve(root, "docker/Dockerfile"), "utf8");
const testDockerfile = readFileSync(resolve(root, "docker/Dockerfile.test"), "utf8");
const releaseWorkflow = readFileSync(resolve(root, ".github/workflows/release.yml"), "utf8");
const writer = resolve(root, "docker/write-ocr-runtime-trust.mjs");
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function temporaryOutput(): string {
  const directory = mkdtempSync(join(tmpdir(), "snapotter-ocr-trust-"));
  temporaryDirectories.push(directory);
  return join(directory, "ocr-runtime-trust.json");
}

function runWriter(
  output: string,
  environment: Record<string, string>,
): ReturnType<typeof spawnSync> {
  return spawnSync(
    process.execPath,
    [
      writer,
      output,
      environment.OCR_RUNTIME_TRUST_ID ?? "",
      environment.OCR_RUNTIME_TRUST_PEM_B64 ?? "",
      environment.SNAPOTTER_OFFICIAL_CONTAINER ?? "0",
    ],
    {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
      },
    },
  );
}

describe("Docker BuildKit static-check policy", () => {
  it("bakes public OCR trust through validated, non-secret-named build arguments", () => {
    expect(dockerfile).toContain("ARG OCR_RUNTIME_TRUST_ID=");
    expect(dockerfile).toContain("ARG OCR_RUNTIME_TRUST_PEM_B64=");
    expect(dockerfile).toContain("write-ocr-runtime-trust.mjs");
    expect(dockerfile).not.toMatch(/^(?:ARG|ENV)\s+OCR_RUNTIME_INDEX_KEY_ID=/m);
    expect(dockerfile).not.toMatch(/^(?:ARG|ENV)\s+OCR_RUNTIME_INDEX_PUBLIC_KEY_PEM_B64=/m);
    expect(releaseWorkflow).toContain("OCR_RUNTIME_TRUST_ID=${{ vars.OCR_RUNTIME_INDEX_KEY_ID }}");
    expect(releaseWorkflow).toContain(
      "OCR_RUNTIME_TRUST_PEM_B64=${{ vars.OCR_RUNTIME_INDEX_PUBLIC_KEY_PEM_B64 }}",
    );
  });

  it("does not bake disposable authentication settings into the test image", () => {
    expect(testDockerfile).not.toMatch(/^\s*(?:AUTH_ENABLED|DEFAULT_PASSWORD)=/m);
    expect(testDockerfile).not.toMatch(/^\s*DEFAULT_USERNAME=/m);
  });

  it("writes a canonical Ed25519 trust store for official images", () => {
    const output = temporaryOutput();
    const { publicKey } = generateKeyPairSync("ed25519");
    const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const result = runWriter(output, {
      OCR_RUNTIME_TRUST_ID: "release-2026-07",
      OCR_RUNTIME_TRUST_PEM_B64: Buffer.from(pem).toString("base64"),
      SNAPOTTER_OFFICIAL_CONTAINER: "1",
    });

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(JSON.parse(readFileSync(output, "utf8"))).toEqual({
      schemaVersion: 1,
      keys: [
        {
          keyId: "release-2026-07",
          algorithm: "ed25519",
          publicKey: pem,
        },
      ],
    });
    expect(readFileSync(output, "utf8").endsWith("\n")).toBe(true);
  });

  it("fails closed when official trust metadata is missing or invalid", () => {
    for (const environment of [
      { SNAPOTTER_OFFICIAL_CONTAINER: "1" },
      {
        SNAPOTTER_OFFICIAL_CONTAINER: "1",
        OCR_RUNTIME_TRUST_ID: "release-key",
      },
      {
        SNAPOTTER_OFFICIAL_CONTAINER: "1",
        OCR_RUNTIME_TRUST_ID: "../unsafe",
        OCR_RUNTIME_TRUST_PEM_B64: Buffer.from("not a public key").toString("base64"),
      },
    ]) {
      const output = temporaryOutput();
      const result = runWriter(output, environment);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("OCR runtime");
      expect(existsSync(output)).toBe(false);
    }
  });

  it("leaves source images unconfigured when no trust metadata is supplied", () => {
    const output = temporaryOutput();
    const result = runWriter(output, {
      SNAPOTTER_OFFICIAL_CONTAINER: "0",
    });

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(existsSync(output)).toBe(false);
  });
});
