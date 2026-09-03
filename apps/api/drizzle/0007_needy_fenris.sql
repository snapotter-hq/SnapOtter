-- Existing installs may already hold case-twin teams, minted by the #970
-- race or by history predating the case-insensitive pre-check. Keep the
-- oldest row of each lower(name) group and rename the rest by appending
-- their id (unique), so the index below can build. Members are attached by
-- team id, so renamed teams keep their members.
UPDATE "teams" t
SET "name" = t."name" || '-' || t."id"
WHERE EXISTS (
  SELECT 1 FROM "teams" older
  WHERE lower(older."name") = lower(t."name")
    AND older."id" <> t."id"
    AND (older."created_at" < t."created_at"
      OR (older."created_at" = t."created_at" AND older."id" < t."id"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "teams_name_lower_unique" ON "teams" USING btree (lower("name"));
