/**
 * Installs every AI feature bundle into DATA_DIR, through the real admin
 * install route, so the strict AI matrices (REQUIRE_AI_FEATURES=1) have
 * something to run against. Opt-in with AI_PROVISION=1: it downloads several GB
 * from the bundle repo. The ubuntu_gpu release preflight runs it before the
 * matrices against a DATA_DIR that persists between runs, so only a bundle
 * that is missing or changed downloads again (#4443).
 *
 * The AI venv (PYTHON_VENV_PATH) must already hold the base packages; in the
 * image the entrypoint seeds it, on a host the preflight script builds it.
 */
import { FEATURE_BUNDLES } from "@snapotter/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { invalidateCache, isFeatureInstalled } from "../../../apps/api/src/lib/feature-status.js";
import { buildTestApp, loginAsAdmin, preReadyHooks, type TestApp } from "../test-server.js";

const PROVISION = process.env.AI_PROVISION === "1" && process.env.REQUIRE_AI_FEATURES === "1";
const INSTALL_TIMEOUT_MS = 3 * 60 * 60 * 1000;
const POLL_MS = 10_000;

// Optional bundles too: a tool's default settings can ask for one (ocr-pdf's
// "balanced" quality needs the OCR runtime), and the strict matrices fail on
// FEATURE_INCOMPATIBLE when it is absent.
const BUNDLES = Object.keys(FEATURE_BUNDLES).sort();

interface BundleState {
  id: string;
  status: string;
  error: string | null;
}

describe.skipIf(!PROVISION)("AI bundle provisioning", () => {
  let testApp: TestApp;
  let token: string;

  beforeAll(async () => {
    // buildTestApp leaves the feature routes out; the install route lives
    // there. Imported here so a skipped run never loads the install machinery.
    const { registerFeatureRoutes } = await import("../../../apps/api/src/routes/features.js");
    preReadyHooks.push((app) => registerFeatureRoutes(app));
    testApp = await buildTestApp();
    token = await loginAsAdmin(testApp.app);
  });

  afterAll(async () => {
    await testApp?.cleanup();
  });

  async function bundleState(bundleId: string): Promise<BundleState | undefined> {
    const res = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/features",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    return (JSON.parse(res.body) as { bundles: BundleState[] }).bundles.find(
      (b) => b.id === bundleId,
    );
  }

  it("has bundles to install", () => {
    expect(BUNDLES.length).toBeGreaterThan(0);
  });

  for (const bundleId of BUNDLES) {
    it(
      `installs ${bundleId}`,
      async () => {
        invalidateCache();
        if (isFeatureInstalled(bundleId)) return;

        const res = await testApp.app.inject({
          method: "POST",
          url: `/api/v1/admin/features/${bundleId}/install`,
          headers: { authorization: `Bearer ${token}` },
        });
        // "Already installed" is a race with the check above; any other 409
        // (an unsupported host, say) means nothing will install.
        const alreadyInstalled = res.statusCode === 409 && res.body.includes("already installed");
        expect(res.statusCode === 202 || alreadyInstalled, `${bundleId}: ${res.body}`).toBe(true);

        const deadline = Date.now() + INSTALL_TIMEOUT_MS;
        let started = alreadyInstalled;
        for (;;) {
          const state = await bundleState(bundleId);
          if (state?.status === "installed") break;
          if (state?.status === "error") throw new Error(`${bundleId}: ${state.error}`);
          // Bundles install one at a time here, so an install that was running
          // and is now neither installed nor in error ended without saying why.
          if (state?.status === "queued" || state?.status === "installing") started = true;
          else if (started) throw new Error(`${bundleId}: install ended as ${state?.status}`);
          if (Date.now() > deadline) throw new Error(`${bundleId}: install still ${state?.status}`);
          await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        }
        invalidateCache();
        expect(isFeatureInstalled(bundleId)).toBe(true);
      },
      INSTALL_TIMEOUT_MS + 60_000,
    );
  }
});
