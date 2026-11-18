import { describe, expect, it } from "vitest";
import { loadEnv } from "../../apps/api/src/lib/env.js";

// A blank numeric variable (`PORT=` in a Compose file with `${PORT}` unset, an
// empty field in a container manager's form) must keep its default. Zod's
// `.default()` only applies to `undefined`, and `Number("")` is 0, so a blank
// PORT bound a random port and a blank limit silently lifted it (#4499).
describe("env blank numeric values", () => {
  const cases: Array<[string, number]> = [
    ["PORT", 1349],
    ["RATE_LIMIT_PER_MIN", 1000],
    ["MAX_UPLOAD_SIZE_MB", 100],
    ["SESSION_DURATION_HOURS", 168],
    ["LOGIN_ATTEMPT_LIMIT", 10],
    ["API_KEYS_RATE_LIMIT_PER_MIN", 30],
    ["FILE_MAX_AGE_HOURS", 72],
    ["LOGIN_THROTTLE_MAX_FAILURES", 10],
    ["LOGIN_THROTTLE_WINDOW_S", 900],
    ["OIDC_CLOCK_TOLERANCE", 30],
  ];

  it.each(cases)("%s= keeps its default %d", (name, fallback) => {
    expect(loadEnv({ [name]: "" })[name as keyof ReturnType<typeof loadEnv>]).toBe(fallback);
  });

  it.each(cases)("whitespace-only %s keeps its default %d", (name, fallback) => {
    expect(loadEnv({ [name]: "  " })[name as keyof ReturnType<typeof loadEnv>]).toBe(fallback);
  });

  it("still parses an explicit value", () => {
    const env = loadEnv({ PORT: "8080", RATE_LIMIT_PER_MIN: " 25 " });
    expect(env.PORT).toBe(8080);
    expect(env.RATE_LIMIT_PER_MIN).toBe(25);
  });

  it("still rejects a value that is not a number", () => {
    expect(() => loadEnv({ PORT: "eighty" })).toThrow();
  });

  it("leaves non-numeric variables alone: a blank HOST still stops the boot", () => {
    expect(() => loadEnv({ HOST: "" })).toThrow(/HOST must be an IP address/);
  });
});
