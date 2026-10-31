ALTER TABLE "users" ADD COLUMN "scim_external_id" text;--> statement-breakpoint
-- SCIM's externalId used to live in external_id next to OIDC subjects and SAML
-- NameIDs (#1510). An OIDC auto-link rewrites external_id, which lost the id
-- the IdP provisions and deprovisions the user by, and the SCIM externalId
-- filter matched other providers' rows that happened to share a value. Move
-- the rows SCIM owns over. (auth_provider, external_id) was already unique, so
-- the SCIM rows' values are distinct and the index below builds. A blank id is
-- no id (the #1008 rule the routes apply), so it lands as NULL; anything else
-- moves verbatim, padding included, so the eq filter still matches it.
--
-- Rows an OIDC or SAML link already took over are no longer 'scim' rows and
-- stay as they are: their SCIM id was overwritten, or was written into the
-- sign-in identity by an older SCIM PUT or PATCH. The IdP restores it on its
-- next update that carries externalId.
UPDATE "users"
SET "scim_external_id" = CASE WHEN btrim("external_id") = '' THEN NULL ELSE "external_id" END,
    "external_id" = NULL
WHERE "auth_provider" = 'scim' AND "external_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "users_scim_external_id_unique" ON "users" USING btree ("scim_external_id") WHERE "users"."scim_external_id" IS NOT NULL;
