-- New installs accept any non-empty password: the uppercase, lowercase and
-- digit rules now default off and the minimum length defaults to 1. An install
-- that already has users keeps the rules it was enforcing, so pin the old
-- defaults (8 characters, uppercase, lowercase, digit) wherever no row exists.
-- Rows an admin saved are left alone. Migrations run before the default admin
-- is created, so a fresh database has no users here and stays relaxed.
INSERT INTO "settings" ("key", "value", "updated_at")
SELECT defaults."key", defaults."value", now()
FROM (
  VALUES
    ('passwordMinLength', '8'),
    ('passwordRequireUppercase', 'true'),
    ('passwordRequireLowercase', 'true'),
    ('passwordRequireDigit', 'true')
) AS defaults ("key", "value")
WHERE EXISTS (SELECT 1 FROM "users")
ON CONFLICT ("key") DO NOTHING;
