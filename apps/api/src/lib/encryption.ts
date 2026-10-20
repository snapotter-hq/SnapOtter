import { createCipheriv, createDecipheriv, hkdf as hkdfCb, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { env } from "../config.js";

const hkdf = promisify(hkdfCb);

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_VERSION = 1;
const PREFIX = "$ENC$";

async function deriveKey(masterKeyHex: string, context: string): Promise<Buffer> {
  const keyBytes = Buffer.from(masterKeyHex, "hex");
  const derived = await hkdf("sha256", keyBytes, Buffer.alloc(0), context, 32);
  return Buffer.from(derived);
}

export async function encrypt(plaintext: string, masterKeyHex: string): Promise<string> {
  const key = await deriveKey(masterKeyHex, "snapotter-settings-encryption");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const blob = Buffer.concat([Buffer.from([KEY_VERSION]), iv, authTag, encrypted]);
  return `${PREFIX}${blob.toString("base64")}`;
}

export async function decrypt(
  ciphertext: string,
  masterKeyHex: string,
  previousKeyHex?: string,
): Promise<string | null> {
  if (!isEncrypted(ciphertext)) return ciphertext;

  const blob = Buffer.from(ciphertext.slice(PREFIX.length), "base64");
  const _version = blob[0];
  const iv = blob.subarray(1, 1 + IV_LENGTH);
  const authTag = blob.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = blob.subarray(1 + IV_LENGTH + AUTH_TAG_LENGTH);

  const tryDecrypt = async (keyHex: string): Promise<string | null> => {
    try {
      const key = await deriveKey(keyHex, "snapotter-settings-encryption");
      const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
      decipher.setAuthTag(authTag);
      return decipher.update(encrypted) + decipher.final("utf8");
    } catch {
      return null;
    }
  };

  const result = await tryDecrypt(masterKeyHex);
  if (result !== null) return result;
  if (previousKeyHex) return tryDecrypt(previousKeyHex);
  return null;
}

export interface DecryptedSetting {
  value: string;
  reencrypted?: string;
}

/**
 * Decrypt a stored setting or secret using DATA_ENCRYPTION_KEY (with fallback
 * to DATA_ENCRYPTION_KEY_PREVIOUS during key rotation). Plaintext values pass
 * through unchanged. An encrypted value returns null when no key is configured
 * or when neither key can authenticate the ciphertext.
 */
export async function decryptSetting(value: string): Promise<string | null> {
  if (!isEncrypted(value)) return value;
  if (!env.DATA_ENCRYPTION_KEY) return null;
  return decrypt(value, env.DATA_ENCRYPTION_KEY, env.DATA_ENCRYPTION_KEY_PREVIOUS || undefined);
}

/**
 * Decrypt a stored setting or secret and, when it only opens with
 * DATA_ENCRYPTION_KEY_PREVIOUS (mid-rotation), re-encrypt it under
 * DATA_ENCRYPTION_KEY so the caller can persist the rotated ciphertext (#2843).
 */
export async function decryptSettingWithRotation(value: string): Promise<DecryptedSetting | null> {
  if (!isEncrypted(value)) return { value };
  if (!env.DATA_ENCRYPTION_KEY) return null;

  const current = await decrypt(value, env.DATA_ENCRYPTION_KEY);
  if (current !== null) return { value: current };

  if (!env.DATA_ENCRYPTION_KEY_PREVIOUS) return null;
  const rotated = await decrypt(value, env.DATA_ENCRYPTION_KEY_PREVIOUS);
  if (rotated === null) return null;

  const reencrypted = await encrypt(rotated, env.DATA_ENCRYPTION_KEY);
  return { value: rotated, reencrypted };
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

export async function deriveAuditHmacKey(masterKeyHex: string): Promise<Buffer> {
  return deriveKey(masterKeyHex, "snapotter-audit-hmac");
}
