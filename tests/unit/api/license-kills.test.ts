import { afterEach, describe, expect, it, vi } from "vitest";

// The committed license-validation suite can only exercise the INVALID-signature
// path (it has no access to the private signing key), so validateLicense's
// valid-path security logic - the expiry check and payload return - went
// untested. Here we mock node:crypto so `verify` returns true, which lets us pin
// the expiry comparison (the license-bypass-critical branch), the verify call
// arguments, and the JSON.parse / catch behaviour.

const verifyMock = vi.fn();
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return {
    ...actual,
    createPublicKey: vi.fn(
      () => ({ __publicKey: true }) as unknown as ReturnType<typeof actual.createPublicKey>,
    ),
    verify: (...args: unknown[]) => verifyMock(...args),
  };
});

function makeKey(payload: Record<string, unknown>): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sigB64 = Buffer.from("signature-bytes").toString("base64url");
  return `${payloadB64}.${sigB64}`;
}

const FUTURE = "2999-01-01T00:00:00.000Z";
const PAST = "2000-01-01T00:00:00.000Z";
const basePayload = {
  org: "Acme",
  plan: "enterprise" as const,
  features: ["saml_sso"],
  seats: 10,
  issuedAt: "2020-01-01T00:00:00.000Z",
};

async function loadValidate() {
  const mod = await import("../../../packages/enterprise/src/license.js");
  return mod.validateLicense;
}

afterEach(() => {
  verifyMock.mockReset();
});

describe("validateLicense valid-signature path (mocked verify)", () => {
  it("returns the payload for a valid signature and a future expiry", async () => {
    verifyMock.mockReturnValue(true);
    const validateLicense = await loadValidate();
    const result = validateLicense(makeKey({ ...basePayload, expiresAt: FUTURE }));
    expect(result).toMatchObject({ org: "Acme", plan: "enterprise", expiresAt: FUTURE });
  });

  it("returns null for a valid signature but an expired license (kills the expiry `<` check)", async () => {
    verifyMock.mockReturnValue(true);
    const validateLicense = await loadValidate();
    expect(validateLicense(makeKey({ ...basePayload, expiresAt: PAST }))).toBeNull();
  });

  it("returns the payload when expiry is exactly one hour in the future (boundary)", async () => {
    verifyMock.mockReturnValue(true);
    const validateLicense = await loadValidate();
    const soon = new Date(Date.now() + 3_600_000).toISOString();
    expect(validateLicense(makeKey({ ...basePayload, expiresAt: soon }))).not.toBeNull();
  });

  it("passes the decoded payload bytes, the public key, and the signature to verify", async () => {
    verifyMock.mockReturnValue(true);
    const validateLicense = await loadValidate();
    const key = makeKey({ ...basePayload, expiresAt: FUTURE });
    validateLicense(key);
    const [algo, payloadArg, keyArg, sigArg] = verifyMock.mock.calls[0];
    expect(algo).toBeNull();
    expect(Buffer.isBuffer(payloadArg)).toBe(true);
    expect((payloadArg as Buffer).toString("base64url")).toBe(key.split(".")[0]);
    expect(keyArg).toMatchObject({ __publicKey: true });
    expect((sigArg as Buffer).toString("base64url")).toBe(key.split(".")[1]);
  });

  it("returns null when verify reports the signature is invalid (kills the `!valid` guard)", async () => {
    verifyMock.mockReturnValue(false);
    const validateLicense = await loadValidate();
    expect(validateLicense(makeKey({ ...basePayload, expiresAt: FUTURE }))).toBeNull();
  });

  it("returns null when the signed payload is not valid JSON (catch path)", async () => {
    verifyMock.mockReturnValue(true);
    const validateLicense = await loadValidate();
    const notJson = Buffer.from("not-json-at-all").toString("base64url");
    expect(validateLicense(`${notJson}.${Buffer.from("s").toString("base64url")}`)).toBeNull();
  });
});

describe("validateLicense key-format guard (real crypto)", () => {
  it("returns null when there is no dot separator", async () => {
    const validateLicense = await loadValidate();
    expect(validateLicense("no-dot-here")).toBeNull();
  });

  it("returns null when the dot is at index 0 (kills the `< 1` boundary)", async () => {
    const validateLicense = await loadValidate();
    expect(validateLicense(".signatureonly")).toBeNull();
    // verify must never be consulted for a malformed key.
    expect(verifyMock).not.toHaveBeenCalled();
  });
});
