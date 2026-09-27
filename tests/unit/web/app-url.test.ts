// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

    it("never redirects twice: every target is already prefixed", async () => {
      document.head.innerHTML = `<base href="${basePath}/">`;
      const { appUrl, unprefixPathname } = await import("../../../apps/web/src/lib/app-url");
      for (const pathname of [
        "/",
        "/files",
        basePath.toUpperCase(),
        `${basePath.toUpperCase()}/x`,
      ]) {
        const rest = unprefixPathname(pathname);
        expect(rest).not.toBeNull();
        expect(unprefixPathname(appUrl(rest as string))).toBeNull();
      }
    });
  });

  it("does nothing for a base href that is not a root-relative path", async () => {
    document.head.innerHTML = '<base href="https://host.example/snapotter/">';
    const { unprefixPathname } = await import("../../../apps/web/src/lib/app-url");
    expect(unprefixPathname("/files")).toBeNull();
  });
});

describe("redirectIfUnprefixed (#1275 case A)", () => {
  function fakeLocation(pathname: string, search = "", hash = "") {
    return { pathname, search, hash, replace: vi.fn() };
  }
  function memoryStorage() {
    const data = new Map<string, string>();
    return {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    };
  }

  it("replaces an unprefixed URL with the prefixed one, keeping query and hash", async () => {
    document.head.innerHTML = '<base href="/snapotter/">';
    const { redirectIfUnprefixed } = await import("../../../apps/web/src/lib/app-url");
    const location = fakeLocation("/files", "?job=x", "#top");
    expect(redirectIfUnprefixed(location, memoryStorage(), 1_000_000)).toBe(true);
    expect(location.replace).toHaveBeenCalledExactlyOnceWith("/snapotter/files?job=x#top");
  });

  it("leaves prefixed URLs and prefix-less deployments alone", async () => {
    document.head.innerHTML = '<base href="/snapotter/">';
    let mod = await import("../../../apps/web/src/lib/app-url");
    const prefixed = fakeLocation("/snapotter/files");
    expect(mod.redirectIfUnprefixed(prefixed, memoryStorage())).toBe(false);
    expect(prefixed.replace).not.toHaveBeenCalled();

    vi.resetModules();
    document.head.innerHTML = "";
    mod = await import("../../../apps/web/src/lib/app-url");
    const root = fakeLocation("/files");
    expect(mod.redirectIfUnprefixed(root, memoryStorage())).toBe(false);
    expect(root.replace).not.toHaveBeenCalled();
  });

  it("refuses a second redirect within the loop window and says why", async () => {
    document.head.innerHTML = '<base href="/snapotter/">';
    const { redirectIfUnprefixed } = await import("../../../apps/web/src/lib/app-url");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const storage = memoryStorage();
    // A proxy that strips the prefix with a redirect sends the browser straight back.
    expect(redirectIfUnprefixed(fakeLocation("/files"), storage, 1_000_000)).toBe(true);
    const bounced = fakeLocation("/files");
    expect(redirectIfUnprefixed(bounced, storage, 1_002_000)).toBe(false);
    expect(bounced.replace).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("/snapotter"));
    // Once the window has passed, a fresh visit redirects again.
    expect(redirectIfUnprefixed(fakeLocation("/files"), storage, 1_020_000)).toBe(true);
    error.mockRestore();
  });

  it("lets another unprefixed visit redirect right after a redirect that landed", async () => {
    // Found in the browser smoke run: two different unprefixed links a few
    // seconds apart in one tab must both redirect; only a bounce is a loop.
    document.head.innerHTML = '<base href="/snapotter/">';
    const { redirectIfUnprefixed } = await import("../../../apps/web/src/lib/app-url");
    const storage = memoryStorage();
    expect(redirectIfUnprefixed(fakeLocation("/files"), storage, 1_000_000)).toBe(true);
    // The redirect landed on the prefixed URL.
    expect(redirectIfUnprefixed(fakeLocation("/snapotter/files"), storage, 1_001_000)).toBe(false);
    const next = fakeLocation("/image/resize");
    expect(redirectIfUnprefixed(next, storage, 1_002_000)).toBe(true);
    expect(next.replace).toHaveBeenCalledWith("/snapotter/image/resize");
  });

  it("still redirects when storage is unavailable", async () => {
    document.head.innerHTML = '<base href="/snapotter/">';
    const { redirectIfUnprefixed } = await import("../../../apps/web/src/lib/app-url");
    const location = fakeLocation("/");
    expect(redirectIfUnprefixed(location, null)).toBe(true);
    expect(location.replace).toHaveBeenCalledWith("/snapotter/");
  });
});

it("main.tsx mounts the app only when no redirect happened", () => {
  // main.tsx boots the whole app on import, so pin its wiring instead: the
  // redirect must gate everything that starts the app.
  // jsdom gives import.meta.url a non-file scheme; vitest runs from the repo root.
  const source = readFileSync(join(process.cwd(), "apps/web/src/main.tsx"), "utf8");
  const gate = source.indexOf("if (!redirectIfUnprefixed(window.location)) {");
  expect(gate).toBeGreaterThan(-1);
  for (const call of ["startEarlyErrorCapture()", "installChunkReloadHandler()", "createRoot("]) {
    expect(source.indexOf(call), call).toBeGreaterThan(gate);
  }
});
