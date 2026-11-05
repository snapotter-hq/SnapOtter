import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildInstallerEnv,
  buildMinimalEnv,
  buildOfflineInstallerEnv,
} from "../../../packages/ai/src/bridge.js";

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

describe("bundle installer environment", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("drops secrets and application config from the API environment", () => {
    const secrets = {
      DATABASE_URL: "postgres://u:p@db/x",
      REDIS_URL: "redis://:p@cache",
      SESSION_SECRET: "s",
      S3_SECRET_ACCESS_KEY: "k",
      API_TOKEN: "t",
      ADMIN_PASSWORD: "pw",
      HF_TOKEN: "hf",
      SENTRY_DSN: "https://k@sentry.example/1",
      OTEL_EXPORTER_OTLP_HEADERS: "authorization=Bearer abc",
    };
    // Allowlisted mirrors may carry a _URL suffix; unset them so the suffix scan is host-independent.
    vi.stubEnv("PIP_INDEX_URL", undefined);
    vi.stubEnv("PIP_EXTRA_INDEX_URL", undefined);
    for (const [key, value] of Object.entries(secrets)) vi.stubEnv(key, value);

    const env = buildInstallerEnv();
    for (const key of Object.keys(secrets)) expect(env).not.toHaveProperty(key);
    for (const key of Object.keys(env)) {
      expect(key).not.toMatch(/(SECRET|TOKEN|PASSWORD|_KEY|_URL|_DSN)$/);
    }
  });

  it("keeps what the installer needs: paths, proxy, HF endpoint, install knobs", () => {
    vi.stubEnv("PYTHON_VENV_PATH", "/opt/venv");
    vi.stubEnv("DATA_DIR", "/data");
    vi.stubEnv("HTTPS_PROXY", "http://proxy:3128");
    vi.stubEnv("NO_PROXY", "localhost");
    vi.stubEnv("HF_ENDPOINT", "https://hf-mirror.example");
    vi.stubEnv("SSL_CERT_FILE", "/etc/ssl/ca.pem");
    vi.stubEnv("SNAPOTTER_SKIP_INSTALL_SMOKE", "1");

    expect(buildInstallerEnv({ BUNDLE_ID: "x" })).toMatchObject({
      PATH: process.env.PATH,
      PYTHON_VENV_PATH: "/opt/venv",
      DATA_DIR: "/data",
      HTTPS_PROXY: "http://proxy:3128",
      NO_PROXY: "localhost",
      HF_ENDPOINT: "https://hf-mirror.example",
      SSL_CERT_FILE: "/etc/ssl/ca.pem",
      SNAPOTTER_SKIP_INSTALL_SMOKE: "1",
      BUNDLE_ID: "x",
    });
  });

  it("is what a real child process sees", () => {
    vi.stubEnv("DATABASE_URL", "postgres://u:hunter2@db/x");
    const out = spawnSync(process.execPath, ["-e", "console.log(JSON.stringify(process.env))"], {
      env: buildInstallerEnv(),
      encoding: "utf-8",
    }).stdout;
    expect(out).not.toContain("hunter2");
    expect(JSON.parse(out)).not.toHaveProperty("DATABASE_URL");
  });
});

describe("offline bundle import environment", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const networkOnly: Record<string, string> = {
    HTTP_PROXY: "http://u:proxy-pw@proxy:3128",
    HTTPS_PROXY: "http://u:proxy-pw@proxy:3128",
    ALL_PROXY: "socks5://u:proxy-pw@proxy:1080",
    NO_PROXY: "localhost",
    http_proxy: "http://u:proxy-pw@proxy:3128",
    https_proxy: "http://u:proxy-pw@proxy:3128",
    all_proxy: "socks5://u:proxy-pw@proxy:1080",
    no_proxy: "localhost",
    PIP_INDEX_URL: "https://u:index-pw@pypi.example/simple",
    PIP_EXTRA_INDEX_URL: "https://u:index-pw@pypi.example/simple",
    PIP_TRUSTED_HOST: "pypi.example",
    PIP_CONFIG_FILE: "/etc/pip-with-credentials.conf",
  };

  it("drops proxy and pip index settings the online installer keeps", () => {
    for (const [key, value] of Object.entries(networkOnly)) vi.stubEnv(key, value);

    const online = buildInstallerEnv();
    const offline = buildOfflineInstallerEnv();
    for (const key of Object.keys(networkOnly)) {
      expect(online).toHaveProperty(key, networkOnly[key]);
      expect(offline).not.toHaveProperty(key);
    }
    expect(Object.values(offline).join("\n")).not.toContain("-pw@");
  });

  it("keeps CA bundles, paths and caller extras", () => {
    vi.stubEnv("SSL_CERT_FILE", "/etc/ssl/ca.pem");
    vi.stubEnv("REQUESTS_CA_BUNDLE", "/etc/ssl/ca.pem");
    vi.stubEnv("PIP_CERT", "/etc/ssl/ca.pem");
    vi.stubEnv("PYTHON_VENV_PATH", "/opt/venv");
    vi.stubEnv("HTTPS_PROXY", "http://proxy:3128");

    expect(buildOfflineInstallerEnv({ PIP_NO_INDEX: "1" })).toMatchObject({
      PATH: process.env.PATH,
      PYTHON_VENV_PATH: "/opt/venv",
      SSL_CERT_FILE: "/etc/ssl/ca.pem",
      REQUESTS_CA_BUNDLE: "/etc/ssl/ca.pem",
      PIP_CERT: "/etc/ssl/ca.pem",
      PIP_NO_INDEX: "1",
    });
  });
});
