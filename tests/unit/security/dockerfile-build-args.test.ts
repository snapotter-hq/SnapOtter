// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Contract assertions intentionally match Docker and shell interpolation syntax.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const dockerfile = readFileSync(resolve(here, "../../../docker/Dockerfile"), "utf8");
const dockerfileTest = readFileSync(resolve(here, "../../../docker/Dockerfile.test"), "utf8");
const snapotterRun = readFileSync(
  resolve(here, "../../../docker/s6/s6-rc.d/snapotter/run"),
  "utf8",
);
const postgresReady = readFileSync(
  resolve(here, "../../../docker/s6/s6-rc.d/postgres-ready/up"),
  "utf8",
);
const composeCpu = readFileSync(resolve(here, "../../../docker/docker-compose.yml"), "utf8");
const composeGpu = readFileSync(resolve(here, "../../../docker/docker-compose-gpu.yml"), "utf8");
const composeDev = readFileSync(resolve(here, "../../../docker-compose.dev.yml"), "utf8");
const composeTest = readFileSync(resolve(here, "../../../docker/docker-compose.test.yml"), "utf8");
const trivyIgnore = readFileSync(resolve(here, "../../../.trivyignore"), "utf8");

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
  it("pins every external Dockerfile base image to an immutable digest", () => {
    for (const [name, source] of [
      ["Dockerfile", dockerfile],
      ["Dockerfile.test", dockerfileTest],
    ] as const) {
      const externalBases = source
        .split(/\r?\n/)
        .filter((line) => /^FROM\s+/.test(line))
        .filter((line) => !/^FROM\s+(?:libheif-base-|base-)\$\{/.test(line));

      expect(externalBases.length, `${name} should contain external bases`).toBeGreaterThan(0);
      for (const base of externalBases) {
        expect(base, `${name} base is mutable: ${base}`).toMatch(
          /@sha256:[a-f0-9]{64}(?:\s+AS\s+\S+)?$/,
        );
      }
    }
  });

  it("pins fixed Go toolchains and checksummed dependency overrides for shipped binaries", () => {
    const goBuilder =
      "golang:1.25.12-bookworm@sha256:ea341baa9bd5ba6784f6d7161ace70544349a6242d54d34a0fbfd2c4d51c9d58";
    expect(dockerfile.split(goBuilder)).toHaveLength(3);

    for (const contract of [
      {
        stage: "caire-builder",
        directory: "caire",
        application: "github.com/esimov/caire v1.5.0",
      },
      {
        stage: "pdfcpu-builder",
        directory: "pdfcpu",
        application: "github.com/pdfcpu/pdfcpu v0.13.0",
      },
    ]) {
      const modulePath = resolve(root, `docker/go-tools/${contract.directory}/go.mod`);
      const checksumPath = resolve(root, `docker/go-tools/${contract.directory}/go.sum`);

      expect(existsSync(modulePath), `${contract.directory} go.mod must be committed`).toBe(true);
      expect(existsSync(checksumPath), `${contract.directory} go.sum must be committed`).toBe(true);
      if (!existsSync(modulePath) || !existsSync(checksumPath)) continue;

      const module = readFileSync(modulePath, "utf8");
      const checksums = readFileSync(checksumPath, "utf8");
      const stage = stageBody(contract.stage);

      expect(module).toContain(contract.application);
      expect(module).toContain("golang.org/x/image v0.43.0");
      expect(checksums).toContain(`${contract.application} h1:`);
      expect(checksums).toContain("golang.org/x/image v0.43.0 h1:");
      expect(stage).toContain(
        `COPY docker/go-tools/${contract.directory}/go.mod docker/go-tools/${contract.directory}/go.sum ./`,
      );
      expect(stage).toContain("go mod download");
      expect(stage).toContain("go mod verify");
      expect(stage).toContain("-mod=readonly");
    }

    expect(trivyIgnore).not.toContain("CVE-2026-33809");
  });

  it("verifies every downloaded Docker build input against repository-controlled hashes", () => {
    for (const [name, source] of [
      ["Dockerfile", dockerfile],
      ["Dockerfile.test", dockerfileTest],
    ] as const) {
      expect(source, `${name} must pin libheif bytes`).toContain(
        "75f530b7154bc93e7ecf846edfc0416bf5f490612de8c45983c36385aa742b42",
      );
      expect(source, `${name} must verify downloads`).toContain("sha256sum --check --strict");
    }

    for (const digest of [
      "d502599878eb29af3ae5f0cb5d559134df96534125d452c7a0674a5bad2c5ecf",
      "b651c8bfd5a0a2f6650d6c0830131747ef67a1d9c0475b1399626611419e2205",
      "0144068502a1eddd2a0280ede10ef607d1ec592ce819940991203941564e8e76",
      "817b5a78358d00ed6b71884d70ad5d2eab9934badca1a34299fdc6a2e4a8ad20",
      "8b22a2eaca4bf0b27a43d36e65c89d2701738f628d1abd0cea5569619f66f785",
      "6dbcde158a3e78b9bb141d7bcb5ccb421e563523babbe2c64470e76f4fd02dae",
      "59289456ab1761e277bd456a95e737c06b03ede99158beb24f12b165a904f478",
      "de86b035655accff8d4010f1a221fdf50d353cb7b1422ba26f14a0db92612cfa",
    ]) {
      expect(dockerfile, `Dockerfile is missing literal SHA-256 ${digest}`).toContain(digest);
    }
    expect(dockerfile).not.toContain('curl -fsSL -O "${base}/${f}.sha256"');
  });

  it("decodes camera RAW with the source-built LibRaw, never the distro package", () => {
    // Debian 12's libraw 0.20.2 carries unfixed arbitrary-code-execution CVEs
    // and dcraw_emu runs on user-supplied uploads, so the distro package must
    // not be installed and /usr/local/bin must win the PATH lookup.
    expect(stageBody("libraw-builder")).toContain("LibRaw-${LIBRAW_VERSION}.tar.gz");

    const production = stageBody("production");
    expect(production).not.toContain("libraw-bin");
    expect(production).not.toContain("libraw-dev");
    expect(production).toContain(
      "COPY --from=libraw-builder /opt/libraw/bin/dcraw_emu /usr/local/bin/",
    );
    expect(production).toContain('[ "$(command -v dcraw_emu)" = "/usr/local/bin/dcraw_emu" ]');

    // The purge step's --auto-remove can strip a shared library the source
    // build needs; the decoder has to be re-checked after it runs.
    const purgeIndex = production.indexOf("apt-get purge -y --auto-remove");
    expect(purgeIndex).toBeGreaterThanOrEqual(0);
    expect(production.slice(purgeIndex)).toContain("dcraw_emu 2>&1 | grep -q 'dcraw emulator'");
  });

  it("pins Compose infrastructure images while keeping their major-version labels", () => {
    for (const [name, compose] of [
      ["docker-compose.yml", composeCpu],
      ["docker-compose-gpu.yml", composeGpu],
      ["docker-compose.dev.yml", composeDev],
      ["docker-compose.test.yml", composeTest],
    ] as const) {
      expect(compose, `${name} must pin PostgreSQL 17`).toMatch(
        /image:\s*postgres:17-alpine@sha256:[a-f0-9]{64}/,
      );
      expect(compose, `${name} must pin Redis 8`).toMatch(
        /image:\s*redis:8-alpine@sha256:[a-f0-9]{64}/,
      );
    }
  });

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

  it("removes build-time Node package managers from the production runtime", () => {
    const production = stageBody("production");
    const installIndex = production.indexOf("playwright install chromium --with-deps");
    const cleanupIndex = production.indexOf("apt-get purge -y --auto-remove");
    const cleanup = production.slice(cleanupIndex);

    expect(installIndex).toBeGreaterThanOrEqual(0);
    expect(cleanupIndex).toBeGreaterThan(installIndex);
    expect(cleanup).toContain("/usr/local/lib/node_modules/npm");
    expect(cleanup).toContain("/usr/local/lib/node_modules/corepack");
    for (const command of ["corepack", "npm", "npx", "pnpm", "pnpx"]) {
      expect(cleanup).toContain(`/usr/local/bin/${command}`);
    }
  });

  it("checks embedded Postgres readiness with the app database role", () => {
    expect(postgresReady).toContain("pg_isready");
    expect(postgresReady).toContain("-U snapotter");
    expect(postgresReady).toContain("-d snapotter");
  });

  it("bakes a real, non-zero rate limit default for the one-liner all-in-one install", () => {
    // The one-liner `docker run` path has no compose file to override this, so
    // whatever ships here is what a self-hoster following the documented
    // single-container install actually gets. RATE_LIMIT_PER_MIN=0 means
    // "unlimited" (see apps/api/src/index.ts), which left every route
    // (including auth) without meaningful throttling.
    const production = stageBody("production");
    const match = production.match(/^\s*RATE_LIMIT_PER_MIN=(\d+)/m);

    expect(match).not.toBeNull();
    const value = Number(match?.[1]);
    expect(value).toBeGreaterThan(0);
    // Generous on purpose (self-hosted, single-user/small-team usage
    // shouldn't ever brush up against it) but a real, finite ceiling.
    expect(value).toBeGreaterThanOrEqual(1000);
  });

  it("keeps the compose files' rate limit fallback at least as generous as the Dockerfile default", () => {
    // Compose previously hardened this to 300/min while the raw one-liner
    // shipped 0 (unlimited) -- a real gap between two equally-documented
    // install paths' default security posture. Both should converge on the
    // same non-zero floor rather than leaving the one-liner as the outlier.
    const production = stageBody("production");
    const dockerfileDefault = Number(production.match(/^\s*RATE_LIMIT_PER_MIN=(\d+)/m)?.[1] ?? 0);

    for (const [name, compose] of [
      ["docker-compose.yml", composeCpu],
      ["docker-compose-gpu.yml", composeGpu],
    ] as const) {
      const fallback = compose.match(/RATE_LIMIT_PER_MIN:-(\d+)/);
      expect(fallback, `${name} should set a RATE_LIMIT_PER_MIN fallback`).not.toBeNull();
      expect(Number(fallback?.[1])).toBeGreaterThanOrEqual(dockerfileDefault);
    }
  });

  it("targets the app database (not the role) in the compose Postgres healthchecks", () => {
    // pg_isready with no -d defaults the probe database to the username. When
    // POSTGRES_USER and POSTGRES_DB differ, the healthcheck silently keeps
    // reporting healthy while its underlying query fails, and Postgres logs
    // `FATAL: database "<user>" does not exist` on a loop. Pin the probe to
    // POSTGRES_DB so it fails loudly when the database is genuinely missing.
    for (const [name, compose] of [
      ["docker-compose.yml", composeCpu],
      ["docker-compose-gpu.yml", composeGpu],
    ] as const) {
      const line = compose.split(/\r?\n/).find((l) => l.includes("pg_isready"));
      expect(line, `${name} should have a pg_isready healthcheck`).toBeDefined();
      expect(line, `${name} pg_isready must target POSTGRES_DB with -d`).toContain(
        "-d ${POSTGRES_DB",
      );
    }
  });
});
