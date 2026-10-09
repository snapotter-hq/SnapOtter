// Node 22 has it; the project's ES2022 lib typings don't know it yet.
type WellFormable = string & { toWellFormed(): string; isWellFormed(): boolean };

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

/**
 * True when every key and string in a parsed JSON value can be stored as
 * Postgres jsonb (#2184): no U+0000 and no unpaired surrogate, at any depth.
 * Routes that keep what the client sent and read it back as data use this to
 * answer 400 instead of silently rewriting it the way toStorableJson does.
 *
 * Walks with an explicit stack: Postgres stores jsonb nested far deeper than
 * the call stack recurses, and a RangeError here would turn a body that used to
 * save into a 500.
 */
export function isStorableJson(value: unknown): boolean {
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const v = pending.pop();
    if (typeof v === "string") {
      if (!isStorableString(v)) return false;
    } else if (Array.isArray(v)) {
      for (const item of v) pending.push(item);
    } else if (v && typeof v === "object") {
      for (const [k, item] of Object.entries(v)) {
        if (!isStorableString(k)) return false;
        pending.push(item);
      }
    }
  }
  return true;
}

const isStorableString = (s: string): boolean =>
  !s.includes("\0") && (s as WellFormable).isWellFormed();
