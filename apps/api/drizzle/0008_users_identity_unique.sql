-- Existing installs may already hold twin accounts for one external identity,
-- minted by the #969 race (two tabs finishing a first login at once). Keep the
-- oldest row of each (auth_provider, external_id) group linked and detach the
-- rest by clearing external_id, so the index below can build. Detached rows
-- keep their files, sessions and provider; they just stop answering to the
-- identity, which from here on resolves to exactly one account. A migration
-- cannot write the audit log (rows there carry an HMAC), so to list what this
-- detached afterwards: auth_provider <> 'local' AND external_id IS NULL AND
-- password_hash IS NULL, with updated_at at the time this ran.
UPDATE "users" u
SET "external_id" = NULL, "updated_at" = now()
WHERE u."external_id" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "users" older
    WHERE older."auth_provider" = u."auth_provider"
      AND older."external_id" = u."external_id"
      AND older."id" <> u."id"
      AND (older."created_at" < u."created_at"
        OR (older."created_at" = u."created_at" AND older."id" < u."id"))
  );
--> statement-breakpoint
CREATE UNIQUE INDEX "users_auth_provider_external_id_unique" ON "users" USING btree ("auth_provider","external_id") WHERE "users"."external_id" IS NOT NULL;
