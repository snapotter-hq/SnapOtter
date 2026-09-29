ALTER TABLE "users" ADD COLUMN "scim_external_id" text;--> statement-breakpoint
-- SCIM's externalId used to live in external_id next to OIDC subjects and SAML
-- NameIDs (#1510). An OIDC auto-link rewrites external_id, which lost the id
-- the IdP provisions and deprovisions the user by, and the SCIM externalId
-- filter matched other providers' rows that happened to share a value. Move
-- the rows SCIM owns over. (auth_provider, external_id) was already unique, so
-- the SCIM rows' values are distinct and the index below builds. Rows that an
-- OIDC link already rewrote lost their SCIM id before this ran; there is
-- nothing left to move for them.
UPDATE "users"
SET "scim_external_id" = "external_id", "external_id" = NULL
WHERE "auth_provider" = 'scim' AND "external_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "users_scim_external_id_unique" ON "users" USING btree ("scim_external_id") WHERE "users"."scim_external_id" IS NOT NULL;
