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
