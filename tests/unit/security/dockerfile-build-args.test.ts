import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const dockerfile = readFileSync(resolve(here, "../../../docker/Dockerfile"), "utf8");
const snapotterRun = readFileSync(
  resolve(here, "../../../docker/s6/s6-rc.d/snapotter/run"),
  "utf8",
);
const postgresReady = readFileSync(
  resolve(here, "../../../docker/s6/s6-rc.d/postgres-ready/up"),
  "utf8",
);

function stageBody(stageName: string): string {
  const lines = dockerfile.split(/\r?\n/);
  const start = lines.findIndex((line) =>
    new RegExp(`^FROM\\s+.*\\s+AS\\s+${stageName}$`).test(line),
  );
  expect(start).toBeGreaterThanOrEqual(0);

  const next = lines.findIndex((line, index) => index > start && /^FROM\s+/.test(line));
  return lines.slice(start, next === -1 ? undefined : next).join("\n");
}

describe("Dockerfile build args", () => {
  it("keeps the Pandoc version default in the production stage", () => {
    const production = stageBody("production");
    const argMatch = production.match(/^ARG PANDOC_VERSION=(.+)$/m);

    expect(argMatch?.[1]).toMatch(/^\d+\.\d+(?:\.\d+)?$/);
    expect(production.indexOf("ARG PANDOC_VERSION=")).toBeLessThan(
      production.indexOf("pandoc-${PANDOC_VERSION}"),
    );
  });

  it("keeps the amd64 CUDA base on the cu126 runtime family", () => {
    const baseLine = dockerfile
      .split(/\r?\n/)
      .find((line) => line.includes(" AS base-linux-amd64"));

    expect(baseLine).toContain("nvidia/cuda:12.6.");
    expect(baseLine).toContain("cudnn-runtime-ubuntu24.04");
    expect(baseLine).not.toContain("nvidia/cuda:12.9.");
  });

  it("avoids secret-scanner build arg names for public PostHog browser config", () => {
    const dockerArgOrEnvNames = [...dockerfile.matchAll(/^(?:ARG|ENV)\s+([A-Za-z0-9_]+)/gm)].map(
      (match) => match[1],
    );

    expect(dockerArgOrEnvNames).not.toContain("SNAPOTTER_POSTHOG_KEY");
    expect(dockerfile).toContain("SNAPOTTER_POSTHOG_PROJECT_ID");
  });

  it("removes distro-generated snakeoil TLS material after embedded database install", () => {
    const production = stageBody("production");
    const installIndex = production.indexOf("postgresql-17 postgresql-client-17 redis-server");
    const removeIndex = production.indexOf("/etc/ssl/private/ssl-cert-snakeoil.key");

    expect(installIndex).toBeGreaterThanOrEqual(0);
    expect(removeIndex).toBeGreaterThan(installIndex);
    expect(production).toContain("/etc/ssl/certs/ssl-cert-snakeoil.pem");
  });

  it("purges build-only compiler and header packages before the final image", () => {
    const production = stageBody("production");
    const venvIndex = production.indexOf("python3 -m venv /opt/venv");
    const purgeIndex = production.indexOf("apt-get purge -y --auto-remove");

    expect(venvIndex).toBeGreaterThanOrEqual(0);
    expect(purgeIndex).toBeGreaterThan(venvIndex);
    expect(production.slice(purgeIndex)).toContain("python3-dev");
    expect(production.slice(purgeIndex)).toContain("gcc");
    expect(production.slice(purgeIndex)).toContain("g++");
    expect(production.slice(purgeIndex)).toContain("libraw-dev");
    expect(production.slice(purgeIndex)).toContain("libopenexr-dev");
    expect(production.slice(purgeIndex)).toContain("libcurl4-openssl-dev");
    expect(production.slice(purgeIndex)).toContain("libffi-dev");
    expect(production.slice(purgeIndex)).toContain("libgcc-12-dev");
    expect(production.slice(purgeIndex)).toContain("libwebp-dev");
    expect(production.slice(purgeIndex)).toContain("dpkg-dev");
    expect(production.slice(purgeIndex)).toContain("libc6-dev");
    expect(production.slice(purgeIndex)).toContain("linux-libc-dev");
    expect(production.slice(purgeIndex)).toContain("libpq-dev");
  });

  it("pins the Python venv setuptools package to the fixed CVE version", () => {
    const production = stageBody("production");

    expect(production).toContain('"setuptools==78.1.1"');
    expect(production).toContain('"wheel==0.47.0"');
    expect(production).toContain('"jaraco.context==6.1.0"');
    expect(production).toContain("setuptools/_vendor/wheel-*.dist-info");
    expect(production).toContain("jaraco_context-6.1.0.dist-info");
    expect(production).not.toContain("pip install wheel setuptools");
  });

  it("does not require pnpm or a root HOME at production runtime", () => {
    const production = stageBody("production");

    expect(production).toContain("corepack disable pnpm");
    expect(production).not.toContain('CMD ["pnpm"');
    expect(production).toContain('CMD ["./node_modules/.bin/tsx"');
    expect(snapotterRun).not.toContain("pnpm");
    expect(snapotterRun).toContain("exec s6-setuidgid snapotter ./node_modules/.bin/tsx");
  });

  it("checks embedded Postgres readiness with the app database role", () => {
    expect(postgresReady).toContain("pg_isready");
    expect(postgresReady).toContain("-U snapotter");
    expect(postgresReady).toContain("-d snapotter");
  });
});
