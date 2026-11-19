-- sessions.id used to be the raw session token, so anyone who could read the
-- table could sign in as every live session. The server now stores
-- sha256(token) as lowercase hex (hashSessionToken in lib/session-token.ts) and
-- hashes the presented token before the lookup. Rehash existing rows so nobody
-- is signed out by the upgrade. Tokens are 36-character UUIDs and digests are
-- 64 characters, so the length guard makes a re-run a no-op (#4579).
UPDATE "sessions"
SET "id" = encode(sha256(convert_to("id", 'UTF8')), 'hex')
WHERE length("id") <> 64;
