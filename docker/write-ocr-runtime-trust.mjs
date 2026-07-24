import { createPublicKey } from "node:crypto";
import { writeFileSync } from "node:fs";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const CANONICAL_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function fail(message) {
  throw new Error(`OCR runtime trust generation failed: ${message}`);
}

function main() {
  const [output, trustId = "", encodedPem = "", officialSetting = "0"] = process.argv.slice(2);
  if (!output) fail("an output path is required");
  if (officialSetting !== "0" && officialSetting !== "1") {
    fail("SNAPOTTER_OFFICIAL_CONTAINER must be 0 or 1");
  }

  if (!trustId && !encodedPem) {
    if (officialSetting === "1") fail("official images require public trust metadata");
    return;
  }
  if (!trustId || !encodedPem) fail("public trust metadata is incomplete");
  if (!SAFE_ID.test(trustId)) fail("the trust identifier is invalid");
  if (!CANONICAL_BASE64.test(encodedPem)) fail("the public key is not canonical base64");

  const decodedPem = Buffer.from(encodedPem, "base64");
  if (decodedPem.toString("base64") !== encodedPem) {
    fail("the public key is not canonical base64");
  }

  let publicKey;
  try {
    publicKey = createPublicKey(decodedPem);
  } catch {
    fail("the public key is not valid PEM");
  }
  if (publicKey.asymmetricKeyType !== "ed25519") {
    fail("the public key is not Ed25519");
  }

  const trustStore = {
    schemaVersion: 1,
    keys: [
      {
        keyId: trustId,
        algorithm: "ed25519",
        publicKey: decodedPem.toString("utf8"),
      },
    ],
  };
  writeFileSync(output, `${JSON.stringify(trustStore, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o444,
  });
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "OCR runtime trust generation failed");
  process.exitCode = 1;
}
