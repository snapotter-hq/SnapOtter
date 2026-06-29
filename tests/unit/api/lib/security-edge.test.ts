import { describe, expect, it } from "vitest";
import { decrypt, encrypt, isEncrypted } from "../../../../apps/api/src/lib/encryption.js";
import { isPrivateIp, validateFetchUrl } from "../../../../apps/api/src/lib/ssrf.js";

const primaryKey = "1".repeat(64);
const previousKey = "2".repeat(64);
const wrongKey = "3".repeat(64);

describe("settings encryption edge behavior", () => {
  it("does not use the previous key when the primary key decrypts successfully", async () => {
    const encrypted = await encrypt("current-secret", primaryKey);

    await expect(decrypt(encrypted, primaryKey, wrongKey)).resolves.toBe("current-secret");
  });

  it("returns null when neither current nor previous key can authenticate the ciphertext", async () => {
    const encrypted = await encrypt("old-secret", previousKey);

    await expect(decrypt(encrypted, primaryKey, wrongKey)).resolves.toBeNull();
  });

  it("treats the exact encryption prefix as encrypted even without a payload", async () => {
    expect(isEncrypted("$ENC$")).toBe(true);
    await expect(decrypt("$ENC$", primaryKey)).resolves.toBeNull();
  });
});

describe("SSRF IP classification edges", () => {
  it("blocks malformed IP strings by failing closed", () => {
    expect(isPrivateIp("not-an-ip")).toBe(true);
  });

  it("blocks IPv6 transition and local-only ranges", () => {
    expect(isPrivateIp("64:ff9b::808:808")).toBe(true);
    expect(isPrivateIp("2002:0808:0808::1")).toBe(true);
    expect(isPrivateIp("fc00::1")).toBe(true);
    expect(isPrivateIp("ff02::1")).toBe(true);
  });

  it("allows public IPv4 and IPv6 literals", () => {
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("2606:4700:4700::1111")).toBe(false);
  });

  it("rejects non-http schemes before DNS resolution", async () => {
    await expect(validateFetchUrl("gopher://8.8.8.8/resource")).rejects.toThrow(
      "Only HTTP and HTTPS URLs are supported",
    );
  });
});
