import { describe, expect, it } from "vitest";
import {
  DECODED_DATA_NOT_TEXT,
  decodeBase64Text,
  ENCODED_TEXT_INVALID,
  encodeBase64Text,
} from "../../../apps/api/src/lib/base64-text.js";

describe("encodeBase64Text", () => {
  it("encodes UTF-8 text with the standard alphabet and padding", () => {
    expect(encodeBase64Text("Hello, World!", false)).toBe("SGVsbG8sIFdvcmxkIQ==");
  });

  it("encodes multi-byte characters as UTF-8", () => {
    expect(encodeBase64Text("héllo ✓", false)).toBe(Buffer.from("héllo ✓").toString("base64"));
  });

  it("uses - and _ without padding when URL-safe", () => {
    expect(encodeBase64Text("~~~?>?a", false)).toBe("fn5+Pz4/YQ==");
    expect(encodeBase64Text("~~~?>?a", true)).toBe("fn5-Pz4_YQ");
  });

  it("encodes the empty string to the empty string", () => {
    expect(encodeBase64Text("", false)).toBe("");
  });
});

describe("decodeBase64Text", () => {
  it("decodes standard Base64", () => {
    expect(decodeBase64Text("SGVsbG8sIFdvcmxkIQ==")).toEqual({ ok: true, text: "Hello, World!" });
  });

  it("round-trips multi-byte text in both alphabets", () => {
    const text = "Grüße, 世界! 🦦 <>?~";
    expect(decodeBase64Text(encodeBase64Text(text, false))).toEqual({ ok: true, text });
    expect(decodeBase64Text(encodeBase64Text(text, true))).toEqual({ ok: true, text });
  });

  it("accepts input without padding", () => {
    expect(decodeBase64Text("SGVsbG8sIFdvcmxkIQ")).toEqual({ ok: true, text: "Hello, World!" });
  });

  it("ignores whitespace and line breaks from wrapped input", () => {
    const wrapped = "  SGVsbG8s\r\nIFdv\ncmxk\tIQ==\n";
    expect(decodeBase64Text(wrapped)).toEqual({ ok: true, text: "Hello, World!" });
  });

  it("rejects characters outside the alphabet instead of skipping them", () => {
    expect(decodeBase64Text("SGVs*bG8=")).toEqual({ ok: false, code: ENCODED_TEXT_INVALID });
    expect(decodeBase64Text("hello world!")).toEqual({ ok: false, code: ENCODED_TEXT_INVALID });
  });

  it("rejects a mix of standard and URL-safe characters", () => {
    expect(decodeBase64Text("ab+_")).toEqual({ ok: false, code: ENCODED_TEXT_INVALID });
  });

  it("rejects padding in the middle", () => {
    expect(decodeBase64Text("SGVs=bG8=")).toEqual({ ok: false, code: ENCODED_TEXT_INVALID });
  });

  it("rejects a length that cannot hold whole bytes", () => {
    expect(decodeBase64Text("SGVsb")).toEqual({ ok: false, code: ENCODED_TEXT_INVALID });
  });

  it("rejects padding that leaves the length off a multiple of four", () => {
    expect(decodeBase64Text("SGVsbG8==")).toEqual({ ok: false, code: ENCODED_TEXT_INVALID });
    expect(decodeBase64Text("SGU=x")).toEqual({ ok: false, code: ENCODED_TEXT_INVALID });
  });

  it("refuses binary payloads that are not UTF-8 text", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff]).toString(
      "base64",
    );
    expect(decodeBase64Text(png)).toEqual({ ok: false, code: DECODED_DATA_NOT_TEXT });
  });

  it("decodes the empty string to the empty string", () => {
    expect(decodeBase64Text("")).toEqual({ ok: true, text: "" });
  });
});
