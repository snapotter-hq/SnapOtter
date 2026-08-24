import { describe, expect, it } from "vitest";
import { redactUrl } from "../../../apps/api/src/lib/redact-url.js";

describe("redactUrl", () => {
  it("strips an ordinary password", () => {
    expect(redactUrl("postgres://snapotter_app:apppw@db:5432/snapotter")).toBe(
      "postgres://***@db:5432/snapotter",
    );
  });

  // The userinfo delimiter is the LAST "@" in the authority, so a first-"@"
  // regex would emit "postgres://***@ss@db:5432/snapotter" and leak "ss".
  it("strips a password containing an at sign", () => {
    const out = redactUrl("postgres://user:p@ss@db:5432/snapotter");
    expect(out).toBe("postgres://***@db:5432/snapotter");
    expect(out).not.toContain("ss@db");
  });

  // A URL may carry a password with no username. Testing for both halves with
  // "||" instead of "&&" would return this verbatim, password and all.
  it("strips a password that has no accompanying username", () => {
    const out = redactUrl("postgres://:secret@db:5432/snapotter");
    expect(out).toBe("postgres://***@db:5432/snapotter");
    expect(out).not.toContain("secret");
  });

  it("strips a username with no password", () => {
    expect(redactUrl("postgres://lonelyuser@db:5432/snapotter")).toBe(
      "postgres://***@db:5432/snapotter",
    );
  });

  it("leaves a url with no userinfo unchanged", () => {
    const bare = "postgres://db:5432/snapotter";
    expect(redactUrl(bare)).toBe(bare);
  });

  it("still redacts a string WHATWG URL cannot parse", () => {
    expect(redactUrl("postgres://user:pw@db:0x1f90/snapotter")).toBe(
      "postgres://***@db:0x1f90/snapotter",
    );
  });

  it("does not extend the match into an at sign in the path", () => {
    expect(redactUrl("postgres://user:pw@db:5432/db@name")).toBe("postgres://***@db:5432/db@name");
  });

  // Unparseable AND carrying an "@" after the authority, so it is the only case
  // that exercises the bounded [^/?#]* in the fallback. A greedy ".*@" collapses
  // this to "postgres://***@name", eating host, port and database.
  it("bounds the fallback match to the authority when the path also has an at sign", () => {
    expect(redactUrl("postgres://user:pw@db:0x1f90/db@name")).toBe(
      "postgres://***@db:0x1f90/db@name",
    );
  });
});
