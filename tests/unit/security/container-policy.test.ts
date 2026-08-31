// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Contract assertions intentionally match Compose interpolation syntax.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

interface ComposeService {
  image?: string;
  security_opt?: string[];
}

interface ComposeFile {
  services: Record<string, ComposeService>;
}

function parseCompose(relativePath: string): ComposeFile {
  return load(read(relativePath)) as ComposeFile;
}

const cpuCompose = parseCompose("docker/docker-compose.yml");
const gpuCompose = parseCompose("docker/docker-compose-gpu.yml");
const qaComposeSource = read("tests/qa/docker-compose.qa.yml");
const qaCompose = parseCompose("tests/qa/docker-compose.qa.yml");
const dockerfile = read("docker/Dockerfile");

describe("release container policy", () => {
  it("requires the QA application image by immutable SHA-256 digest", () => {
    expect(qaCompose.services.app.image).toBe(
      "${QA_IMAGE_REPOSITORY:-snapotter/snapotter}@sha256:${QA_IMAGE:?QA_IMAGE must be the 64-character hexadecimal digest of the image under test}",
    );
    expect(qaComposeSource).not.toContain("snapotter/snapotter:latest");
  });

  it("pins QA infrastructure to the exact canonical production images", () => {
    for (const service of ["postgres", "redis"] as const) {
      const canonicalImage = cpuCompose.services[service]?.image;

      expect(canonicalImage, `${service} must have a canonical image`).toMatch(
        /:[^@\s]+@sha256:[a-f0-9]{64}$/,
      );
      expect(gpuCompose.services[service]?.image).toBe(canonicalImage);
      expect(qaCompose.services[service]?.image).toBe(canonicalImage);
    }
  });

  it("excludes local metadata and secret material from every repository build context", () => {
    const requiredPatterns = [
      ".license-signing-key",
      ".secrets",
      ".claude",
      ".codex",
      ".local-wiki",
      ".npmrc",
      ".pypirc",
      ".netrc",
      "*.pem",
      "*.key",
      "*.p12",
      "*.pfx",
      "*credentials*.json",
      "*client_secret*.json",
      "*service_account*.json",
      "AGENTS.md",
      "CLAUDE.md",
      "CONTEXT.md",
      "PRD.md",
    ];

    for (const dockerignore of [".dockerignore", "docker/Dockerfile.test.dockerignore"]) {
      const patterns = new Set(
        read(dockerignore)
          .split(/\r?\n/)
          .map((line) => line.trim().replace(/\/$/, ""))
          .filter((line) => line !== "" && !line.startsWith("#")),
      );

      for (const pattern of requiredPatterns) {
        expect(patterns, `${dockerignore} must exclude ${pattern}`).toContain(pattern);
      }
    }
  });

  // Issue #734. jemalloc refuses to start when the kernel's page size is larger
  // than the one it was compiled for, and the packages.redis.io build assumes
  // 4 KiB. That killed redis-server AND redis-cli on 16 KiB hosts (Asahi Linux,
  // some Apple-silicon VMs) and 64 KiB hosts (aarch64 RHEL), so the embedded
  // container hung forever in the redis-ready probe. No prebuilt Redis 8 fixes
  // it on this base, so the image builds one and patches jemalloc itself.
  it("builds embedded Redis with a page-size-agnostic jemalloc on ARM", () => {
    expect(dockerfile).toMatch(/ AS redis-builder$/m);
    // 64 KiB covers every aarch64 kernel in the wild; x86 is always 4 KiB paged,
    // and widening it there would only waste memory. Same split Debian uses.
    expect(dockerfile).toMatch(/amd64 \| i386\) jemallocPage=12 ;;/);
    expect(dockerfile).toMatch(/\*\) jemallocPage=16 ;;/);
    // Set through deps/Makefile's own JEMALLOC_CONFIGURE_OPTS seam. It has to
    // be exported, not passed as a make argument: a command-line definition
    // overrides the `+=` the same variable uses to carry --host on cross-builds.
    expect(dockerfile).toMatch(
      /export JEMALLOC_CONFIGURE_OPTS="--with-lg-page=\$\{jemallocPage\} /,
    );
    // The tarball is what gets built, so the pinned version has to be the one
    // actually fetched, not just a declared ARG.
    expect(dockerfile).toContain(
      "https://github.com/redis/redis/releases/download/${REDIS_VERSION}/redis-full.tar.gz",
    );

    // Scope the COPY to the final stage: landing it in a builder would ship an
    // image with no Redis at all and still match a whole-file regex.
    const production = dockerfile.slice(dockerfile.indexOf("AS production"));
    expect(production).toMatch(/COPY --from=redis-builder\b[\s\S]{0,200}?redis-server/);
    expect(production).toMatch(/COPY --from=redis-builder\b[\s\S]{0,200}?redis-cli/);
  });

  it("never installs the 4 KiB-page Redis apt build into the embedded image", () => {
    expect(dockerfile).not.toMatch(/sources\.list\.d\/redis\.list/);
    expect(dockerfile).not.toMatch(/redis-archive-keyring/);
    expect(dockerfile).not.toMatch(/packages\.redis\.io\/deb/);

    // Join line continuations first: an unanchored regex would run past the end
    // of the install command and match redis-server in a later shell step.
    const aptInstalls = dockerfile
      .replace(/\\\r?\n\s*/g, " ")
      .split(/[\n;]|&&/)
      .map((command) => command.trim())
      .filter((command) => /(^|\s)apt-get\s[^|]*\binstall\b/.test(command));

    expect(aptInstalls.length).toBeGreaterThan(0);
    for (const command of aptInstalls) {
      expect(command, "Redis must not come from an apt package").not.toMatch(/\bredis-server\b/);
    }
  });

  it("asserts the page size jemalloc compiled, not the one it was asked for", () => {
    // This is the guard that actually prevents a repeat of #734. jemalloc's
    // configure exits 0 on an option it no longer recognises and then falls
    // back to probing the build host, which answers 12 under emulation. So
    // passing the flag proves nothing; LG_PAGE in the generated header is
    // configure's own record of what it decided. Checked by reading the header
    // rather than running Redis, keeping the PR #519 no-emulation invariant.
    expect(dockerfile).toMatch(
      /grep -qx "#define LG_PAGE \$\{jemallocPage\}"[\s\S]{0,120}?jemalloc_internal_defs\.h/,
    );
    // deploy.sh downgrades a failed core build to a warning on stdout, so the
    // layer can succeed with no binaries to copy.
    expect(dockerfile).toMatch(/test -x \/usr\/local\/bin\/redis-server/);
    expect(dockerfile).toMatch(/test -x \/usr\/local\/bin\/redis-cli/);
  });

  it("checksum-pins the Redis source tarball to a literal, not an overridable ARG", () => {
    // An ARG default is settable with --build-arg, which would hand the
    // supply-chain pin to the caller. Every other hash in this Dockerfile is
    // inline for the same reason.
    expect(dockerfile).not.toMatch(/ARG REDIS_DOWNLOAD_SHA/);
    expect(dockerfile).toMatch(/echo "[a-f0-9]{64} \*redis\.tar\.gz" \\?\s*\| sha256sum -c -/);
  });

  it("prevents privilege gains in every canonical runtime service", () => {
    for (const [name, compose] of [
      ["docker-compose.yml", cpuCompose],
      ["docker-compose-gpu.yml", gpuCompose],
    ] as const) {
      for (const service of ["SnapOtter", "postgres", "redis"] as const) {
        expect(
          compose.services[service]?.security_opt,
          `${name} ${service} must set no-new-privileges`,
        ).toContain("no-new-privileges:true");
      }
    }
  });
});
