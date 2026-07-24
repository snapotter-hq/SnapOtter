import { hkdf as hkdfCb } from "node:crypto";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  decrypt,
  deriveAuditHmacKey,
  encrypt,
  isEncrypted,
} from "../../../apps/api/src/lib/encryption.js";

// Mutation-hardening tests for encryption.ts. These pin exact key-derivation
// bytes and the on-disk blob layout so that mutations to the encoding strings,
// the HKDF info context, the algorithm, and the format prefix are all observable
// (a round-trip alone stays symmetric and hides them).

const hkdf = promisify(hkdfCb);

const MASTER_KEY = "a".repeat(64); // 32 bytes, hex-encoded
const PREFIX = "$ENC$";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_VERSION = 1;

describe("encryption key derivation is pinned to exact bytes", () => {
  // Golden value computed from the real HKDF-SHA256 with the source's exact
  // parameters: keyBytes = Buffer.from(MASTER_KEY, "hex"), empty salt,
  // info = "snapotter-audit-hmac", length 32. Pinning it kills:
  //   - L13 `Buffer.from(masterKeyHex, "hex")` -> `""` (utf8 decode of the hex
  //     text gives different key bytes -> different digest), and
  //   - L63 info `"snapotter-audit-hmac"` -> `""` (different HKDF info ->
  //     different digest).
  const AUDIT_HMAC_GOLDEN = "41cdf0aef6ab637a8a0d4b5cb2da27adc0ced5789b0cb0652be8e0d22be260b6";

  it("deriveAuditHmacKey matches the exact HKDF-SHA256 golden digest", async () => {
    const key = await deriveAuditHmacKey(MASTER_KEY);
    expect(key.toString("hex")).toBe(AUDIT_HMAC_GOLDEN);
  });

  it("audit-hmac context derives different bytes than the settings context", async () => {
    // Proves the info string genuinely separates the two derived keys. If L63's
    // "snapotter-audit-hmac" collapsed to "" it would collide with a settings
    // key derived from "" rather than staying distinct from the real one.
    const auditKey = await deriveAuditHmacKey(MASTER_KEY);
    const keyBytes = Buffer.from(MASTER_KEY, "hex");
    const settingsKey = Buffer.from(
      await hkdf("sha256", keyBytes, Buffer.alloc(0), "snapotter-settings-encryption", 32),
    );
    expect(auditKey.equals(settingsKey)).toBe(false);
  });

  it("interprets the master key as hex, not raw utf8 bytes", async () => {
    // Buffer.from(hex, "hex") and Buffer.from(hex, "") ("" == utf8) yield
    // different bytes, so the audit key must equal the hex-decoded derivation,
    // not the utf8 one. Kills the L13 encoding mutant directly.
    const hexBytes = Buffer.from(MASTER_KEY, "hex");
    const utf8Bytes = Buffer.from(MASTER_KEY, "utf8");
    const fromHex = Buffer.from(
      await hkdf("sha256", hexBytes, Buffer.alloc(0), "snapotter-audit-hmac", 32),
    );
    const fromUtf8 = Buffer.from(
      await hkdf("sha256", utf8Bytes, Buffer.alloc(0), "snapotter-audit-hmac", 32),
    );
    expect(fromHex.equals(fromUtf8)).toBe(false);
    const derived = await deriveAuditHmacKey(MASTER_KEY);
    expect(derived.equals(fromHex)).toBe(true);
    expect(derived.equals(fromUtf8)).toBe(false);
  });
});

describe("encryption blob layout is pinned", () => {
  it("prefixes ciphertext with exactly $ENC$ and base64 the rest", async () => {
    const encrypted = await encrypt("payload", MASTER_KEY);
    expect(encrypted.startsWith(PREFIX)).toBe(true);
    const body = encrypted.slice(PREFIX.length);
    // The remainder must be valid, canonical base64 (round-trips byte-identical).
    const decoded = Buffer.from(body, "base64");
    expect(decoded.toString("base64")).toBe(body);
  });

  it("lays out [version][12-byte IV][16-byte tag][ciphertext]", async () => {
    const plaintext = "layout-check";
    const encrypted = await encrypt(plaintext, MASTER_KEY);
    const blob = Buffer.from(encrypted.slice(PREFIX.length), "base64");

    expect(blob[0]).toBe(KEY_VERSION);
    // Ciphertext length equals plaintext byte length for a stream cipher (GCM).
    const plaintextBytes = Buffer.byteLength(plaintext, "utf8");
    const expectedTotal = 1 + IV_LENGTH + AUTH_TAG_LENGTH + plaintextBytes;
    expect(blob.length).toBe(expectedTotal);
  });

  it("uses a 16-byte GCM auth tag (rejects a truncated tag)", async () => {
    // Confirms AUTH_TAG_LENGTH is honored: a decrypt fed a blob whose tag region
    // is corrupted must fail. Together with the exact-length layout above this
    // guards the GCM tag boundary.
    const encrypted = await encrypt("tag-boundary", MASTER_KEY);
    const blob = Buffer.from(encrypted.slice(PREFIX.length), "base64");
    // Flip a byte inside the 16-byte tag (offset 1 + IV_LENGTH .. +tag).
    blob[1 + IV_LENGTH] ^= 0xff;
    const tampered = `${PREFIX}${blob.toString("base64")}`;
    expect(await decrypt(tampered, MASTER_KEY)).toBeNull();
  });
});

describe("encryption round-trip and tamper resistance", () => {
  it("recovers the exact plaintext through a real encrypt -> decrypt", async () => {
    const plaintext = "exact-plaintext-\u{1F9A6}-value";
    const encrypted = await encrypt(plaintext, MASTER_KEY);
    expect(encrypted).not.toBe(plaintext);
    expect(await decrypt(encrypted, MASTER_KEY)).toBe(plaintext);
  });

  it("fails to decrypt when the ciphertext body is tampered", async () => {
    const encrypted = await encrypt("do-not-tamper", MASTER_KEY);
    const blob = Buffer.from(encrypted.slice(PREFIX.length), "base64");
    // Flip a byte in the ciphertext region (after version + IV + tag).
    const ctStart = 1 + IV_LENGTH + AUTH_TAG_LENGTH;
    blob[ctStart] ^= 0xff;
    const tampered = `${PREFIX}${blob.toString("base64")}`;
    expect(await decrypt(tampered, MASTER_KEY)).toBeNull();
  });

  it("fails to decrypt when the IV is tampered", async () => {
    const encrypted = await encrypt("iv-integrity", MASTER_KEY);
    const blob = Buffer.from(encrypted.slice(PREFIX.length), "base64");
    blob[1] ^= 0xff; // first IV byte
    const tampered = `${PREFIX}${blob.toString("base64")}`;
    expect(await decrypt(tampered, MASTER_KEY)).toBeNull();
  });

  it("returns null (not throw) when both current and previous keys fail", async () => {
    // Exercises the previousKeyHex branch on line 54 with a real second key that
    // still cannot decrypt, so the tail returns null.
    const encrypted = await encrypt("secret", MASTER_KEY);
    const wrongCurrent = "b".repeat(64);
    const wrongPrevious = "c".repeat(64);
    expect(await decrypt(encrypted, wrongCurrent, wrongPrevious)).toBeNull();
  });

  it("passes an $ENC$-prefixed value back through the previous key", async () => {
    const oldKey = "d".repeat(64);
    const newKey = "e".repeat(64);
    const encrypted = await encrypt("rotate-me", oldKey);
    expect(await decrypt(encrypted, newKey, oldKey)).toBe("rotate-me");
  });

  it("isEncrypted keys off the exact $ENC$ prefix", () => {
    expect(isEncrypted(`${PREFIX}anything`)).toBe(true);
    expect(isEncrypted("$ENC")).toBe(false);
    expect(isEncrypted("ENC$payload")).toBe(false);
    expect(isEncrypted(" $ENC$leadingspace")).toBe(false);
  });
});
