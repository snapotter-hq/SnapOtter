import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SUPPORTED_VARS = [
  "DEFAULT_PASSWORD",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "OIDC_CLIENT_SECRET",
  "COOKIE_SECRET",
  "SNAPOTTER_LICENSE_KEY",
];

const RESOLVE_SCRIPT = `
resolve_file_env() {
  var="$1"
  file_var="\${var}_FILE"
  eval current_val="\\"\\\${$var:-}\\""
  eval file_path="\\"\\\${$file_var:-}\\""
  if [ -z "$file_path" ]; then return; fi
  if [ -n "$current_val" ]; then
    echo "WARNING: Both $var and $file_var are set. $file_var takes precedence." >&2
  fi
  if [ ! -f "$file_path" ] || [ ! -r "$file_path" ]; then
    echo "ERROR: $file_var points to '$file_path' but the file does not exist or is not readable." >&2
    exit 1
  fi
  export "$var"="$(cat "$file_path")"
  unset "$file_var"
}
${SUPPORTED_VARS.map((v) => `resolve_file_env ${v}`).join("\n")}
${SUPPORTED_VARS.map((v) => `echo "${v}=\${${v}:-}"`).join("\n")}
${SUPPORTED_VARS.map((v) => `echo "${v}_FILE=\${${v}_FILE:-}"`).join("\n")}
`;

let secretsDir: string;

beforeAll(() => {
  secretsDir = mkdtempSync(join(tmpdir(), "snapotter-secrets-"));
});

afterAll(() => {
  rmSync(secretsDir, { recursive: true, force: true });
});

function writeSecret(name: string, content: string): string {
  const path = join(secretsDir, name);
  writeFileSync(path, content);
  return path;
}

function runResolve(env: Record<string, string>): Record<string, string> {
  const result = execFileSync("/bin/sh", ["-c", RESOLVE_SCRIPT], {
    env: { ...env, PATH: process.env.PATH },
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  const parsed: Record<string, string> = {};
  for (const line of result.trim().split("\n")) {
    const eqIdx = line.indexOf("=");
    if (eqIdx > 0) {
      parsed[line.slice(0, eqIdx)] = line.slice(eqIdx + 1);
    }
  }
  return parsed;
}

describe("Docker _FILE secret convention", () => {
  it("reads secret from file into env var", () => {
    const secretPath = writeSecret("password.txt", "super-secret-pw");
    const result = runResolve({ DEFAULT_PASSWORD_FILE: secretPath });
    expect(result.DEFAULT_PASSWORD).toBe("super-secret-pw");
    expect(result.DEFAULT_PASSWORD_FILE).toBe("");
  });

  it("strips trailing newline from secret file", () => {
    const secretPath = writeSecret("password-newline.txt", "my-secret\n");
    const result = runResolve({ DEFAULT_PASSWORD_FILE: secretPath });
    expect(result.DEFAULT_PASSWORD).toBe("my-secret");
  });

  it("preserves internal whitespace in secret", () => {
    const secretPath = writeSecret("spaced.txt", "pass word with spaces\n");
    const result = runResolve({ COOKIE_SECRET_FILE: secretPath });
    expect(result.COOKIE_SECRET).toBe("pass word with spaces");
  });

  it("_FILE takes precedence when both are set", () => {
    const secretPath = writeSecret("override.txt", "from-file");
    const result = runResolve({
      OIDC_CLIENT_SECRET: "from-env",
      OIDC_CLIENT_SECRET_FILE: secretPath,
    });
    expect(result.OIDC_CLIENT_SECRET).toBe("from-file");
    expect(result.OIDC_CLIENT_SECRET_FILE).toBe("");
  });

  it("leaves var unchanged when _FILE is not set", () => {
    const result = runResolve({ S3_ACCESS_KEY_ID: "direct-value" });
    expect(result.S3_ACCESS_KEY_ID).toBe("direct-value");
  });

  it("leaves var empty when neither is set", () => {
    const result = runResolve({});
    expect(result.DEFAULT_PASSWORD).toBe("");
    expect(result.DEFAULT_PASSWORD_FILE).toBe("");
  });

  it("errors when _FILE points to nonexistent file", () => {
    expect(() =>
      runResolve({
        S3_SECRET_ACCESS_KEY_FILE: "/nonexistent/secret.txt",
      }),
    ).toThrow();
  });

  // root (the test container's uid) bypasses chmod-based permission checks, so
  // the unreadable-file case cannot be exercised there; skip it.
  it.skipIf(process.getuid?.() === 0)("errors when _FILE points to unreadable file", () => {
    const secretPath = writeSecret("unreadable.txt", "secret");
    chmodSync(secretPath, 0o000);
    try {
      expect(() => runResolve({ SNAPOTTER_LICENSE_KEY_FILE: secretPath })).toThrow();
    } finally {
      chmodSync(secretPath, 0o644);
    }
  });

  it("works for all supported vars simultaneously", () => {
    const env: Record<string, string> = {};
    for (const v of SUPPORTED_VARS) {
      env[`${v}_FILE`] = writeSecret(`${v.toLowerCase()}.txt`, `secret-for-${v}`);
    }
    const result = runResolve(env);
    for (const v of SUPPORTED_VARS) {
      expect(result[v]).toBe(`secret-for-${v}`);
      expect(result[`${v}_FILE`]).toBe("");
    }
  });
});
