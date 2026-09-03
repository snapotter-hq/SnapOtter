/**
 * Postgres raises SQLSTATE 23505 (unique_violation) when a write loses a
 * duplicate race. Drizzle wraps the pg DatabaseError (the SQLSTATE lives on
 * the cause), so walk the cause chain instead of trusting the top-level
 * shape. Depth-capped in case something ever builds a cyclic cause chain.
 */
export function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    if ((current as { code?: unknown }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
