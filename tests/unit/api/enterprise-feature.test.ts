import { afterEach, describe, expect, it, vi } from "vitest";
import { isModuleNotFound } from "../../../apps/api/src/lib/enterprise-feature.js";

// The absent-package branch stays silent, but vitest wraps a throwing module
// mock in its own error and drops the original `code`, so a real
// ERR_MODULE_NOT_FOUND cannot be reproduced through the enterprise mock. The
// classification that decides silent-vs-reported is a pure predicate, so it is
// tested directly here; the helper tests below cover the reachable behaviors.
describe("isModuleNotFound (#868)", () => {
  it("treats a genuine module-not-found as absent", () => {
    expect(isModuleNotFound({ code: "ERR_MODULE_NOT_FOUND" })).toBe(true);
    expect(isModuleNotFound({ code: "MODULE_NOT_FOUND" })).toBe(true);
  });

  it("treats any other failure as present-but-broken", () => {
    expect(isModuleNotFound({ code: "EACCES" })).toBe(false);
    expect(isModuleNotFound(new Error("blew up at load"))).toBe(false);
    expect(isModuleNotFound(null)).toBe(false);
    expect(isModuleNotFound(undefined)).toBe(false);
  });
});

// Each case loads a fresh copy of the helper with the enterprise module (and the
// logger / error-report it reports through) mocked, so the feature-on,
// feature-off, and check-throws branches can be driven independently. Mirrors
// the vi.doMock + dynamic-import toggle used across the enterprise unit tests
// (permissions-authority, tracing-bootstrap).
async function loadHelper(enterprise: "broken" | ((f: string) => boolean)) {
  vi.resetModules();
  const logErrorMock = vi.fn();
  const reportErrorMock = vi.fn();
  vi.doMock("../../../apps/api/src/lib/logger.js", () => ({
    logger: { error: logErrorMock, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  }));
  vi.doMock("../../../apps/api/src/lib/error-report.js", () => ({
    reportError: reportErrorMock,
  }));
  if (enterprise === "broken") {
    vi.doMock("@snapotter/enterprise", () => {
      throw new Error("enterprise module threw during load");
    });
  } else {
    vi.doMock("@snapotter/enterprise", () => ({ isFeatureEnabled: enterprise }));
  }
  const mod = await import("../../../apps/api/src/lib/enterprise-feature.js");
  return { ...mod, logErrorMock, reportErrorMock };
}

afterEach(() => {
  vi.doUnmock("@snapotter/enterprise");
  vi.doUnmock("../../../apps/api/src/lib/logger.js");
  vi.doUnmock("../../../apps/api/src/lib/error-report.js");
  vi.resetModules();
});

describe("isEnterpriseFeatureEnabled (#868)", () => {
  it("returns true when the licensed feature is enabled", async () => {
    const { isEnterpriseFeatureEnabled } = await loadHelper((f) => f === "mfa");
    expect(await isEnterpriseFeatureEnabled("mfa")).toBe(true);
  });

  it("returns false when the feature is not licensed", async () => {
    const { isEnterpriseFeatureEnabled } = await loadHelper(() => false);
    expect(await isEnterpriseFeatureEnabled("mfa")).toBe(false);
  });

  it("degrades to false but reports when the enterprise module fails to load", async () => {
    const { isEnterpriseFeatureEnabled, logErrorMock, reportErrorMock } =
      await loadHelper("broken");
    expect(await isEnterpriseFeatureEnabled("mfa")).toBe(false);
    // A load failure that is not a clean module-not-found is a real fault: a
    // licensed instance whose enterprise build is broken must not read as
    // unlicensed without a trace.
    expect(logErrorMock).toHaveBeenCalled();
    expect(reportErrorMock).toHaveBeenCalled();
  });

  it("degrades to false but reports when isFeatureEnabled itself throws", async () => {
    const { isEnterpriseFeatureEnabled, logErrorMock, reportErrorMock } = await loadHelper(() => {
      throw new Error("license check exploded");
    });
    expect(await isEnterpriseFeatureEnabled("mfa")).toBe(false);
    expect(logErrorMock).toHaveBeenCalled();
    expect(reportErrorMock).toHaveBeenCalled();
  });

  // Regression for snapotter-hq/SnapOtter#1000. Under vitest, two overlapping
  // `import("@snapotter/enterprise")` calls hand the mock to one caller and the
  // real, unlicensed module to the other, so one of two concurrent SCIM
  // requests got a 403. Both tests below fail without the shared import.
  it("shares one enterprise resolution across concurrent callers (#1000)", async () => {
    const { isEnterpriseFeatureEnabled } = await loadHelper((f) => f === "scim");
    const [a, b, c] = await Promise.all([
      isEnterpriseFeatureEnabled("scim"),
      isEnterpriseFeatureEnabled("scim"),
      isEnterpriseFeatureEnabled("scim"),
    ]);
    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(c).toBe(true);
  });

  it("concurrent callers with a broken module all report the fault (#1000)", async () => {
    // Without the shared import, the second overlapping caller gets the real
    // module instead of the broken mock, so it returns false silently and the
    // fault is reported once instead of twice. The logger mock is not counted:
    // reportFeatureFailure imports it lazily, and the same overlap sends one
    // of the two log calls to the real logger.
    const { isEnterpriseFeatureEnabled, reportErrorMock } = await loadHelper("broken");
    const [a, b] = await Promise.all([
      isEnterpriseFeatureEnabled("scim"),
      isEnterpriseFeatureEnabled("scim"),
    ]);
    expect(a).toBe(false);
    expect(b).toBe(false);
    expect(reportErrorMock).toHaveBeenCalledTimes(2);
  });

  it("does not keep a failed import once it settles (#1000)", async () => {
    // The shared slot only lives while an import is in flight. If it held on
    // to a rejected import, one transient load failure would deny the feature
    // for the life of the process.
    vi.resetModules();
    vi.doMock("../../../apps/api/src/lib/logger.js", () => ({
      logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
    }));
    vi.doMock("../../../apps/api/src/lib/error-report.js", () => ({ reportError: vi.fn() }));
    let loads = 0;
    vi.doMock("@snapotter/enterprise", () => {
      loads++;
      if (loads === 1) throw new Error("transient load failure");
      return { isFeatureEnabled: (f: string) => f === "scim" };
    });
    const { isEnterpriseFeatureEnabled } = await import(
      "../../../apps/api/src/lib/enterprise-feature.js"
    );
    expect(await isEnterpriseFeatureEnabled("scim")).toBe(false);
    expect(await isEnterpriseFeatureEnabled("scim")).toBe(true);
  });
});
