/**
 * Postgres raises SQLSTATE 23505 (unique_violation) when a write loses a
 * duplicate race. Drizzle wraps the pg DatabaseError (the SQLSTATE lives on
 * the cause), so walk the cause chain instead of trusting the top-level
 * shape. Depth-capped in case something ever builds a cyclic cause chain.
 */
function findUniqueViolation(err: unknown): { constraint?: unknown } | undefined {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    if ((current as { code?: unknown }).code === "23505") return current;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export function isUniqueViolation(err: unknown): boolean {
  return findUniqueViolation(err) !== undefined;
}

/**
 * The name of the unique constraint or index a 23505 tripped, for callers
 * that guard more than one and need to say which value collided.
 */
export function uniqueViolationConstraint(err: unknown): string | undefined {
  const constraint = findUniqueViolation(err)?.constraint;
  return typeof constraint === "string" ? constraint : undefined;
}
