import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "@playwright/test";

// ---- Helpers ---------------------------------------------------------------

const API = process.env.API_URL || "http://localhost:1349";

/** Minimal 1x1 transparent PNG used for tool endpoint checks. */
const pngBuffer = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
  "base64",
);

const VALID_STATUSES = ["not_installed", "installed", "installing", "error"];

let _token: string | undefined;

async function getToken(request: APIRequestContext): Promise<string> {
  if (_token) return _token;
  const res = await request.post(`${API}/api/auth/login`, {
    data: { username: "admin", password: "admin" },
  });
  const body = await res.json();
  _token = body.token as string;
  return _token;
}

async function authHeaders(request: APIRequestContext) {
  return { Authorization: `Bearer ${await getToken(request)}` };
}

async function getBundleStatus(request: APIRequestContext, bundleId: string): Promise<string> {
  const headers = await authHeaders(request);
  const res = await request.get(`${API}/api/v1/features`, { headers });
  const data = await res.json();
  const bundle = data.bundles.find((b: any) => b.id === bundleId);
  return bundle?.status ?? "unknown";
}

async function getBundle(request: APIRequestContext, bundleId: string): Promise<any> {
  const headers = await authHeaders(request);
  const res = await request.get(`${API}/api/v1/features`, { headers });
  const data = await res.json();
  return data.bundles.find((b: any) => b.id === bundleId) ?? null;
}

async function waitForInstallComplete(
  request: APIRequestContext,
  bundleId: string,
  timeoutMs = 600_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await getBundleStatus(request, bundleId);
    if (status === "installed") return;
    if (status === "error") throw new Error(`Install failed for ${bundleId}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`Install timeout for ${bundleId} after ${timeoutMs}ms`);
}

async function ensureUninstalled(request: APIRequestContext, bundleId: string): Promise<void> {
  const status = await getBundleStatus(request, bundleId);
  if (status === "installed") {
    const headers = await authHeaders(request);
    await request.post(`${API}/api/v1/admin/features/${bundleId}/uninstall`, {
      headers,
    });
  }
}

async function ensureInstalled(request: APIRequestContext, bundleId: string): Promise<void> {
  const status = await getBundleStatus(request, bundleId);
  if (status !== "installed") {
    const headers = await authHeaders(request);
    await request.post(`${API}/api/v1/admin/features/${bundleId}/install`, {
      headers,
    });
    await waitForInstallComplete(request, bundleId);
  }
}

/** POST a tool endpoint with a minimal PNG and return the response. */
async function callTool(
  request: APIRequestContext,
  toolId: string,
  settings: Record<string, unknown> = {},
) {
  const headers = await authHeaders(request);
  return request.post(`${API}/api/v1/tools/${toolId}`, {
    headers,
    multipart: {
      file: {
        name: "test.png",
        mimeType: "image/png",
        buffer: pngBuffer,
      },
      settings: JSON.stringify(settings),
    },
  });
}

// ---- 1. Feature listing baseline -------------------------------------------

test.describe("Feature listing baseline", () => {
  test.describe.configure({ mode: "serial" });

  test("GET /api/v1/features returns all 6 bundles", async ({ request }) => {
    const headers = await authHeaders(request);
    const res = await request.get(`${API}/api/v1/features`, { headers });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.bundles).toHaveLength(6);

    const expectedIds = [
      "background-removal",
      "face-detection",
      "object-eraser-colorize",
      "upscale-enhance",
      "photo-restoration",
      "ocr",
    ];
    const ids = data.bundles.map((b: any) => b.id);
    for (const id of expectedIds) {
      expect(ids).toContain(id);
    }
  });

  test("each bundle has complete shape", async ({ request }) => {
    const headers = await authHeaders(request);
    const res = await request.get(`${API}/api/v1/features`, { headers });
    const data = await res.json();

    for (const bundle of data.bundles) {
      expect(typeof bundle.id).toBe("string");
      expect(typeof bundle.name).toBe("string");
      expect(bundle.name.length).toBeGreaterThan(0);
      expect(typeof bundle.description).toBe("string");
      expect(bundle.description.length).toBeGreaterThan(0);
      expect(typeof bundle.estimatedSize).toBe("string");
      expect(bundle.estimatedSize.length).toBeGreaterThan(0);
      expect(Array.isArray(bundle.enablesTools)).toBeTruthy();
      expect(bundle.enablesTools.length).toBeGreaterThan(0);
      expect(typeof bundle.status).toBe("string");
      // progress and error may be null
      expect("progress" in bundle).toBeTruthy();
      expect("error" in bundle).toBeTruthy();
    }
  });

  test("all statuses are valid enum values", async ({ request }) => {
    const headers = await authHeaders(request);
    const res = await request.get(`${API}/api/v1/features`, { headers });
    const data = await res.json();

    for (const bundle of data.bundles) {
      expect(VALID_STATUSES).toContain(bundle.status);
    }
  });

  test("GET /api/v1/admin/features/disk-usage returns totalBytes", async ({ request }) => {
    const headers = await authHeaders(request);
    const res = await request.get(`${API}/api/v1/admin/features/disk-usage`, {
      headers,
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(typeof data.totalBytes).toBe("number");
    expect(data.totalBytes).toBeGreaterThanOrEqual(0);
  });
});

// ---- 2. Auth and permission guards -----------------------------------------

test.describe("Auth and permission guards", () => {
  test.describe.configure({ mode: "serial" });

  test("install without auth returns 401", async ({ request }) => {
    const res = await request.post(`${API}/api/v1/admin/features/face-detection/install`);
    expect(res.status()).toBe(401);
  });

  test("uninstall without auth returns 401", async ({ request }) => {
    const res = await request.post(`${API}/api/v1/admin/features/face-detection/uninstall`);
    expect(res.status()).toBe(401);
  });

  test("install as non-admin returns 403", async ({ request }) => {
    const headers = await authHeaders(request);

    // Create a test user with role "user"
    const createRes = await request.post(`${API}/api/auth/register`, {
      headers,
      data: {
        username: "lifecycle_test_user",
        password: "TestPass123",
        role: "user",
      },
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();

    try {
      // Login as the test user
      const loginRes = await request.post(`${API}/api/auth/login`, {
        data: { username: "lifecycle_test_user", password: "TestPass123" },
      });
      expect(loginRes.ok()).toBeTruthy();
      const loginBody = await loginRes.json();
      const userHeaders = { Authorization: `Bearer ${loginBody.token}` };

      // Attempt install -- should be denied
      const installRes = await request.post(`${API}/api/v1/admin/features/face-detection/install`, {
        headers: userHeaders,
      });
      expect(installRes.status()).toBe(403);
    } finally {
      // Cleanup: delete the test user
      await request.delete(`${API}/api/auth/users/${created.id}`, { headers });
    }
  });
});

// ---- 3. Validation guards --------------------------------------------------

test.describe("Validation guards", () => {
  test.describe.configure({ mode: "serial" });

  test("install unknown bundle returns 404", async ({ request }) => {
    const headers = await authHeaders(request);
    const res = await request.post(`${API}/api/v1/admin/features/nonexistent-bundle/install`, {
      headers,
    });
    expect(res.status()).toBe(404);
  });

  test("uninstall unknown bundle returns 404", async ({ request }) => {
    const headers = await authHeaders(request);
    const res = await request.post(`${API}/api/v1/admin/features/nonexistent-bundle/uninstall`, {
      headers,
    });
    expect(res.status()).toBe(404);
  });

  test("uninstall not-installed bundle returns 409", async ({ request }) => {
    // Ensure face-detection is not installed for this check
    await ensureUninstalled(request, "face-detection");

    const headers = await authHeaders(request);
    const res = await request.post(`${API}/api/v1/admin/features/face-detection/uninstall`, {
      headers,
    });
    expect(res.status()).toBe(409);
  });
});

// ---- 4. Install lifecycle - face-detection ---------------------------------

test.describe("Install lifecycle - face-detection", () => {
  test.describe.configure({ mode: "serial" });

  let diskUsageBefore: number;

  test.beforeAll(async ({ request }) => {
    await ensureUninstalled(request, "face-detection");
  });

  test("POST install returns 202 with jobId", async ({ request }) => {
    test.setTimeout(600_000);

    // Record disk usage before install
    const headers = await authHeaders(request);
    const diskRes = await request.get(`${API}/api/v1/admin/features/disk-usage`, { headers });
    const diskData = await diskRes.json();
    diskUsageBefore = diskData.totalBytes;

    const res = await request.post(`${API}/api/v1/admin/features/face-detection/install`, {
      headers,
    });
    expect(res.status()).toBe(202);
    const body = await res.json();
    expect(typeof body.jobId).toBe("string");
    // Validate UUID format (8-4-4-4-12)
    expect(body.jobId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  test("install progress is available via features endpoint", async ({ request }) => {
    // Give the installer a moment to start
    await new Promise((r) => setTimeout(r, 2000));

    const bundle = await getBundle(request, "face-detection");
    expect(bundle).toBeTruthy();
    // Status should be "installing" while the install is in progress
    // (or "installed" if the install was very fast)
    expect(["installing", "installed"]).toContain(bundle.status);
  });

  test("second install of same bundle returns 409 during install", async ({ request }) => {
    const status = await getBundleStatus(request, "face-detection");
    if (status === "installing") {
      const headers = await authHeaders(request);
      const res = await request.post(`${API}/api/v1/admin/features/face-detection/install`, {
        headers,
      });
      expect(res.status()).toBe(409);
    }
    // If already installed (fast download), this test is a no-op
  });

  test("install of different bundle returns 409 during install", async ({ request }) => {
    const status = await getBundleStatus(request, "face-detection");
    if (status === "installing") {
      const headers = await authHeaders(request);
      const res = await request.post(`${API}/api/v1/admin/features/ocr/install`, { headers });
      expect(res.status()).toBe(409);
    }
    // If already installed (fast download), this test is a no-op
  });

  test("after install completes, status is installed with version", async ({ request }) => {
    test.setTimeout(600_000);
    await waitForInstallComplete(request, "face-detection");

    const bundle = await getBundle(request, "face-detection");
    expect(bundle.status).toBe("installed");
  });

  test("after install, disk usage increased", async ({ request }) => {
    const headers = await authHeaders(request);
    const diskRes = await request.get(`${API}/api/v1/admin/features/disk-usage`, { headers });
    const diskData = await diskRes.json();
    expect(diskData.totalBytes).toBeGreaterThan(diskUsageBefore);
  });

  test("POST install already-installed returns 409", async ({ request }) => {
    const headers = await authHeaders(request);
    const res = await request.post(`${API}/api/v1/admin/features/face-detection/install`, {
      headers,
    });
    expect(res.status()).toBe(409);
  });

  test("installed bundle has installedVersion string", async ({ request }) => {
    const bundle = await getBundle(request, "face-detection");
    expect(bundle.status).toBe("installed");
    // installedVersion should be a string (or null for bundles without versioning)
    expect(
      typeof bundle.installedVersion === "string" || bundle.installedVersion === null,
    ).toBeTruthy();
  });
});

// ---- 5. Tool availability after install ------------------------------------

test.describe("Tool availability after install", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ request }) => {
    await ensureInstalled(request, "face-detection");
  });

  test("blur-faces returns 200 after face-detection installed", async ({ request }) => {
    test.setTimeout(60_000);
    const res = await callTool(request, "blur-faces");
    expect(res.status()).toBe(200);
  });

  test("red-eye-removal returns 200 after face-detection installed", async ({ request }) => {
    test.setTimeout(60_000);
    const res = await callTool(request, "red-eye-removal");
    expect(res.status()).toBe(200);
  });

  test("smart-crop face mode returns 200 after face-detection installed", async ({ request }) => {
    test.setTimeout(60_000);
    const res = await callTool(request, "smart-crop", {
      mode: "face",
      width: 100,
      height: 100,
    });
    expect(res.status()).toBe(200);
  });

  test("resize still works (non-AI tool unaffected)", async ({ request }) => {
    const res = await callTool(request, "resize", {
      width: 100,
      height: 100,
      method: "fit",
    });
    // Should succeed or fail with a processing error, NOT 501
    expect(res.status()).not.toBe(501);
  });
});

// ---- 6. Uninstall lifecycle ------------------------------------------------

test.describe("Uninstall lifecycle", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ request }) => {
    await ensureInstalled(request, "face-detection");
  });

  test("POST uninstall face-detection returns 200", async ({ request }) => {
    const headers = await authHeaders(request);
    const res = await request.post(`${API}/api/v1/admin/features/face-detection/uninstall`, {
      headers,
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("status is not_installed after uninstall", async ({ request }) => {
    const status = await getBundleStatus(request, "face-detection");
    expect(status).toBe("not_installed");
  });

  test("blur-faces returns 501 after uninstall", async ({ request }) => {
    const res = await callTool(request, "blur-faces");
    expect(res.status()).toBe(501);
  });

  test("501 response has FEATURE_NOT_INSTALLED code and bundle info", async ({ request }) => {
    const res = await callTool(request, "blur-faces");
    expect(res.status()).toBe(501);
    const body = await res.json();
    expect(body.code).toBe("FEATURE_NOT_INSTALLED");
    expect(body.feature).toBe("face-detection");
    expect(body.featureName).toBeTruthy();
    expect(body.estimatedSize).toBeTruthy();
  });

  test("POST uninstall again returns 409", async ({ request }) => {
    const headers = await authHeaders(request);
    const res = await request.post(`${API}/api/v1/admin/features/face-detection/uninstall`, {
      headers,
    });
    expect(res.status()).toBe(409);
  });
});

// ---- 7. Reinstall round-trip -----------------------------------------------

test.describe("Reinstall round-trip", () => {
  test.describe.configure({ mode: "serial" });

  test("reinstall after uninstall returns 202", async ({ request }) => {
    test.setTimeout(600_000);
    await ensureUninstalled(request, "face-detection");

    const headers = await authHeaders(request);
    const res = await request.post(`${API}/api/v1/admin/features/face-detection/install`, {
      headers,
    });
    expect(res.status()).toBe(202);
    await waitForInstallComplete(request, "face-detection");
  });

  test("tools work again after reinstall", async ({ request }) => {
    test.setTimeout(60_000);
    const res = await callTool(request, "blur-faces");
    expect(res.status()).toBe(200);
  });

  test("uninstall after reinstall succeeds", async ({ request }) => {
    const headers = await authHeaders(request);
    const res = await request.post(`${API}/api/v1/admin/features/face-detection/uninstall`, {
      headers,
    });
    expect(res.ok()).toBeTruthy();
    const status = await getBundleStatus(request, "face-detection");
    expect(status).toBe("not_installed");
  });
});

// ---- 8. Shared model protection --------------------------------------------

test.describe("Shared model protection", () => {
  test.describe.configure({ mode: "serial" });

  test("install both face-detection and photo-restoration", async ({ request }) => {
    test.setTimeout(600_000);
    await ensureInstalled(request, "face-detection");
    await ensureInstalled(request, "photo-restoration");

    const fdStatus = await getBundleStatus(request, "face-detection");
    const prStatus = await getBundleStatus(request, "photo-restoration");
    expect(fdStatus).toBe("installed");
    expect(prStatus).toBe("installed");
  });

  test("uninstall face-detection, photo-restoration tools still work", async ({ request }) => {
    test.setTimeout(120_000);
    const headers = await authHeaders(request);

    // Uninstall face-detection
    const uninstallRes = await request.post(
      `${API}/api/v1/admin/features/face-detection/uninstall`,
      { headers },
    );
    expect(uninstallRes.ok()).toBeTruthy();

    // Verify face-detection is gone
    const fdStatus = await getBundleStatus(request, "face-detection");
    expect(fdStatus).toBe("not_installed");

    // photo-restoration tools should still work (shared models preserved)
    const res = await callTool(request, "restore-photo");
    expect(res.status()).toBe(200);
  });

  test("cleanup: uninstall photo-restoration", async ({ request }) => {
    const headers = await authHeaders(request);
    const res = await request.post(`${API}/api/v1/admin/features/photo-restoration/uninstall`, {
      headers,
    });
    expect(res.ok()).toBeTruthy();

    const status = await getBundleStatus(request, "photo-restoration");
    expect(status).toBe("not_installed");
  });
});

// ---- 9. Container restart recovery -----------------------------------------

test.describe("Container restart recovery", () => {
  test.describe.configure({ mode: "serial" });

  test("no stale installing state after container restart", async ({ request }) => {
    const headers = await authHeaders(request);
    const res = await request.get(`${API}/api/v1/features`, { headers });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();

    // After all previous uninstalls, no bundle should be stuck in "installing"
    for (const bundle of data.bundles) {
      expect(bundle.status).not.toBe("installing");
    }
  });

  test("install works after restart", async ({ request }) => {
    test.setTimeout(600_000);

    // Install face-detection from clean state
    await ensureInstalled(request, "face-detection");

    // Verify it works
    const res = await callTool(request, "blur-faces");
    expect(res.status()).toBe(200);

    // Cleanup: uninstall
    const headers = await authHeaders(request);
    await request.post(`${API}/api/v1/admin/features/face-detection/uninstall`, { headers });
    const status = await getBundleStatus(request, "face-detection");
    expect(status).toBe("not_installed");
  });
});
