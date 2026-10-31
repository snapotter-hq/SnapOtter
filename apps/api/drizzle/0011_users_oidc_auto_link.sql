-- 1.x installations where a user signed in with OIDC auto-link on got
-- linked by email. Their identity was marked as 'local' in the database,
-- with their external_id set to the OIDC subject. 2.x expects 'oidc'.
-- This repairs already-imported databases.

-- First, clear external_id on 'local' rows where the user signed in later
-- without auto-link, creating a brand new 'oidc' row with the same subject.
-- This avoids a unique index violation on (auth_provider, external_id).
UPDATE "users" u1
SET "external_id" = NULL
WHERE u1."auth_provider" = 'local' 
  AND u1."external_id" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "users" u2 
    WHERE u2."external_id" = u1."external_id" 
      AND u2."auth_provider" = 'oidc'
  );
--> statement-breakpoint

-- Then, for the remaining 'local' rows with external_id (no collision), 
-- they are genuine 1.x auto-links. Update their auth_provider to 'oidc'.
UPDATE "users"
SET "auth_provider" = 'oidc'
WHERE "auth_provider" = 'local' 
  AND "external_id" IS NOT NULL;
