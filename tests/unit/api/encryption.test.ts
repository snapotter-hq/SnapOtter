import { afterEach, describe, expect, it } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import {
  decrypt,
  decryptSetting,
  decryptSettingWithRotation,
  deriveAuditHmacKey,
  encrypt,
  isEncrypted,
} from "../../../apps/api/src/lib/encryption.js";

const PREFIX_LEN = "$ENC$".length;

describe("encryption", () => {
  const testKey = "a".repeat(64); // 32 bytes hex-encoded

  it("encrypts and decrypts a value", async () => {
    const plaintext = "my-secret-oidc-client-secret";
    const encrypted = await encrypt(plaintext, testKey);
    expect(encrypted).not.toBe(plaintext);
    expect(isEncrypted(encrypted)).toBe(true);
    const decrypted = await decrypt(encrypted, testKey);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertext for same plaintext (random IV)", async () => {
    const plaintext = "same-value";
    const a = await encrypt(plaintext, testKey);
    const b = await encrypt(plaintext, testKey);
    expect(a).not.toBe(b);
  });

  it("isEncrypted returns false for plaintext", () => {
    expect(isEncrypted("just-a-normal-value")).toBe(false);
    expect(isEncrypted("")).toBe(false);
  });

  it("decrypt returns null for wrong key", async () => {
    const encrypted = await encrypt("secret", testKey);
    const wrongKey = "b".repeat(64);
    const result = await decrypt(encrypted, wrongKey);
    expect(result).toBeNull();
  });

  it("decrypt tries previous key on failure", async () => {
    const oldKey = "c".repeat(64);
    const newKey = "d".repeat(64);
    const encrypted = await encrypt("secret", oldKey);
    const result = await decrypt(encrypted, newKey, oldKey);
    expect(result).toBe("secret");
  });

  it("decrypt passes through non-encrypted values", async () => {
    const result = await decrypt("plain-text-value", testKey);
    expect(result).toBe("plain-text-value");
  });

  it("deriveAuditHmacKey produces a 32-byte buffer", async () => {
    const key = await deriveAuditHmacKey(testKey);
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });

  it("encrypts and decrypts an empty string", async () => {
    const encrypted = await encrypt("", testKey);
    expect(isEncrypted(encrypted)).toBe(true);
    const decrypted = await decrypt(encrypted, testKey);
    expect(decrypted).toBe("");
  });

  it("encrypts and decrypts a very long input", async () => {
    const plaintext = "x".repeat(10_000);
    const encrypted = await encrypt(plaintext, testKey);
    const decrypted = await decrypt(encrypted, testKey);
    expect(decrypted).toBe(plaintext);
  });

  it("encrypts and decrypts unicode and emoji characters", async () => {
    const plaintext = "\u{1F9A6}\u{1F30A} Otter says: éàüß 你好 АБВ";
    const encrypted = await encrypt(plaintext, testKey);
    const decrypted = await decrypt(encrypted, testKey);
    expect(decrypted).toBe(plaintext);
  });

  it("encrypts and decrypts special characters (newlines, tabs, null bytes)", async () => {
    const plaintext = "line1\nline2\ttab\0null\r\nwindows";
    const encrypted = await encrypt(plaintext, testKey);
    const decrypted = await decrypt(encrypted, testKey);
    expect(decrypted).toBe(plaintext);
  });

  it("isEncrypted returns true for $ENC$ prefix with invalid base64", () => {
    expect(isEncrypted("$ENC$!!!not-valid-base64%%%")).toBe(true);
  });

  it("decrypt returns null for $ENC$ with truncated data", async () => {
    const result = await decrypt("$ENC$AQID", testKey);
    expect(result).toBeNull();
  });

  it("decrypt returns null for $ENC$ with corrupted ciphertext", async () => {
    const encrypted = await encrypt("hello", testKey);
    const corrupted = `${encrypted.slice(0, PREFIX_LEN + 10)}AAAA${encrypted.slice(PREFIX_LEN + 14)}`;
    const result = await decrypt(corrupted, testKey);
    expect(result).toBeNull();
  });

  it("deriveAuditHmacKey produces different keys for different master keys", async () => {
    const keyA = await deriveAuditHmacKey("a".repeat(64));
    const keyB = await deriveAuditHmacKey("b".repeat(64));
    expect(keyA.equals(keyB)).toBe(false);
  });

  it("deriveAuditHmacKey is deterministic", async () => {
    const first = await deriveAuditHmacKey(testKey);
    const second = await deriveAuditHmacKey(testKey);
    expect(first.equals(second)).toBe(true);
  });

  it("two encryptions of the same plaintext decrypt to the same value", async () => {
    const plaintext = "roundtrip-check";
    const encA = await encrypt(plaintext, testKey);
    const encB = await encrypt(plaintext, testKey);
    expect(encA).not.toBe(encB);
    expect(await decrypt(encA, testKey)).toBe(plaintext);
    expect(await decrypt(encB, testKey)).toBe(plaintext);
  });

  describe("decryptSetting", () => {
    const originalKey = env.DATA_ENCRYPTION_KEY;
    const originalPrevKey = env.DATA_ENCRYPTION_KEY_PREVIOUS;
    const keyA = "a".repeat(64);
    const keyB = "b".repeat(64);

    afterEach(() => {
      env.DATA_ENCRYPTION_KEY = originalKey;
      env.DATA_ENCRYPTION_KEY_PREVIOUS = originalPrevKey;
    });

    it("decrypts an encrypted value with DATA_ENCRYPTION_KEY", async () => {
      const encrypted = await encrypt("Bearer secret", keyA);
      env.DATA_ENCRYPTION_KEY = keyA;
      env.DATA_ENCRYPTION_KEY_PREVIOUS = "";
      expect(await decryptSetting(encrypted)).toBe("Bearer secret");
    });

    it("falls back to DATA_ENCRYPTION_KEY_PREVIOUS during key rotation", async () => {
      const encrypted = await encrypt("Bearer rotated", keyA);
      env.DATA_ENCRYPTION_KEY = keyB;
      env.DATA_ENCRYPTION_KEY_PREVIOUS = keyA;
      expect(await decryptSetting(encrypted)).toBe("Bearer rotated");
    });

    it("returns null for an encrypted value when DATA_ENCRYPTION_KEY is unset", async () => {
      const encrypted = await encrypt("Bearer secret", keyA);
      env.DATA_ENCRYPTION_KEY = "";
      env.DATA_ENCRYPTION_KEY_PREVIOUS = keyA;
      expect(await decryptSetting(encrypted)).toBeNull();
    });

    it("returns null when neither current nor previous key matches", async () => {
      const encrypted = await encrypt("Bearer secret", keyA);
      env.DATA_ENCRYPTION_KEY = keyB;
      env.DATA_ENCRYPTION_KEY_PREVIOUS = "c".repeat(64);
      expect(await decryptSetting(encrypted)).toBeNull();
    });

    it("passes through plaintext values whether or not a key is configured", async () => {
      env.DATA_ENCRYPTION_KEY = "";
      env.DATA_ENCRYPTION_KEY_PREVIOUS = "";
      expect(await decryptSetting("Bearer plain")).toBe("Bearer plain");
      expect(await decryptSetting("")).toBe("");

      env.DATA_ENCRYPTION_KEY = keyA;
      expect(await decryptSetting("Bearer plain")).toBe("Bearer plain");
    });
  });

  describe("decryptSettingWithRotation (#2843)", () => {
    const originalKey = env.DATA_ENCRYPTION_KEY;
    const originalPrevKey = env.DATA_ENCRYPTION_KEY_PREVIOUS;
    const keyA = "a".repeat(64);
    const keyB = "b".repeat(64);

    afterEach(() => {
      env.DATA_ENCRYPTION_KEY = originalKey;
      env.DATA_ENCRYPTION_KEY_PREVIOUS = originalPrevKey;
    });

    it("decrypts with DATA_ENCRYPTION_KEY without producing a re-encrypted ciphertext", async () => {
      const encrypted = await encrypt("Bearer current", keyB);
      env.DATA_ENCRYPTION_KEY = keyB;
      env.DATA_ENCRYPTION_KEY_PREVIOUS = keyA;

      const result = await decryptSettingWithRotation(encrypted);
      expect(result).toEqual({ value: "Bearer current" });
      expect(result?.reencrypted).toBeUndefined();
    });

    it("re-encrypts under DATA_ENCRYPTION_KEY when opened via DATA_ENCRYPTION_KEY_PREVIOUS", async () => {
      const encrypted = await encrypt("Bearer rotated", keyA);
      env.DATA_ENCRYPTION_KEY = keyB;
      env.DATA_ENCRYPTION_KEY_PREVIOUS = keyA;

      const result = await decryptSettingWithRotation(encrypted);
      expect(result?.value).toBe("Bearer rotated");
      expect(result?.reencrypted).toBeDefined();
      expect(await decrypt(result?.reencrypted ?? "", keyB)).toBe("Bearer rotated");
      expect(await decrypt(result?.reencrypted ?? "", keyA)).toBeNull();

      const emptyEncrypted = await encrypt("", keyA);
      const emptyResult = await decryptSettingWithRotation(emptyEncrypted);
      expect(emptyResult?.value).toBe("");
      expect(emptyResult?.reencrypted).toBeDefined();
      expect(await decrypt(emptyResult?.reencrypted ?? "", keyB)).toBe("");
    });

    it("returns null when DATA_ENCRYPTION_KEY is unset or neither key matches", async () => {
      const encrypted = await encrypt("Bearer secret", keyA);
      env.DATA_ENCRYPTION_KEY = "";
      env.DATA_ENCRYPTION_KEY_PREVIOUS = keyA;
      expect(await decryptSettingWithRotation(encrypted)).toBeNull();

      env.DATA_ENCRYPTION_KEY = keyB;
      env.DATA_ENCRYPTION_KEY_PREVIOUS = "";
      expect(await decryptSettingWithRotation(encrypted)).toBeNull();

      env.DATA_ENCRYPTION_KEY = keyB;
      env.DATA_ENCRYPTION_KEY_PREVIOUS = "c".repeat(64);
      expect(await decryptSettingWithRotation(encrypted)).toBeNull();
    });

    it("passes plaintext values through without re-encrypting", async () => {
      env.DATA_ENCRYPTION_KEY = keyB;
      env.DATA_ENCRYPTION_KEY_PREVIOUS = keyA;
      expect(await decryptSettingWithRotation("Bearer plain")).toEqual({ value: "Bearer plain" });
      expect(await decryptSettingWithRotation("")).toEqual({ value: "" });
    });
  });
});
