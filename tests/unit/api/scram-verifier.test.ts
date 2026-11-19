import { describe, expect, it } from "vitest";
import { saslprep, scramSha256Verifier } from "../../../apps/api/src/db/scram-verifier.js";

// The integration suite (tests/integration/platform/db-role-bootstrap.test.ts)
// proves the verifier matches what Postgres derives. These pin the shape and the
// SASLprep mapping without a server.
describe("scramSha256Verifier", () => {
  it("produces the pg_authid format with Postgres's default iteration count", () => {
    expect(scramSha256Verifier("secret")).toMatch(
      /^SCRAM-SHA-256\$4096:[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=:[A-Za-z0-9+/]{43}=$/,
    );
  });

  it("never contains the password", () => {
    expect(scramSha256Verifier("canary-value")).not.toContain("canary-value");
  });

  it("salts every call afresh", () => {
    expect(scramSha256Verifier("secret")).not.toBe(scramSha256Verifier("secret"));
  });

  it("is deterministic for a given salt and iteration count", () => {
    const options = { salt: Buffer.alloc(16, 7), iterations: 4096 };
    expect(scramSha256Verifier("secret", options)).toBe(scramSha256Verifier("secret", options));
    expect(scramSha256Verifier("secret", options)).not.toBe(
      scramSha256Verifier("secret2", options),
    );
  });

  it("derives from the SASLprep form, as node-postgres does when it logs in", () => {
    const options = { salt: Buffer.alloc(16, 1), iterations: 4096 };
    const fullwidth = String.fromCodePoint(0xff46, 0xff55, 0xff4c, 0xff4c);
    expect(scramSha256Verifier(`pw-${fullwidth}`, options)).toBe(
      scramSha256Verifier("pw-full", options),
    );
  });
});

describe("saslprep", () => {
  it("leaves ASCII untouched", () => {
    expect(saslprep("plain 'pw\"x")).toBe("plain 'pw\"x");
  });

  it("maps non-ASCII spaces to a plain space", () => {
    expect(saslprep(`a${String.fromCodePoint(0x00a0)}b${String.fromCodePoint(0x3000)}c`)).toBe(
      "a b c",
    );
  });

  it("drops characters RFC 3454 maps to nothing", () => {
    expect(saslprep(`a${String.fromCodePoint(0x00ad)}b${String.fromCodePoint(0x200d)}c`)).toBe(
      "abc",
    );
  });

  it("applies NFKC", () => {
    expect(saslprep(String.fromCodePoint(0xff41, 0x2460))).toBe("a1");
  });
});
