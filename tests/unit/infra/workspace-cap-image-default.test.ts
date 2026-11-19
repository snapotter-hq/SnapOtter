// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Contract assertions intentionally match Compose interpolation syntax.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

/**
 * The published image ships its usage limits as 0 (unlimited), but it left
 * MAX_WORKSPACE_SIZE_GB out, so the 10 GB schema default applied and every
 * upload got a 503 once uploads/ plus outputs/ passed 10 GiB (#4416). The
 * schema default stays 10 for source builds, the same split MAX_UPLOAD_SIZE_MB
 * and MAX_BATCH_SIZE use; the image, its Compose files and .env.example opt
 * out explicitly. The free-space floor still guards the disk itself.
 */

const root = resolve(import.meta.dirname, "../../..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function composeEnv(relativePath: string): Map<string, string> {
  const parsed = load(read(relativePath)) as {
    services: Record<string, { environment?: string[] }>;
  };
  const map = new Map<string, string>();
  for (const entry of parsed.services.SnapOtter?.environment ?? []) {
    const eq = entry.indexOf("=");
    if (eq > 0) map.set(entry.slice(0, eq), entry.slice(eq + 1));
  }
  return map;
}

describe("published image workspace cap default (#4416)", () => {
  it("the Dockerfile ENV block sets MAX_WORKSPACE_SIZE_GB=0 next to the other limits", () => {
    expect(read("docker/Dockerfile")).toMatch(/^\s+MAX_WORKSPACE_SIZE_GB=0 \\$/m);
  });

  for (const file of ["docker/docker-compose.yml", "docker/docker-compose-gpu.yml"]) {
    it(`${file} forwards MAX_WORKSPACE_SIZE_GB with a 0 default`, () => {
      expect(composeEnv(file).get("MAX_WORKSPACE_SIZE_GB")).toBe("${MAX_WORKSPACE_SIZE_GB:-0}");
    });
  }

  it(".env.example documents MAX_WORKSPACE_SIZE_GB=0", () => {
    expect(read(".env.example")).toMatch(/^MAX_WORKSPACE_SIZE_GB=0$/m);
  });
});
