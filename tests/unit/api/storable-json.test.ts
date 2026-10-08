/**
 * #2177: a tool request whose settings carry a NUL in an object key or a lone
 * UTF-16 surrogate in a string or key answered 500, because Postgres jsonb
 * refuses both and the jobs insert failed. The stored copy is bookkeeping, so
 * toStorableJson() makes it storable instead of the request failing.
 */

import { describe, expect, it } from "vitest";
import { toStorableJson } from "../../../apps/api/src/lib/storable-json.js";

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

  it("returns something JSON.stringify and a jsonb column accept", () => {
    const out = JSON.stringify(toStorableJson({ [`a${NUL}`]: `x${HIGH}${NUL}` }));
    // JSON.stringify writes a lone surrogate or NUL as an escape; none may remain.
    expect(out.toLowerCase()).not.toContain("\\ud8");
    expect(out).not.toContain("\\u0000");
  });
});
