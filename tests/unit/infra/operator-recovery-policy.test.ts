import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDocsAdapter } from "../../../scripts/i18n/adapters/docs-md.mjs";
import { hash } from "../../../scripts/i18n/lib/hash.mjs";
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

  it("documents every snapotter-admin recovery subcommand and the admin-recovery.ts fallback in every locale", async () => {
    const cliSource = source("apps/api/src/scripts/admin-recovery.ts");
    const usageMatch = cliSource.match(/const USAGE = `([\s\S]*?)`;/);
    expect(usageMatch, "admin-recovery.ts must declare USAGE").not.toBeNull();
    const subcommands = [
      ...(usageMatch?.[1].matchAll(/^\s+snapotter-admin\s+([a-z-]+)\b/gm) ?? []),
    ].map((m) => m[1]);
    expect(subcommands).toEqual([
      "status",
      "reset-mfa-policy",
      "disable-mfa",
      "reset-password",
      "create-admin",
      "unlock-user",
    ]);

    const englishGuide = source("apps/docs/guide/account-recovery.md");
    const extractAnchors = (text: string): string[] =>
      [...text.matchAll(/\{#[^}\n]+\}/g)].map((m) => m[0]);
    const extractFences = (text: string): string[] =>
      [...text.matchAll(/```[\s\S]*?```/g)].map((m) => m[0]);
    const expectedAnchors = extractAnchors(englishGuide);
    const expectedFences = extractFences(englishGuide);
    expect(expectedAnchors).toEqual([
      "{#account-recovery}",
      "{#which-wall-am-i-hitting}",
      "{#relax-the-mfa-policy}",
      "{#clear-one-user-s-totp-enrollment}",
      "{#reset-a-forgotten-password}",
      "{#bootstrap-an-admin-account}",
      "{#unlock-a-throttled-or-disabled-user}",
      "{#older-images-and-fallbacks}",
      "{#locked-out-of-sso-not-mfa}",
    ]);
    expect(expectedFences).toContain(
      "```bash\ndocker exec -it snapotter snapotter-admin reset-password <username> [password]\n```",
    );
    expect(expectedFences).toContain(
      "```bash\ndocker exec -it snapotter snapotter-admin create-admin [username] [password]\n```",
    );
    expect(expectedFences).toContain(
      "```bash\ndocker exec -it snapotter snapotter-admin unlock-user <username>\n```",
    );

    for (const locale of localeCodes()) {
      const prefix = locale === "en" ? "" : `${locale}/`;
      const relPath = `apps/docs/${prefix}guide/account-recovery.md`;
      const guide = source(relPath);
      for (const subcommand of subcommands) {
        expect(guide, `${relPath} must document snapotter-admin ${subcommand}`).toContain(
          `snapotter-admin ${subcommand}`,
        );
      }
      expect(guide, `${relPath} must point fallback at src/scripts/admin-recovery.ts`).toContain(
        "src/scripts/admin-recovery.ts",
      );
      expect(
        guide,
        `${relPath} must not point fallback at src/scripts/mfa-recover.ts`,
      ).not.toContain("src/scripts/mfa-recover.ts");
      expect(extractAnchors(guide), `${relPath} must preserve heading anchors`).toEqual(
        expectedAnchors,
      );
      expect(extractFences(guide), `${relPath} must preserve fenced commands`).toEqual(
        expectedFences,
      );
    }

    const adapter = createDocsAdapter({ root: path.resolve(root, "apps/docs") });
    const units = await adapter.extract();
    const unit = units.find((u: { id: string }) => u.id === "guide/account-recovery.md");
    expect(unit, "docs adapter must extract guide/account-recovery.md").toBeDefined();
    const expectedSourceHash = hash(unit?.sourceText ?? "");

    for (const locale of localeCodes().filter((c) => c !== "en")) {
      const rawGuide = source(`apps/docs/${locale}/guide/account-recovery.md`);
      const stored = await adapter.load(locale);
      const entry = stored.get("guide/account-recovery.md");
      expect(entry, `${locale}: missing guide/account-recovery.md`).toBeDefined();
      expect(entry?.stale, `${locale}: guide/account-recovery.md is marked stale`).toBe(false);
      expect(
        entry?.text,
        `${locale}: guide/account-recovery.md must not be untranslated English`,
      ).not.toBe(englishGuide);
      expect(entry?.sourceHash, `${locale}: stale sourceHash for guide/account-recovery.md`).toBe(
        expectedSourceHash,
      );
      expect(
        entry?.outputHash,
        `${locale}: mismatched outputHash for guide/account-recovery.md`,
      ).toBe(hash(entry?.text ?? ""));
      expect(rawGuide, `${locale}: must record i18n_hash_version: 2`).toContain(
        "i18n_hash_version: 2",
      );
      expect(
        rawGuide.match(/^i18n_output_hash:\s*(\S+)$/m)?.[1],
        `${locale}: raw frontmatter i18n_output_hash must match canonical body hash`,
      ).toBe(hash(entry?.text ?? ""));
      expect(rawGuide, `${locale}: must not carry i18n_stale or i18n_fallback`).not.toMatch(
        /^i18n_(stale|fallback):/m,
      );
    }
  });

  it("preserves executable Markdown structures in every localized operator guide", () => {
    const guides = ["account-recovery", "database", "developer", "getting-started", "security"];
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
