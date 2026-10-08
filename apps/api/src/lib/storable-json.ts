// Node 22 has it; the project's ES2022 lib typings don't know it yet.
type WellFormable = string & { toWellFormed(): string };

const toStorableString = (s: string): string =>
  (s.replace(/\0/g, "") as WellFormable).toWellFormed();

/**
 * Make a parsed JSON value safe for a Postgres jsonb column (#2177).
 *
 * jsonb refuses U+0000 and an unpaired UTF-16 surrogate, in keys and strings
 * alike, and a tool request can carry either, so the jobs insert failed and the
 * request answered 500. For the job row's copy of the settings, which is
 * bookkeeping (the worker reads settings from the queue's job data), NUL is
 * dropped, as nothing in a tool's settings means it, and a lone surrogate
 * becomes U+FFFD. Do not use it where the stored value is read back as data:
 * the copy is lossy, and keys that collapse to the same text keep the last
 * one's value. Returns a copy.
 */
export function toStorableJson<T>(value: T): T {
  if (typeof value === "string") return toStorableString(value) as T;
  if (Array.isArray(value)) return value.map(toStorableJson) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      // defineProperty, not assignment, so a "__proto__" key is stored as a key
      // instead of setting the copy's prototype. The object keeps Object.prototype:
      // drizzle reads .constructor on what it serializes.
      Object.defineProperty(out, toStorableString(k), {
        value: toStorableJson(v),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return out as T;
  }
  return value;
}
