-- users.team holds a teams.id (#1474). The column default used to be the
-- team *name* 'Default', so the bootstrap admin, the anonymous user, and rows
-- imported from 1.x (which stored names) carried a value no teams.id matches:
-- team quotas, MFA policy and other per-team settings skipped them.
--
-- First, a value that names a team (and isn't already some team's id) becomes
-- that team's id. The ids are uuids or 'default-team-00000000', so a name and
-- an id can't collide in practice; the NOT EXISTS keeps an id untouched anyway.
UPDATE "users" u
SET "team" = t."id"
FROM "teams" t
WHERE u."team" = t."name"
  AND NOT EXISTS (SELECT 1 FROM "teams" x WHERE x."id" = u."team");
--> statement-breakpoint
-- Then any 'Default' left over (the Default team was renamed, so no team is
-- called that any more) meant the default team all along: that's the id
-- ensureDefaultTeam() seeds. No team row is inserted here, because the 1.x
-- import runs after migrations and brings its own 'default-team-00000000'.
UPDATE "users"
SET "team" = 'default-team-00000000'
WHERE "team" = 'Default'
  AND NOT EXISTS (SELECT 1 FROM "teams" x WHERE x."id" = 'Default');
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "team" SET DEFAULT 'default-team-00000000';
