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
