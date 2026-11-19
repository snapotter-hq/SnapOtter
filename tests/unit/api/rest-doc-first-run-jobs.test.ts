/**
 * apps/docs/api/rest.md described the progress stream as public, never said
 * the default admin must change its password before the API works, and had no
 * section for GET /api/v1/jobs/:jobId (#4391). Pin the corrected English and
 * every translated copy, including fresh i18n hashes with human provenance.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "../../../packages/shared/src/i18n/index.js";
import { createDocsAdapter } from "../../../scripts/i18n/adapters/docs-md.mjs";
import { hash } from "../../../scripts/i18n/lib/hash.mjs";

const DOCS_DIR = path.resolve(import.meta.dirname, "../../../apps/docs");
const LOCALES = SUPPORTED_LOCALES.map((l) => l.code).filter((code) => code !== "en");
const JOB_STATUSES = ["queued", "processing", "completed", "failed", "canceled"];

function readRestDoc(relPath: string): string {
  return readFileSync(path.join(DOCS_DIR, relPath), "utf8");
}

/** Text from a heading's {#anchor} up to the next heading of the same or higher level. */
function section(doc: string, relPath: string, anchor: string): string {
  const lines = doc.split("\n");
  const start = lines.findIndex((line) => /^#{2,6} /.test(line) && line.endsWith(`{#${anchor}}`));
  if (start < 0) throw new Error(`${relPath} missing heading {#${anchor}}`);
  const level = lines[start].match(/^#+/)?.[0].length ?? 2;
  const rest = lines.slice(start + 1);
  // Shell comments inside code fences start with "# " too.
  let inFence = false;
  const end = rest.findIndex((line) => {
    if (line.startsWith("```")) inFence = !inFence;
    const m = line.match(/^(#+) /);
    return !inFence && m !== null && m[1].length <= level;
  });
  return (end < 0 ? rest : rest.slice(0, end)).join("\n");
}

/** Prose only: fenced code blocks removed, so a translated copy can't pass on code alone. */
function prose(text: string): string {
  return text.replace(/```[\s\S]*?```/g, "").trim();
}

function codeBlocks(text: string): string[] {
  return text.match(/```[\s\S]*?```/g) ?? [];
}

describe("REST guide: first login, progress access, job status (#4391)", () => {
  const docsAdapter = createDocsAdapter({ root: DOCS_DIR });
  const english = readRestDoc("api/rest.md");
  let expectedSourceHash = "";

  beforeAll(async () => {
    const extracted = await docsAdapter.extract();
    const unit = extracted.find((u: { id: string }) => u.id === "api/rest.md");
    expect(unit).toBeDefined();
    expectedSourceHash = hash(unit?.sourceText ?? "");
  });

  it("English progress section requires auth and names who may read the stream", () => {
    const progress = section(english, "api/rest.md", "progress-tracking");
    expect(progress).not.toMatch(/public/i);
    expect(progress).not.toContain("do not need to send an Authorization header");
    expect(prose(progress)).toContain("`files:all`");
    expect(prose(progress)).toContain("`features:manage`");
    expect(prose(progress)).toContain("`404`");
    expect(progress).toContain(
      'curl -N http://localhost:1349/api/v1/jobs/<jobId>/progress \\\n  -H "Authorization: Bearer <token>"',
    );
  });

  it("English quickstart points at the first-login password change", () => {
    const sessionToken = section(english, "api/rest.md", "session-token");
    expect(prose(sessionToken)).toContain("(#first-login)");

    const firstLogin = section(english, "api/rest.md", "first-login");
    expect(prose(firstLogin)).toContain("`MUST_CHANGE_PASSWORD`");
    expect(prose(firstLogin)).toContain("`SKIP_MUST_CHANGE_PASSWORD=true`");
    expect(prose(firstLogin)).toContain("`403`");
    const [block] = codeBlocks(firstLogin);
    expect(block).toContain("POST http://localhost:1349/api/auth/change-password");
    expect(block).toContain('"currentPassword":"admin"');
    expect(block).toContain('"newPassword":"<new-password>"');
  });

  it("English documents GET /api/v1/jobs/:jobId with every stored status", () => {
    const jobStatus = section(english, "api/rest.md", "job-status");
    expect(prose(jobStatus)).toContain("`GET /api/v1/jobs/:jobId`");
    for (const status of JOB_STATUSES) expect(prose(jobStatus)).toContain(`\`${status}\``);
    expect(codeBlocks(jobStatus)[0]).toContain("curl http://localhost:1349/api/v1/jobs/<jobId>");
  });

  it.each(LOCALES)(
    "%s rest.md carries the translated sections and fresh hashes",
    async (locale) => {
      const relPath = `${locale}/api/rest.md`;
      const doc = readRestDoc(relPath);

      const progress = section(doc, relPath, "progress-tracking");
      const englishProgress = section(english, "api/rest.md", "progress-tracking");
      expect(codeBlocks(progress)).toEqual(codeBlocks(englishProgress));
      expect(prose(progress)).toContain("`files:all`");
      expect(prose(progress)).toContain("`features:manage`");
      expect(prose(progress)).toContain("`404`");
      expect(prose(progress)).not.toContain("do not need to send an Authorization header");

      const sessionToken = section(doc, relPath, "session-token");
      expect(prose(sessionToken)).toContain("(#first-login)");

      const firstLogin = section(doc, relPath, "first-login");
      const englishFirstLogin = section(english, "api/rest.md", "first-login");
      expect(codeBlocks(firstLogin)).toEqual(codeBlocks(englishFirstLogin));
      expect(prose(firstLogin)).toContain("`MUST_CHANGE_PASSWORD`");
      expect(prose(firstLogin)).toContain("`SKIP_MUST_CHANGE_PASSWORD=true`");
      expect(prose(firstLogin)).not.toBe(prose(englishFirstLogin));
      expect(prose(firstLogin)).not.toContain("Until the default");

      const jobStatus = section(doc, relPath, "job-status");
      const englishJobStatus = section(english, "api/rest.md", "job-status");
      expect(codeBlocks(jobStatus)).toEqual(codeBlocks(englishJobStatus));
      expect(prose(jobStatus)).toContain("`GET /api/v1/jobs/:jobId`");
      for (const status of JOB_STATUSES) expect(prose(jobStatus)).toContain(`\`${status}\``);
      expect(prose(jobStatus)).not.toContain("returns a job's stored state");

      const loaded = await docsAdapter.load(locale);
      const entry = loaded.get("api/rest.md");
      expect(entry?.text).toBeTruthy();
      expect(entry?.provenance).toBe("human");
      expect(entry?.sourceHash).toBe(expectedSourceHash);
      expect(entry?.outputHash).toBe(hash(entry?.text as string));
      expect(entry?.stale).toBe(false);
      expect(doc).not.toMatch(/^i18n_(stale|fallback):/m);
    },
  );
});
