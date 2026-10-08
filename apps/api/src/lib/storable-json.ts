// Node 22 has it; the project's ES2022 lib typings don't know it yet.
type WellFormable = string & { toWellFormed(): string };

const toStorableString = (s: string): string =>
  (s.replace(/\0/g, "") as WellFormable).toWellFormed();

/**
 * Make a parsed JSON value safe for a Postgres jsonb column (#2177).
 *
 * jsonb refuses U+0000 and an unpaired UTF-16 surrogate, in keys and strings
 * alike, and a tool request can carry either, so the jobs insert failed and the
 * request answered 500. The stored copy is bookkeeping (the worker reads
 * settings from the queue's job data), so NUL is dropped, as nothing in a tool's
 * settings means it, and a lone surrogate becomes U+FFFD. Returns a copy.
 */
export function toStorableJson<T>(value: T): T {
  if (typeof value === "string") return toStorableString(value) as T;
  if (Array.isArray(value)) return value.map(toStorableJson) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[toStorableString(k)] = toStorableJson(v);
    return out as T;
  }
  return value;
}
