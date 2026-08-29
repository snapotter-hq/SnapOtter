// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The pricing copy sells OIDC as working with "Google, Okta, any provider", and
 * OIDC is ungated (apps/api/src/plugins/oidc.ts). But for a long time the only
 * documented Entra ID path was the enterprise SAML guide, so Entra admins
 * concluded SSO needed a paid license (#921). This pins the free OIDC guide to
 * the providers the public copy names, under the anchors other pages link to.
 */

const ROOT = path.resolve(__dirname, "../../..");
const GUIDE = readFileSync(path.join(ROOT, "apps/docs/guide/oidc.md"), "utf8");

describe("OIDC guide provider coverage", () => {
  it("documents Entra ID under the same anchor the SAML guide uses", () => {
    expect(GUIDE).toMatch(/^### Azure AD \/ Entra ID \{#azure-ad-entra-id\}$/m);
  });

  it("gives the tenant-scoped issuer URL, the only form that passes discovery", () => {
    // The multi-tenant `common`/`organizations` endpoints advertise the literal
    // template {tenantid} as their issuer, which openid-client rejects.
    expect(GUIDE).toContain("https://login.microsoftonline.com/<tenant-id>/v2.0");
  });

  it("names Entra ID in the frontmatter description search engines show", () => {
    const description = GUIDE.match(/^description: (.*)$/m)?.[1] ?? "";
    expect(description).toContain("Entra ID");
  });

  it("mentions Okta, which the free-tier pricing copy names explicitly", () => {
    expect(GUIDE).toContain("Okta");
  });
});
