import { SUPPORTED_LOCALES } from "@snapotter/shared";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadEnv,
  resolveConcurrency,
  resolveWorkerThreads,
} from "../../../../apps/api/src/lib/env.js";

const originalEnv = { ...process.env };

function restoreEnv(): void {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
}

function expectLoadEnvError(
  overrides: Record<string, string | undefined>,
  message: string,
  expectedPath?: string[],
): void {
  restoreEnv();
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  let caught: unknown;
  try {
    loadEnv();
  } catch (err) {
    caught = err;
  }
  expect(() => {
    if (caught) throw caught;
  }).toThrow(message);
  if (expectedPath) {
    const issues = (caught as { issues?: Array<{ message: string; path: PropertyKey[] }> })?.issues;
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(message),
          path: expectedPath,
        }),
      ]),
    );
  }
}

afterEach(() => {
  restoreEnv();
});

describe("loadEnv edge validation", () => {
  it("rejects S3 storage mode when required credentials are absent", () => {
    expectLoadEnvError(
      {
        STORAGE_MODE: "s3",
        S3_BUCKET: "",
        S3_ACCESS_KEY_ID: "",
        S3_SECRET_ACCESS_KEY: "",
      },
      "S3_BUCKET is required when STORAGE_MODE=s3",
    );
  });

  it("rejects enabled OIDC without issuer, client credentials, and external URL", () => {
    expectLoadEnvError(
      {
        OIDC_ENABLED: "true",
        OIDC_ISSUER_URL: "",
        OIDC_CLIENT_ID: "",
        OIDC_CLIENT_SECRET: "",
        EXTERNAL_URL: "",
      },
      "OIDC_ISSUER_URL is required when OIDC_ENABLED=true",
    );
  });

  it.each(["", "   ", "\t\n "])(
    "rejects enabled OIDC when OIDC_ISSUER_URL is blank %j (#3302)",
    (issuerUrl) => {
      expectLoadEnvError(
        {
          OIDC_ENABLED: "true",
          OIDC_ISSUER_URL: issuerUrl,
          OIDC_CLIENT_ID: "client",
          OIDC_CLIENT_SECRET: "secret",
          EXTERNAL_URL: "http://snapotter.lan:1349",
        },
        "OIDC_ISSUER_URL is required when OIDC_ENABLED=true",
        ["OIDC_ISSUER_URL"],
      );
    },
  );

  it.each([
    "keycloak.lan:8080/realms/x",
    "localhost:8080/realms/x",
    "keycloak.lan/realms/x",
    "ftp://idp/x",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "http://",
    "https://",
  ])("rejects enabled OIDC when OIDC_ISSUER_URL is %j (#1912)", (issuerUrl) => {
    expectLoadEnvError(
      {
        OIDC_ENABLED: "true",
        OIDC_ISSUER_URL: issuerUrl,
        OIDC_CLIENT_ID: "client",
        OIDC_CLIENT_SECRET: "secret",
        EXTERNAL_URL: "http://snapotter.lan:1349",
      },
      "OIDC_ISSUER_URL must be an http(s) URL such as https://auth.example.com/realms/myrealm",
      ["OIDC_ISSUER_URL"],
    );
  });

  it.each([
    ["https://auth.example.com/realms/myrealm", "https://auth.example.com/realms/myrealm"],
    ["http://keycloak.lan:8080/realms/x", "http://keycloak.lan:8080/realms/x"],
    ["HTTP://Keycloak.lan:8080/realms/x", "HTTP://Keycloak.lan:8080/realms/x"],
    [" https://auth.example.com/realms/myrealm\n", "https://auth.example.com/realms/myrealm"],
    ["\thttps://auth.example.com/realms/myrealm ", "https://auth.example.com/realms/myrealm"],
  ])(
    "accepts and trims OIDC_ISSUER_URL %j to %j when OIDC is enabled (#1912, #3302)",
    (issuerUrl, expected) => {
      restoreEnv();
      const env = loadEnv({
        ...process.env,
        OIDC_ENABLED: "true",
        OIDC_ISSUER_URL: issuerUrl,
        OIDC_CLIENT_ID: "client",
        OIDC_CLIENT_SECRET: "secret",
        EXTERNAL_URL: "http://snapotter.lan:1349",
      });
      expect(env.OIDC_ISSUER_URL).toBe(expected);
    },
  );

  it("leaves OIDC_ISSUER_URL unchecked when OIDC_ENABLED is false (#1912, #3302)", () => {
    restoreEnv();
    const env = loadEnv({
      ...process.env,
      OIDC_ENABLED: "false",
      OIDC_ISSUER_URL: " keycloak.lan:8080/realms/x\n",
    });
    expect(env.OIDC_ISSUER_URL).toBe("keycloak.lan:8080/realms/x");
  });

  it.each(["", "   ", "\t\n "])(
    "rejects enabled OIDC when OIDC_CLIENT_ID is blank %j (#3302)",
    (clientId) => {
      expectLoadEnvError(
        {
          OIDC_ENABLED: "true",
          OIDC_ISSUER_URL: "https://auth.example.com/realms/myrealm",
          OIDC_CLIENT_ID: clientId,
          OIDC_CLIENT_SECRET: "secret",
          EXTERNAL_URL: "http://snapotter.lan:1349",
        },
        "OIDC_CLIENT_ID is required when OIDC_ENABLED=true",
        ["OIDC_CLIENT_ID"],
      );
    },
  );

  it.each(["", "   ", "\t\n "])(
    "rejects enabled OIDC when OIDC_CLIENT_SECRET is blank %j (#3302)",
    (clientSecret) => {
      expectLoadEnvError(
        {
          OIDC_ENABLED: "true",
          OIDC_ISSUER_URL: "https://auth.example.com/realms/myrealm",
          OIDC_CLIENT_ID: "client",
          OIDC_CLIENT_SECRET: clientSecret,
          EXTERNAL_URL: "http://snapotter.lan:1349",
        },
        "OIDC_CLIENT_SECRET is required when OIDC_ENABLED=true",
        ["OIDC_CLIENT_SECRET"],
      );
    },
  );

  it.each([
    [" snapotter-client \n", "snapotter-client", " secret-from-file\n", "secret-from-file"],
    ["\tclient-id ", "client-id", "\tclient-secret\r\n", "client-secret"],
  ])(
    "trims OIDC_CLIENT_ID %j to %j and OIDC_CLIENT_SECRET %j to %j (#3302)",
    (clientId, expectedId, clientSecret, expectedSecret) => {
      restoreEnv();
      const env = loadEnv({
        ...process.env,
        OIDC_ENABLED: "true",
        OIDC_ISSUER_URL: "https://auth.example.com/realms/myrealm",
        OIDC_CLIENT_ID: clientId,
        OIDC_CLIENT_SECRET: clientSecret,
        EXTERNAL_URL: "http://snapotter.lan:1349",
      });
      expect(env.OIDC_CLIENT_ID).toBe(expectedId);
      expect(env.OIDC_CLIENT_SECRET).toBe(expectedSecret);
    },
  );

  it.each([
    [undefined, "openid profile email"],
    ["", "openid profile email"],
    ["   ", "openid profile email"],
    ["\t\n ", "openid profile email"],
    [" openid email \n", "openid email"],
    ["\topenid profile email offline_access ", "openid profile email offline_access"],
  ])("trims OIDC_SCOPES %j and falls back to %j when blank (#3302)", (scopes, expected) => {
    restoreEnv();
    const rawEnv: NodeJS.ProcessEnv = { ...process.env };
    if (scopes === undefined) {
      delete rawEnv.OIDC_SCOPES;
    } else {
      rawEnv.OIDC_SCOPES = scopes;
    }
    const env = loadEnv(rawEnv);
    expect(env.OIDC_SCOPES).toBe(expected);
  });

  it.each([
    ["", ""],
    ["   ", ""],
    ["\t\n ", ""],
    [" Keycloak \n", "Keycloak"],
    ["\tOkta SSO ", "Okta SSO"],
  ])("trims OIDC_PROVIDER_NAME %j to %j (#3302)", (providerName, expected) => {
    restoreEnv();
    const env = loadEnv({
      ...process.env,
      OIDC_PROVIDER_NAME: providerName,
    });
    expect(env.OIDC_PROVIDER_NAME).toBe(expected);
  });

  it.each([
    [undefined, "preferred_username"],
    ["", "preferred_username"],
    ["   ", "preferred_username"],
    ["\t\n ", "preferred_username"],
    [" uid \n", "uid"],
    ["\tcustom_login ", "custom_login"],
  ])(
    "trims OIDC_USERNAME_CLAIM %j and falls back to %j when blank (#3302)",
    (usernameClaim, expected) => {
      restoreEnv();
      const rawEnv: NodeJS.ProcessEnv = { ...process.env };
      if (usernameClaim === undefined) {
        delete rawEnv.OIDC_USERNAME_CLAIM;
      } else {
        rawEnv.OIDC_USERNAME_CLAIM = usernameClaim;
      }
      const env = loadEnv(rawEnv);
      expect(env.OIDC_USERNAME_CLAIM).toBe(expected);
    },
  );

  it.each([
    [undefined, "user"],
    ["", "user"],
    ["   ", "user"],
    ["\t\n ", "user"],
    [" editor \n", "editor"],
    ["\tadmin ", "admin"],
    [" disabled \n", "disabled"],
    [" custom-role \r\n", "custom-role"],
  ])(
    "trims OIDC_DEFAULT_ROLE %j and falls back to %j when blank (#3301)",
    (defaultRole, expected) => {
      restoreEnv();
      const rawEnv: NodeJS.ProcessEnv = { ...process.env };
      if (defaultRole === undefined) {
        delete rawEnv.OIDC_DEFAULT_ROLE;
      } else {
        rawEnv.OIDC_DEFAULT_ROLE = defaultRole;
      }
      const env = loadEnv(rawEnv);
      expect(env.OIDC_DEFAULT_ROLE).toBe(expected);
    },
  );

  it("rejects enabled SAML without IdP settings and external URL", () => {
    expectLoadEnvError(
      {
        SAML_ENABLED: "true",
        SAML_IDP_SSO_URL: "",
        SAML_IDP_CERTIFICATE: "",
        EXTERNAL_URL: "",
      },
      "SAML_IDP_SSO_URL is required when SAML_ENABLED=true",
    );
  });

  it.each(["", "   ", "\t\n "])(
    "rejects enabled SAML when SAML_IDP_SSO_URL is blank %j (#2876)",
    (ssoUrl) => {
      expectLoadEnvError(
        {
          SAML_ENABLED: "true",
          SAML_IDP_SSO_URL: ssoUrl,
          SAML_IDP_CERTIFICATE: "MIIC",
          EXTERNAL_URL: "http://snapotter.lan:1349",
        },
        "SAML_IDP_SSO_URL is required when SAML_ENABLED=true",
        ["SAML_IDP_SSO_URL"],
      );
    },
  );

  it.each([
    "keycloak.lan:8080/realms/x/protocol/saml",
    "localhost:8080/sso",
    "keycloak.lan/sso",
    "//idp.example.com/sso",
    "ftp://idp/sso",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "http://",
    "https://",
  ])("rejects enabled SAML when SAML_IDP_SSO_URL is %j (#2869)", (ssoUrl) => {
    expectLoadEnvError(
      {
        SAML_ENABLED: "true",
        SAML_IDP_SSO_URL: ssoUrl,
        SAML_IDP_CERTIFICATE: "MIIC",
        EXTERNAL_URL: "http://snapotter.lan:1349",
      },
      "SAML_IDP_SSO_URL must be an http(s) URL such as https://idp.example.com/sso",
      ["SAML_IDP_SSO_URL"],
    );
  });

  it.each([
    ["https://idp.example.com/sso", "https://idp.example.com/sso"],
    [
      "http://keycloak.lan:8080/realms/x/protocol/saml",
      "http://keycloak.lan:8080/realms/x/protocol/saml",
    ],
    [
      "HTTP://Keycloak.lan:8080/realms/x/protocol/saml",
      "HTTP://Keycloak.lan:8080/realms/x/protocol/saml",
    ],
    [" https://idp.example.com/sso\n", "https://idp.example.com/sso"],
    ["\thttps://idp.example.com/sso ", "https://idp.example.com/sso"],
  ])(
    "accepts and trims SAML_IDP_SSO_URL %j to %j when SAML is enabled (#2869, #2876)",
    (ssoUrl, expected) => {
      restoreEnv();
      const env = loadEnv({
        ...process.env,
        SAML_ENABLED: "true",
        SAML_IDP_SSO_URL: ssoUrl,
        SAML_IDP_CERTIFICATE: "MIIC",
        EXTERNAL_URL: "http://snapotter.lan:1349",
      });
      expect(env.SAML_IDP_SSO_URL).toBe(expected);
    },
  );

  it.each([
    "snapotter.lan:1349/api/auth/saml/callback",
    "localhost:1349/api/auth/saml/callback",
    "snapotter.lan/api/auth/saml/callback",
    "/api/auth/saml/callback",
    "//snapotter.lan/api/auth/saml/callback",
    "ftp://snapotter.lan/api/auth/saml/callback",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "http://",
    "https://",
  ])("rejects enabled SAML when SAML_CALLBACK_URL is %j (#2869)", (callbackUrl) => {
    expectLoadEnvError(
      {
        SAML_ENABLED: "true",
        SAML_IDP_SSO_URL: "https://idp.example.com/sso",
        SAML_IDP_CERTIFICATE: "MIIC",
        SAML_CALLBACK_URL: callbackUrl,
        EXTERNAL_URL: "http://snapotter.lan:1349",
      },
      "SAML_CALLBACK_URL must be an http(s) URL such as https://example.com/api/auth/saml/callback",
      ["SAML_CALLBACK_URL"],
    );
  });

  it.each([
    ["", ""],
    ["   ", ""],
    ["\t\n ", ""],
    ["https://example.com/api/auth/saml/callback", "https://example.com/api/auth/saml/callback"],
    [
      "http://snapotter.lan:1349/api/auth/saml/callback",
      "http://snapotter.lan:1349/api/auth/saml/callback",
    ],
    [
      "HTTP://Snapotter.lan:1349/api/auth/saml/callback",
      "HTTP://Snapotter.lan:1349/api/auth/saml/callback",
    ],
    [" https://example.com/api/auth/saml/callback\n", "https://example.com/api/auth/saml/callback"],
  ])(
    "accepts and trims SAML_CALLBACK_URL %j to %j when SAML is enabled (#2869, #2876)",
    (callbackUrl, expected) => {
      restoreEnv();
      const env = loadEnv({
        ...process.env,
        SAML_ENABLED: "true",
        SAML_IDP_SSO_URL: "https://idp.example.com/sso",
        SAML_IDP_CERTIFICATE: "MIIC",
        SAML_CALLBACK_URL: callbackUrl,
        EXTERNAL_URL: "http://snapotter.lan:1349",
      });
      expect(env.SAML_CALLBACK_URL).toBe(expected);
    },
  );

  it.each([
    ["", ""],
    ["   ", ""],
    ["\t\n ", ""],
    [
      "https://sp.example.com/api/auth/saml/metadata",
      "https://sp.example.com/api/auth/saml/metadata",
    ],
    [
      " https://sp.example.com/api/auth/saml/metadata\n",
      "https://sp.example.com/api/auth/saml/metadata",
    ],
    ["\turn:snapotter:sp ", "urn:snapotter:sp"],
  ])("trims SAML_ENTITY_ID %j to %j (#2876)", (entityId, expected) => {
    restoreEnv();
    const env = loadEnv({
      ...process.env,
      SAML_ENABLED: "true",
      SAML_IDP_SSO_URL: "https://idp.example.com/sso",
      SAML_IDP_CERTIFICATE: "MIIC",
      SAML_ENTITY_ID: entityId,
      EXTERNAL_URL: "http://snapotter.lan:1349",
    });
    expect(env.SAML_ENTITY_ID).toBe(expected);
  });

  it("leaves SAML_IDP_SSO_URL and SAML_CALLBACK_URL unchecked when SAML_ENABLED is false (#2869)", () => {
    restoreEnv();
    const env = loadEnv({
      ...process.env,
      SAML_ENABLED: "false",
      SAML_IDP_SSO_URL: " keycloak.lan:8080/realms/x/protocol/saml\n",
      SAML_CALLBACK_URL: " snapotter.lan:1349/api/auth/saml/callback\n",
      SAML_ENTITY_ID: " urn:snapotter:sp\n",
    });
    expect(env.SAML_IDP_SSO_URL).toBe("keycloak.lan:8080/realms/x/protocol/saml");
    expect(env.SAML_CALLBACK_URL).toBe("snapotter.lan:1349/api/auth/saml/callback");
    expect(env.SAML_ENTITY_ID).toBe("urn:snapotter:sp");
  });

  it.each(["", "   ", "\t\n "])(
    "rejects enabled SAML when SAML_IDP_CERTIFICATE is blank %j (#3295)",
    (certificate) => {
      expectLoadEnvError(
        {
          SAML_ENABLED: "true",
          SAML_IDP_SSO_URL: "https://idp.example.com/sso",
          SAML_IDP_CERTIFICATE: certificate,
          EXTERNAL_URL: "http://snapotter.lan:1349",
        },
        "SAML_IDP_CERTIFICATE is required when SAML_ENABLED=true",
        ["SAML_IDP_CERTIFICATE"],
      );
    },
  );

  it.each([
    [
      "MIICpDCCAYwCCQDU+pQ4pHgSpDANBgkqhkiG9w0BAQsFADAUMRIw==\n",
      "MIICpDCCAYwCCQDU+pQ4pHgSpDANBgkqhkiG9w0BAQsFADAUMRIw==",
    ],
    [
      "  MIICpDCCAYwCCQDU+pQ4pHgSpDANBgkqhkiG9w0BAQsFADAUMRIw= \r\n",
      "MIICpDCCAYwCCQDU+pQ4pHgSpDANBgkqhkiG9w0BAQsFADAUMRIw=",
    ],
    [
      "\n-----BEGIN CERTIFICATE-----\nMIICpDCCAYwCCQDU+pQ4pHgSpDANBgkqhkiG9w0BAQsFADAUMRIw==\n-----END CERTIFICATE-----\n\n",
      "-----BEGIN CERTIFICATE-----\nMIICpDCCAYwCCQDU+pQ4pHgSpDANBgkqhkiG9w0BAQsFADAUMRIw==\n-----END CERTIFICATE-----",
    ],
  ])(
    "trims SAML_IDP_CERTIFICATE %j to %j so @node-saml keyInfoToPem accepts it (#3295)",
    (certificate, expected) => {
      restoreEnv();
      const env = loadEnv({
        ...process.env,
        SAML_ENABLED: "true",
        SAML_IDP_SSO_URL: "https://idp.example.com/sso",
        SAML_IDP_CERTIFICATE: certificate,
        EXTERNAL_URL: "http://snapotter.lan:1349",
      });
      expect(env.SAML_IDP_CERTIFICATE).toBe(expected);
    },
  );

  it.each([
    ["", ""],
    ["   ", ""],
    ["\t\n ", ""],
    [" Okta \n", "Okta"],
    ["\tAzure AD ", "Azure AD"],
  ])("trims SAML_PROVIDER_NAME %j to %j (#3295)", (providerName, expected) => {
    restoreEnv();
    const env = loadEnv({
      ...process.env,
      SAML_PROVIDER_NAME: providerName,
    });
    expect(env.SAML_PROVIDER_NAME).toBe(expected);
  });

  it.each([
    ["", ""],
    ["   ", ""],
    ["\t\n ", ""],
    [" uid \n", "uid"],
    ["\tpreferred_username ", "preferred_username"],
  ])("trims SAML_USERNAME_ATTRIBUTE %j to %j (#3295)", (usernameAttr, expected) => {
    restoreEnv();
    const env = loadEnv({
      ...process.env,
      SAML_USERNAME_ATTRIBUTE: usernameAttr,
    });
    expect(env.SAML_USERNAME_ATTRIBUTE).toBe(expected);
  });

  it.each([
    [undefined, "email"],
    ["", "email"],
    ["   ", "email"],
    ["\t\n ", "email"],
    [" mail \n", "mail"],
    [
      "\thttp://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress ",
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
    ],
  ])(
    "trims SAML_EMAIL_ATTRIBUTE %j and falls back to %j when blank (#3295)",
    (emailAttr, expected) => {
      restoreEnv();
      const rawEnv: NodeJS.ProcessEnv = { ...process.env };
      if (emailAttr === undefined) {
        delete rawEnv.SAML_EMAIL_ATTRIBUTE;
      } else {
        rawEnv.SAML_EMAIL_ATTRIBUTE = emailAttr;
      }
      const env = loadEnv(rawEnv);
      expect(env.SAML_EMAIL_ATTRIBUTE).toBe(expected);
    },
  );

  it.each([
    [undefined, "user"],
    ["", "user"],
    ["   ", "user"],
    ["\t\n ", "user"],
    [" editor \n", "editor"],
    ["\tadmin ", "admin"],
    [" disabled \n", "disabled"],
    [" custom-role \r\n", "custom-role"],
  ])(
    "trims SAML_DEFAULT_ROLE %j and falls back to %j when blank (#3301)",
    (defaultRole, expected) => {
      restoreEnv();
      const rawEnv: NodeJS.ProcessEnv = { ...process.env };
      if (defaultRole === undefined) {
        delete rawEnv.SAML_DEFAULT_ROLE;
      } else {
        rawEnv.SAML_DEFAULT_ROLE = defaultRole;
      }
      const env = loadEnv(rawEnv);
      expect(env.SAML_DEFAULT_ROLE).toBe(expected);
    },
  );

  it("rejects malformed encryption keys before settings encryption is used", () => {
    expectLoadEnvError(
      {
        DATA_ENCRYPTION_KEY: "not-hex",
      },
      "DATA_ENCRYPTION_KEY must be a 64-character hex string",
    );
  });

  it("accepts valid encryption key material", () => {
    restoreEnv();
    process.env.DATA_ENCRYPTION_KEY = "a".repeat(64);
    process.env.DATA_ENCRYPTION_KEY_PREVIOUS = "b".repeat(64);

    const env = loadEnv();

    expect(env.DATA_ENCRYPTION_KEY).toBe("a".repeat(64));
    expect(env.DATA_ENCRYPTION_KEY_PREVIOUS).toBe("b".repeat(64));
  });
});

describe("worker sizing helpers", () => {
  it("honors explicit concurrency and thread overrides", () => {
    const env = loadEnv();

    expect(resolveConcurrency({ ...env, CONCURRENT_JOBS: 7 })).toBe(7);
    expect(resolveConcurrency({ ...env, CONCURRENT_JOBS: 1 })).toBe(1);
    expect(resolveConcurrency({ ...env, CONCURRENT_JOBS: 2.7 })).toBe(2);
    expect(resolveWorkerThreads({ ...env, MAX_WORKER_THREADS: 9 })).toBe(9);
    expect(resolveWorkerThreads({ ...env, MAX_WORKER_THREADS: 1 })).toBe(1);
    expect(resolveWorkerThreads({ ...env, MAX_WORKER_THREADS: 2.7 })).toBe(2);
  });

  it("falls back to at least two workers when overrides are zero, below 1, or non-finite", () => {
    const env = loadEnv();
    const autoConcurrency = resolveConcurrency({ ...env, CONCURRENT_JOBS: 0 });
    const autoThreads = resolveWorkerThreads({ ...env, MAX_WORKER_THREADS: 0 });

    expect(autoConcurrency).toBeGreaterThanOrEqual(2);
    expect(resolveConcurrency({ ...env, CONCURRENT_JOBS: -3 })).toBe(autoConcurrency);
    expect(resolveConcurrency({ ...env, CONCURRENT_JOBS: 0.5 })).toBe(autoConcurrency);
    expect(resolveConcurrency({ ...env, CONCURRENT_JOBS: Number.POSITIVE_INFINITY })).toBe(
      autoConcurrency,
    );
    expect(resolveConcurrency({ ...env, CONCURRENT_JOBS: Number.NaN })).toBe(autoConcurrency);
    expect(autoThreads).toBeGreaterThanOrEqual(2);
    expect(resolveWorkerThreads({ ...env, MAX_WORKER_THREADS: -3 })).toBe(autoThreads);
    expect(resolveWorkerThreads({ ...env, MAX_WORKER_THREADS: 0.5 })).toBe(autoThreads);
    expect(resolveWorkerThreads({ ...env, MAX_WORKER_THREADS: Number.POSITIVE_INFINITY })).toBe(
      autoThreads,
    );
    expect(resolveWorkerThreads({ ...env, MAX_WORKER_THREADS: Number.NaN })).toBe(autoThreads);
  });
});

describe("loadEnv TRUST_PROXY validation", () => {
  it("rejects a hop count at env-parse time, before anything connects", () => {
    // fastify 5.12 fails closed on a numeric trustProxy (GHSA-3m5p-2c4r-xxw2),
    // so the value is refused here rather than thrown out of Fastify() after
    // migrations and Redis are already up. The message carries the fix.
    expectLoadEnvError({ TRUST_PROXY: "2" }, "TRUST_PROXY=2: a hop count is no longer supported");
  });

  it("still accepts the boolean and list forms", () => {
    restoreEnv();
    for (const value of ["true", "false", "loopback,linklocal,uniquelocal", "10.0.0.0/8"]) {
      process.env.TRUST_PROXY = value;
      expect(loadEnv().TRUST_PROXY, value).toBe(value);
    }
  });
});

describe("loadEnv GDPR_EXPORT_TIMEOUT_MS (#1497)", () => {
  it("defaults GDPR_EXPORT_TIMEOUT_MS to 15 minutes and accepts 0 for unlimited", () => {
    const { GDPR_EXPORT_TIMEOUT_MS: _omitted, ...withoutTimeout } = originalEnv;
    expect(loadEnv(withoutTimeout).GDPR_EXPORT_TIMEOUT_MS).toBe(900_000);
    expect(loadEnv({ ...withoutTimeout, GDPR_EXPORT_TIMEOUT_MS: "0" }).GDPR_EXPORT_TIMEOUT_MS).toBe(
      0,
    );
    expect(
      loadEnv({ ...withoutTimeout, GDPR_EXPORT_TIMEOUT_MS: "45000" }).GDPR_EXPORT_TIMEOUT_MS,
    ).toBe(45_000);
  });
});

describe("loadEnv DEFAULT_LOCALE validation (#3958)", () => {
  it("defaults DEFAULT_LOCALE to en when unset", () => {
    const { DEFAULT_LOCALE: _omitted, ...withoutDefaultLocale } = originalEnv;
    expect(loadEnv(withoutDefaultLocale).DEFAULT_LOCALE).toBe("en");
  });

  it("accepts every locale code in SUPPORTED_LOCALES", () => {
    for (const { code } of SUPPORTED_LOCALES) {
      expect(loadEnv({ ...originalEnv, DEFAULT_LOCALE: code }).DEFAULT_LOCALE).toBe(code);
    }
  });

  it.each(["", "   ", " de ", "de_DE", "french", "xx-invalid", "ZH-CN", "en-US"])(
    "rejects unsupported DEFAULT_LOCALE %j and lists valid codes (#3958)",
    (locale) => {
      expectLoadEnvError(
        { DEFAULT_LOCALE: locale },
        "Must be a supported locale (en, zh-CN, zh-TW,",
        ["DEFAULT_LOCALE"],
      );
    },
  );
});

describe("configRoutes GET /api/v1/config/locale (#3958)", () => {
  async function injectConfigLocale(
    storedValue?: string,
    envDefaultLocale = "en",
  ): Promise<{
    statusCode: number;
    body: { defaultLocale: string };
    whereCalls: unknown[];
    warnCalls: unknown[][];
  }> {
    vi.resetModules();
    const whereCalls: unknown[] = [];
    const warnCalls: unknown[][] = [];

    vi.doMock("drizzle-orm", () => ({
      eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
    }));
    vi.doMock("../../../../apps/api/src/config.js", () => ({
      env: {
        AUTH_ENABLED: true,
        DEFAULT_LOCALE: envDefaultLocale,
        OIDC_ENABLED: false,
        SAML_ENABLED: false,
      },
    }));
    vi.doMock("../../../../apps/api/src/db/index.js", () => ({
      db: {
        select: () => ({
          from: () => ({
            where: (predicate: unknown) => {
              whereCalls.push(predicate);
              return Promise.resolve(
                storedValue === undefined ? [] : [{ key: "defaultLocale", value: storedValue }],
              );
            },
          }),
        }),
      },
      schema: { settings: { key: "settings.key", value: "settings.value" } },
    }));

    const { configRoutes } = await import("../../../../apps/api/src/routes/config.js");
    const app = Fastify();
    await configRoutes(app);
    await app.ready();
    vi.spyOn(app.log, "warn").mockImplementation((...args: unknown[]) => {
      warnCalls.push(args);
    });
    try {
      const res = await app.inject({ method: "GET", url: "/api/v1/config/locale" });
      return { statusCode: res.statusCode, body: res.json(), whereCalls, warnCalls };
    } finally {
      await app.close();
      vi.doUnmock("drizzle-orm");
      vi.doUnmock("../../../../apps/api/src/config.js");
      vi.doUnmock("../../../../apps/api/src/db/index.js");
      vi.restoreAllMocks();
    }
  }

  it("returns en (or env.DEFAULT_LOCALE) without logging a warning when no defaultLocale row is stored", async () => {
    const res = await injectConfigLocale(undefined);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ defaultLocale: "en" });
    expect(res.whereCalls).toEqual([{ op: "eq", col: "settings.key", val: "defaultLocale" }]);
    expect(res.warnCalls).toEqual([]);

    const customEnvRes = await injectConfigLocale(undefined, "de");
    expect(customEnvRes.statusCode).toBe(200);
    expect(customEnvRes.body).toEqual({ defaultLocale: "de" });
    expect(customEnvRes.warnCalls).toEqual([]);
  });

  it("returns every stored locale code in SUPPORTED_LOCALES without warning", async () => {
    for (const { code } of SUPPORTED_LOCALES) {
      const res = await injectConfigLocale(code);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ defaultLocale: code });
      expect(res.whereCalls).toEqual([{ op: "eq", col: "settings.key", val: "defaultLocale" }]);
      expect(res.warnCalls).toEqual([]);
    }
  });

  it.each(["", "   ", " de ", "de_DE", "french", "xx-invalid", "ZH-CN", "en-US"])(
    "logs a warning and falls back to env.DEFAULT_LOCALE when a legacy defaultLocale row holds unsupported value %j",
    async (legacyValue) => {
      const res = await injectConfigLocale(legacyValue, "fr");
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ defaultLocale: "fr" });
      expect(res.whereCalls).toEqual([{ op: "eq", col: "settings.key", val: "defaultLocale" }]);
      expect(res.warnCalls).toEqual([
        [
          { value: legacyValue, fallbackLocale: "fr" },
          "defaultLocale setting holds an unsupported value; using fallback",
        ],
      ]);
    },
  );
});
