// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  document.head.innerHTML = "";
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe.each(["/", "/snapotter/", "/apps/snapotter/"])("browser base %s", (base) => {
  it("keeps API requests, downloads, and navigation inside the deployment", async () => {
    document.head.innerHTML = `<base href="${base}">`;
    const { appUrl, BASE_PATH } = await import("../../../apps/web/src/lib/app-url");
    const { apiGet, getDownloadUrl, getFileThumbnailUrl } = await import(
      "../../../apps/web/src/lib/api"
    );
    expect(BASE_PATH).toBe(base.slice(0, -1));
    expect(appUrl("/login")).toBe(`${base}login`);
    expect(appUrl("/api/v1/jobs/job/progress")).toBe(`${base}api/v1/jobs/job/progress`);
    expect(getDownloadUrl("job", "output.png")).toBe(`${base}api/v1/download/job/output.png`);
    expect(getFileThumbnailUrl("file")).toBe(`${base}api/v1/files/file/thumbnail`);
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetch);
    await apiGet("/v1/health");
    expect(fetch.mock.calls[0][0]).toBe(`${base}api/v1/health`);
  });
});

describe("unprefixPathname (#1275 case A)", () => {
  it("no-ops when the deployment has no prefix (dev, demo)", async () => {
    document.head.innerHTML = "";
    const { unprefixPathname } = await import("../../../apps/web/src/lib/app-url");
    for (const pathname of ["/", "/files", "/snapotter/files"]) {
      expect(unprefixPathname(pathname)).toBeNull();
    }
  });

  describe.each(["/snapotter", "/apps/snapotter"])("base %s", (basePath) => {
    it("marks unprefixed opens for redirect and lets prefixed opens pass", async () => {
      document.head.innerHTML = `<base href="${basePath}/">`;
      const { unprefixPathname } = await import("../../../apps/web/src/lib/app-url");
      expect(unprefixPathname("/")).toBe("/");
      expect(unprefixPathname("/files")).toBe("/files");
      expect(unprefixPathname("/files/../login")).toBe("/files/../login");
      // The exact prefix and anything under it are already routable.
      expect(unprefixPathname(basePath)).toBeNull();
      expect(unprefixPathname(`${basePath}/files`)).toBeNull();
      // stripBasePath is case-sensitive, so a wrong-case prefix lands here too;
      // the redirect normalizes the prefix only, keeping the user's casing.
      expect(unprefixPathname(basePath.toUpperCase())).toBe("/");
      expect(unprefixPathname(`${basePath.toUpperCase()}/files`)).toBe("/files");
      // A different first segment is not the prefix; take it under verbatim.
      expect(unprefixPathname(`${basePath}-other/files`)).toBe(`${basePath}-other/files`);
    });
  });
});
