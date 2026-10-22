/**
 * Commit 1f8a42e548 (#616) updated apps/docs/api/rest.md to document
 * role-authority containment and the so_scim_v2_... SCIM token requirement,
 * while commit 44d810948 (#618) re-stamped i18n_source_hash across all 20
 * localized apps/docs/<locale>/api/rest.md files without translating #616's
 * edits (#3349). Pin those rows, paragraphs, and i18n hashes across English
 * and all 20 localized copies.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "../../../packages/shared/src/i18n/index.js";
import { createDocsAdapter } from "../../../scripts/i18n/adapters/docs-md.mjs";
import { hash } from "../../../scripts/i18n/lib/hash.mjs";

const DOCS_DIR = path.resolve(import.meta.dirname, "../../../apps/docs");
const LOCALES = SUPPORTED_LOCALES.map((l) => l.code).filter((code) => code !== "en");

function readRestDoc(relPath: string): string {
  return readFileSync(path.join(DOCS_DIR, relPath), "utf8");
}

function getRowCells(doc: string, relPath: string, method: string, routePath: string): string[] {
  const prefix = `| \`${method}\` | \`${routePath}\` |`;
  const rows = doc.split("\n").filter((line) => line.startsWith(prefix));
  if (rows.length !== 1) {
    throw new Error(`${relPath} expected 1 ${method} ${routePath} row, found ${rows.length}`);
  }
  const cells = rows[0].split("|").map((c) => c.trim());
  if (cells.length < 6) {
    throw new Error(`${relPath} has malformed ${method} ${routePath} row: ${rows[0]}`);
  }
  return cells;
}

function getAccessCell(doc: string, relPath: string, method: string, routePath: string): string {
  return getRowCells(doc, relPath, method, routePath)[3];
}

function extractSectionIntro(doc: string, relPath: string, anchor: string): string {
  const anchorIdx = doc.indexOf(anchor);
  if (anchorIdx < 0) {
    throw new Error(`${relPath} missing section anchor ${anchor}`);
  }
  const bodyStart = doc.indexOf("\n", anchorIdx) + 1;
  const tableStart = doc.indexOf("\n|", bodyStart);
  if (tableStart < 0) {
    throw new Error(`${relPath} missing table after ${anchor}`);
  }
  return doc.slice(bodyStart, tableStart).trim();
}

function extractParentheticalClause(accessCell: string, codeSpan: string): string {
  const escaped = codeSpan.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = accessCell.match(new RegExp(`[(（]${escaped}\\s*[;；؛]\\s*([^)）]+)[)）]$`));
  return match?.[1]?.trim() ?? "";
}

describe("role-authority and SCIM token requirements in REST docs (#616, #3349)", () => {
  const docsAdapter = createDocsAdapter({ root: DOCS_DIR });
  let expectedRestDocSourceHash = "";
  const englishDoc = readRestDoc("api/rest.md");
  const englishRolesParagraphs = extractSectionIntro(englishDoc, "api/rest.md", "{#roles}")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const englishScimIntro = extractSectionIntro(englishDoc, "api/rest.md", "{#scim-2-0}");

  beforeAll(async () => {
    expect(LOCALES).toHaveLength(20);
    const extracted = await docsAdapter.extract();
    const sourceUnit = extracted.find((u: { id: string }) => u.id === "api/rest.md");
    expect(sourceUnit?.sourceText).toBeTruthy();
    expectedRestDocSourceHash = hash(sourceUnit?.sourceText as string);
  });

  it("documents role-authority and SCIM token requirements in the English REST reference", () => {
    expect(getAccessCell(englishDoc, "api/rest.md", "POST", "/api/auth/register")).toBe(
      "Admin (`users:manage`; proposed-role authority)",
    );
    for (const [method, routePath] of [
      ["PUT", "/api/auth/users/:id"],
      ["POST", "/api/auth/users/:id/reset-password"],
      ["DELETE", "/api/auth/users/:id"],
      ["POST", "/api/auth/users/:id/mfa/reset"],
    ] as const) {
      expect(getAccessCell(englishDoc, "api/rest.md", method, routePath)).toBe(
        "Admin (`users:manage`; target authority)",
      );
    }

    expect(englishRolesParagraphs).toHaveLength(2);
    expect(englishRolesParagraphs[1]).toContain("authority containment");
    expect(englishRolesParagraphs[1]).toContain("`user`");

    expect(
      getAccessCell(englishDoc, "api/rest.md", "GET", "/api/v1/enterprise/config/export"),
    ).toBe("Full built-in admin");
    expect(
      getAccessCell(englishDoc, "api/rest.md", "POST", "/api/v1/enterprise/config/import"),
    ).toBe("Full built-in admin");
    expect(getAccessCell(englishDoc, "api/rest.md", "POST", "/api/v1/enterprise/scim/token")).toBe(
      "Full built-in admin",
    );
    expect(
      getAccessCell(englishDoc, "api/rest.md", "DELETE", "/api/v1/enterprise/scim/token"),
    ).toBe("Full built-in admin");
    expect(
      getAccessCell(englishDoc, "api/rest.md", "DELETE", "/api/v1/enterprise/users/:id/purge"),
    ).toBe("Admin (`compliance:manage`; target authority)");
    expect(
      getAccessCell(englishDoc, "api/rest.md", "DELETE", "/api/v1/enterprise/teams/:id/purge"),
    ).toBe("Admin (`compliance:manage`; all-member authority)");

    expect(englishScimIntro).toContain("`so_scim_v2_...`");
  });

  it.each(LOCALES)(
    "%s rest.md translates #616 role-authority and SCIM token requirements with valid i18n hashes",
    async (locale) => {
      const relPath = `${locale}/api/rest.md`;
      const doc = readRestDoc(relPath);

      const adminLabel = getAccessCell(doc, relPath, "GET", "/api/auth/users");
      expect(adminLabel).not.toBe("");

      const registerAccess = getAccessCell(doc, relPath, "POST", "/api/auth/register");
      const updateUserAccess = getAccessCell(doc, relPath, "PUT", "/api/auth/users/:id");
      const resetPasswordAccess = getAccessCell(
        doc,
        relPath,
        "POST",
        "/api/auth/users/:id/reset-password",
      );
      const deleteUserAccess = getAccessCell(doc, relPath, "DELETE", "/api/auth/users/:id");
      const resetMfaAccess = getAccessCell(doc, relPath, "POST", "/api/auth/users/:id/mfa/reset");

      const proposedRoleClause = extractParentheticalClause(registerAccess, "`users:manage`");
      const targetAuthorityClause = extractParentheticalClause(updateUserAccess, "`users:manage`");
      expect(proposedRoleClause, `${locale} register proposed-role authority`).not.toBe("");
      expect(targetAuthorityClause, `${locale} users/:id target authority`).not.toBe("");
      expect(proposedRoleClause).not.toBe("proposed-role authority");
      expect(targetAuthorityClause).not.toBe("target authority");
      expect(proposedRoleClause).not.toBe(targetAuthorityClause);

      expect(resetPasswordAccess).toBe(updateUserAccess);
      expect(deleteUserAccess).toBe(updateUserAccess);
      expect(resetMfaAccess).toBe(updateUserAccess);

      const rolesParagraphs = extractSectionIntro(doc, relPath, "{#roles}")
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean);
      expect(rolesParagraphs, `${locale} #roles paragraph count`).toHaveLength(2);
      expect(rolesParagraphs[1]).toContain("`user`");
      expect(rolesParagraphs[1]).not.toBe(englishRolesParagraphs[1]);
      expect(rolesParagraphs[1]).not.toContain("authority containment");
      expect(rolesParagraphs[1]).not.toContain("Role creation and mutation");

      const configExportAccess = getAccessCell(
        doc,
        relPath,
        "GET",
        "/api/v1/enterprise/config/export",
      );
      const configImportAccess = getAccessCell(
        doc,
        relPath,
        "POST",
        "/api/v1/enterprise/config/import",
      );
      const scimPostAccess = getAccessCell(doc, relPath, "POST", "/api/v1/enterprise/scim/token");
      const scimDeleteAccess = getAccessCell(
        doc,
        relPath,
        "DELETE",
        "/api/v1/enterprise/scim/token",
      );
      expect(configExportAccess).not.toBe("");
      expect(configExportAccess).not.toBe("Full built-in admin");
      expect(configExportAccess).not.toBe(adminLabel);
      expect(configExportAccess).toBe(configImportAccess);
      expect(scimPostAccess).toBe(configExportAccess);
      expect(scimDeleteAccess).toBe(configExportAccess);
      expect(scimPostAccess).not.toContain("`users:manage`");
      expect(scimPostAccess).not.toContain("`system:health`");

      const purgeUserAccess = getAccessCell(
        doc,
        relPath,
        "DELETE",
        "/api/v1/enterprise/users/:id/purge",
      );
      const purgeTeamAccess = getAccessCell(
        doc,
        relPath,
        "DELETE",
        "/api/v1/enterprise/teams/:id/purge",
      );
      for (const cell of [registerAccess, updateUserAccess, purgeUserAccess, purgeTeamAccess]) {
        expect(cell.startsWith(adminLabel), `${locale} Admin prefix on ${cell}`).toBe(true);
      }

      const purgeUserClause = extractParentheticalClause(purgeUserAccess, "`compliance:manage`");
      const purgeTeamClause = extractParentheticalClause(purgeTeamAccess, "`compliance:manage`");
      expect(purgeUserClause, `${locale} user purge target authority`).toBe(targetAuthorityClause);
      expect(purgeTeamClause, `${locale} team purge all-member authority`).not.toBe("");
      expect(purgeTeamClause).not.toBe("all-member authority");
      expect(purgeTeamClause).not.toBe(targetAuthorityClause);
      expect(purgeTeamClause).not.toBe(proposedRoleClause);

      const scimIntro = extractSectionIntro(doc, relPath, "{#scim-2-0}");
      expect(scimIntro, `${locale} SCIM v2 token note`).toContain("`so_scim_v2_...`");
      expect(scimIntro).not.toBe(englishScimIntro);
      expect(scimIntro).not.toContain("Legacy unversioned tokens");
      expect(scimIntro).not.toContain("must be reissued as");

      const loaded = await docsAdapter.load(locale);
      const entry = loaded.get("api/rest.md");
      expect(entry?.text).toBeTruthy();
      expect(entry?.provenance).toBe("human");
      expect(entry?.sourceHash).toBe(expectedRestDocSourceHash);
      expect(entry?.outputHash).toBe(hash(entry?.text as string));
      expect(entry?.stale).toBe(false);

      expect(doc.match(/^i18n_output_hash:\s*(\S+)$/m)?.[1]).toBe(hash(entry?.text as string));
      expect(doc).not.toMatch(/^i18n_(stale|fallback):/m);
    },
  );
});
