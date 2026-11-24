import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";

// Postgres's own default (scram_iterations), so a verifier built here costs the
// same to attack as one the server would have built from the cleartext.
const DEFAULT_ITERATIONS = 4096;
const SALT_BYTES = 16;

/**
 * SASLprep as node-postgres applies it before deriving the login key: non-ASCII
 * spaces become U+0020, the RFC 3454 B.1 characters are dropped, then NFKC.
 * pg keeps this private (pg/lib/crypto/sasl.js), so it is mirrored here. It
 * has to match what the client does, not the full RFC: a verifier derived from
 * a differently prepared password would refuse the very login it was set for.
 */
export function saslprep(password: string): string {
  return (
    password
      .replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000]/g, " ")
      // biome-ignore lint/suspicious/noMisleadingCharacterClass: B.1 lists joiners and variation selectors because they combine; stripping them is the point
      .replace(/[\u00AD\u034F\u1806\u180B\u180C\u180D\u200C\u200D\u2060\uFE00-\uFE0F\uFEFF]/g, "")
      .normalize("NFKC")
  );
}

/**
 * A SCRAM-SHA-256 verifier in the form Postgres stores in pg_authid.
 *
 * Postgres keeps a PASSWORD that is already in this form as is, whatever
 * password_encryption says, so DDL can carry this in place of the cleartext.
 * That keeps the password out of the server log, which records the full text of
 * a failed statement (log_min_error_statement) and, under log_statement = ddl,
 * of a successful one too. A salted, iterated hash is what lands there instead.
 *
 * `salt` exists for tests that recompute a server-built verifier; production
 * callers leave it out and get a fresh random one.
 */
export function scramSha256Verifier(
  password: string,
  { salt = randomBytes(SALT_BYTES), iterations = DEFAULT_ITERATIONS } = {},
): string {
  const salted = pbkdf2Sync(saslprep(password), salt, iterations, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", salted).update("Server Key").digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
}
