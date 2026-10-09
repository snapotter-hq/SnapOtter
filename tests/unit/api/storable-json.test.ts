/**
 * #2177: a tool request whose settings carry a NUL in an object key or a lone
 * UTF-16 surrogate in a string or key answered 500, because Postgres jsonb
 * refuses both and the jobs insert failed. The stored copy is bookkeeping, so
 * toStorableJson() makes it storable instead of the request failing.
 */

import { describe, expect, it } from "vitest";
import { isStorableJson, toStorableJson } from "../../../apps/api/src/lib/storable-json.js";

const NUL = String.fromCharCode(0);
const HIGH = String.fromCharCode(0xd800);
const LOW = String.fromCharCode(0xdc00);
const REPLACEMENT = String.fromCharCode(0xfffd);
// U+1F600 as the surrogate pair JSON and JS both write for it.
const EMOJI = String.fromCodePoint(0x1f600);

describe("toStorableJson", () => {
  it("drops NUL from strings and from object keys", () => {
    expect(toStorableJson({ [`a${NUL}b`]: `x${NUL}y` })).toEqual({ ab: "xy" });
  });

  it("replaces a lone high surrogate with U+FFFD", () => {
    expect(toStorableJson({ a: `x${HIGH}y` })).toEqual({ a: `x${REPLACEMENT}y` });
  });

  it("replaces a lone low surrogate with U+FFFD", () => {
    expect(toStorableJson({ a: `x${LOW}y` })).toEqual({ a: `x${REPLACEMENT}y` });
  });

  it("replaces a lone surrogate in an object key", () => {
    expect(toStorableJson({ [`k${HIGH}`]: 1 })).toEqual({ [`k${REPLACEMENT}`]: 1 });
  });

  it("keeps a valid surrogate pair", () => {
    expect(toStorableJson({ a: `hi ${EMOJI}`, [EMOJI]: 1 })).toEqual({
      a: `hi ${EMOJI}`,
      [EMOJI]: 1,
    });
  });

  it("walks arrays and nested objects", () => {
    expect(
      toStorableJson({ list: [`a${NUL}`, { deep: [`b${HIGH}`] }], n: { [`k${NUL}`]: `v${NUL}` } }),
    ).toEqual({ list: ["a", { deep: [`b${REPLACEMENT}`] }], n: { k: "v" } });
  });

  it("leaves numbers, booleans and null as they are", () => {
    expect(toStorableJson({ n: 1.5, t: true, f: false, z: null })).toEqual({
      n: 1.5,
      t: true,
      f: false,
      z: null,
    });
  });

  it("does not change its input", () => {
    const input = { [`a${NUL}`]: [`x${HIGH}`] };
    toStorableJson(input);
    expect(Object.keys(input)).toEqual([`a${NUL}`]);
    expect(input[`a${NUL}`]).toEqual([`x${HIGH}`]);
  });

  it("stores a __proto__ key as a key and leaves the prototype alone", () => {
    const out = toStorableJson(JSON.parse('{"__proto__":{"polluted":true},"scale":"log"}')) as {
      polluted?: boolean;
    };

    expect(Object.keys(out).sort()).toEqual(["__proto__", "scale"]);
    expect(out.polluted).toBeUndefined();
    // A normal object: drizzle reads .constructor on what it serializes.
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(JSON.parse(JSON.stringify(out))).toEqual({
      ["__proto__"]: { polluted: true },
      scale: "log",
    });
  });

  it("returns objects that read .constructor like any other", () => {
    const out = toStorableJson({ a: { b: 1 } });

    expect(out.constructor).toBe(Object);
    expect(out.a.constructor).toBe(Object);
  });

  it("keeps the last value when keys collapse to the same text", () => {
    expect(toStorableJson({ [`a${NUL}b`]: 1, ab: 2 })).toEqual({ ab: 2 });
    expect(toStorableJson({ ab: 1, [`a${NUL}b`]: 2 })).toEqual({ ab: 2 });
  });

  it("returns something JSON.stringify and a jsonb column accept", () => {
    const out = JSON.stringify(toStorableJson({ [`a${NUL}`]: `x${HIGH}${NUL}` }));
    // JSON.stringify writes a lone surrogate or NUL as an escape; none may remain.
    expect(out.toLowerCase()).not.toContain("\\ud8");
    expect(out).not.toContain("\\u0000");
  });
});

// Where the stored value is read back as data (preferences, saved pipelines,
// API-key names), a lossy copy would be wrong, so these refuse instead (#2184).
describe("isStorableJson", () => {
  it("accepts ordinary text, numbers, booleans, null, arrays and nesting", () => {
    expect(isStorableJson({ a: "ok", n: 1.5, t: true, z: null, list: ["x", { deep: "y" }] })).toBe(
      true,
    );
    expect(isStorableJson("plain")).toBe(true);
    expect(isStorableJson(null)).toBe(true);
  });

  it("accepts a valid surrogate pair and non-Latin text", () => {
    expect(isStorableJson({ a: `hi ${EMOJI}`, [EMOJI]: 1, ja: "日本語" })).toBe(true);
  });

  it("rejects a NUL in a string, at any depth", () => {
    expect(isStorableJson(`x${NUL}y`)).toBe(false);
    expect(isStorableJson({ a: `x${NUL}y` })).toBe(false);
    expect(isStorableJson({ a: [{ b: `x${NUL}` }] })).toBe(false);
  });

  it("rejects a NUL in an object key", () => {
    expect(isStorableJson({ [`a${NUL}b`]: 1 })).toBe(false);
    expect(isStorableJson({ outer: { [`a${NUL}b`]: 1 } })).toBe(false);
  });

  it("rejects a lone surrogate in a string or a key", () => {
    expect(isStorableJson({ a: `x${HIGH}y` })).toBe(false);
    expect(isStorableJson({ a: `x${LOW}y` })).toBe(false);
    expect(isStorableJson({ [`k${HIGH}`]: 1 })).toBe(false);
    expect(isStorableJson([`x${HIGH}`])).toBe(false);
  });

  it("walks 20000 levels of nesting without overflowing the stack", () => {
    const nest = (leaf: string) =>
      JSON.parse(`${'{"a":['.repeat(10_000)}${JSON.stringify(leaf)}${"]}".repeat(10_000)}`);
    expect(isStorableJson(nest("fine"))).toBe(true);
    expect(isStorableJson(nest(`x${NUL}`))).toBe(false);
  });

  it("sees a NUL under a __proto__ key that JSON.parse kept as a normal key", () => {
    expect(isStorableJson(JSON.parse(`{"a":{"__proto__":"x\\u0000"}}`))).toBe(false);
  });
});
