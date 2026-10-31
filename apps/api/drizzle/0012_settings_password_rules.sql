-- 2.0 and 2.1 saved the digit password rule under passwordRequireNumber; 2.2+
-- reads and writes passwordRequireDigit. Move an old row over when the new key
-- is absent, then drop any leftover passwordRequireNumber row (#2036).
UPDATE "settings"
SET "key" = 'passwordRequireDigit'
WHERE "key" = 'passwordRequireNumber'
  AND NOT EXISTS (
    SELECT 1 FROM "settings" WHERE "key" = 'passwordRequireDigit'
  );
--> statement-breakpoint
DELETE FROM "settings"
WHERE "key" = 'passwordRequireNumber';
--> statement-breakpoint
-- The three default-on rules enforce unless stored as 'false' (#2026), and the
-- special-character rule defaults off and enforces only when stored as 'true'.
-- Rewrite any non-canonical values (such as 'TRUE' or '1' from before #618 or a
-- hand edit) to 'true' or 'false' so config exports and settings reads see
-- canonical strings.
UPDATE "settings"
SET "value" = 'true'
WHERE "key" IN ('passwordRequireUppercase', 'passwordRequireLowercase', 'passwordRequireDigit')
  AND "value" NOT IN ('true', 'false');
--> statement-breakpoint
UPDATE "settings"
SET "value" = 'false'
WHERE "key" = 'passwordRequireSpecial'
  AND "value" NOT IN ('true', 'false');
