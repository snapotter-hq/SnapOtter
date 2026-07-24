import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { countStructures } from "../../../scripts/i18n/lib/mask.mjs";
import { localeCodes } from "../../../scripts/i18n/lib/shared-i18n.mjs";

const root = process.cwd();

function source(relativePath: string): string {
  return readFileSync(path.resolve(root, relativePath), "utf8");
}

describe("operator recovery policy", () => {
  it("keeps the quick-start guide on the canonical production Compose file", () => {
    const guide = source("apps/docs/guide/getting-started.md");

    expect(guide).toContain("docker/docker-compose.yml");
    expect(guide).toContain("POSTGRES_PASSWORD");
    expect(guide).toContain("REDIS_PASSWORD");
    expect(guide).not.toMatch(/## Docker Compose[\s\S]*?```yaml/);
  });

  it("documents every runtime volume and the actual persistent file paths", () => {
    const guide = source("apps/docs/guide/security.md");

    for (const value of [
      "SnapOtter-data",
      "SnapOtter-workspace",
      "SnapOtter-pgdata",
      "SnapOtter-redisdata",
      "/data/files",
      "/data/ai/venv",
    ]) {
      expect(guide, `security guide must document ${value}`).toContain(value);
    }
  });

  it("pins the disposable backup helper image by multi-platform digest in every locale", () => {
    const alpine =
      "alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce";

    for (const locale of localeCodes()) {
      const prefix = locale === "en" ? "" : `${locale}/`;
      const guide = source(`apps/docs/${prefix}guide/security.md`);
      expect(guide, `${locale}/guide/security.md`).toContain(alpine);
      expect(guide, `${locale}/guide/security.md`).not.toMatch(/alpine:3\.22(?!@sha256:)/);
    }
  });

  it("uses fail-fast logical database backup and restore commands", () => {
    for (const guidePath of ["apps/docs/guide/security.md", "apps/docs/guide/database.md"]) {
      const guide = source(guidePath);
      expect(guide, guidePath).toContain("pg_dump --format=custom");
      expect(guide, guidePath).toContain("pg_restore --exit-on-error");
      expect(guide, guidePath).not.toContain("cat backup.sql");
    }
  });

  it("does not promise zero egress while opt-out telemetry is enabled", () => {
    const guide = source("apps/docs/guide/security.md");

    expect(guide).not.toContain("zero outbound network connections");
    expect(guide).toContain("SNAPOTTER_TELEMETRY=0");
    expect(guide).toContain("Sentry");
    expect(guide).toContain("PostHog");
  });

  it("ships an executable, isolated backup and restore drill", () => {
    const drillPath = path.resolve(root, "tests/qa/backup-restore-drill.sh");
    expect(existsSync(drillPath)).toBe(true);

    const drill = source("tests/qa/backup-restore-drill.sh");
    expect(drill).toContain("set -eu");
    expect(drill).toContain("QA_IMAGE");
    expect(drill).toContain("pg_dump --format=custom");
    expect(drill).toContain("pg_restore --exit-on-error");
    expect(drill).toContain("sha256sum");
    expect(drill).toContain("docker compose");
  });

  it("preserves executable Markdown structures in every localized operator guide", () => {
    const guides = ["database", "developer", "getting-started", "security"];
    const locales = localeCodes().filter((locale) => locale !== "en");

    for (const guide of guides) {
      const expected = countStructures(source(`apps/docs/guide/${guide}.md`));
      for (const locale of locales) {
        const translated = countStructures(source(`apps/docs/${locale}/guide/${guide}.md`));
        expect(translated, `${locale}/${guide}.md changed protected Markdown structures`).toEqual(
          expected,
        );
      }
    }
  });
});
