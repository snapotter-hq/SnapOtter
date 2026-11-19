/**
 * Installs every AI bundle a tool requires into DATA_DIR, through the real
 * admin install route, so the strict AI matrices (REQUIRE_AI_FEATURES=1) have
 * something to run against. Opt-in with AI_PROVISION=1: it downloads several GB
 * from the bundle repo. The ubuntu_gpu release preflight runs it before the
 * matrices against a DATA_DIR that persists between runs, so only a bundle
 * that is missing or changed downloads again (#4443).
 *
 * The AI venv (PYTHON_VENV_PATH) must already hold the base packages; in the
 * image the entrypoint seeds it, on a host the preflight script builds it.
 */
import { FEATURE_BUNDLES, getRequiredBundlesForTool, TOOLS } from "@snapotter/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { invalidateCache, isFeatureInstalled } from "../../../apps/api/src/lib/feature-status.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

const PROVISION = process.env.AI_PROVISION === "1" && process.env.REQUIRE_AI_FEATURES === "1";
const INSTALL_TIMEOUT_MS = 3 * 60 * 60 * 1000;
const POLL_MS = 10_000;

const REQUIRED_BUNDLES = [
  ...new Set(TOOLS.flatMap((tool) => getRequiredBundlesForTool(tool.id))),
].sort();

interface BundleState {
  id: string;
  status: string;
  error: string | null;
}

describe.skipIf(!PROVISION)("AI bundle provisioning", () => {
  let testApp: TestApp;
  let token: string;

  beforeAll(async () => {
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

  it("requires at least one bundle, each known to the manifest", () => {
    expect(REQUIRED_BUNDLES.length).toBeGreaterThan(0);
    for (const bundleId of REQUIRED_BUNDLES) expect(FEATURE_BUNDLES[bundleId]).toBeDefined();
  });

  for (const bundleId of REQUIRED_BUNDLES) {
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
        // 409 "already installed" is a race with the check above, not a failure.
        expect([202, 409], `${bundleId}: ${res.body}`).toContain(res.statusCode);

        const deadline = Date.now() + INSTALL_TIMEOUT_MS;
        for (;;) {
          const state = await bundleState(bundleId);
          if (state?.status === "installed") break;
          if (state?.status === "error") throw new Error(`${bundleId}: ${state.error}`);
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
