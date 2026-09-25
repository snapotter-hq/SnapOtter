import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Install-ability guard for the PWA manifest (#172).
 *
 * Chrome (>=120) and iOS Safari (>=16.4) install a manifest-only PWA as a
 * standalone app; there is deliberately no service worker (processing is
 * server-side, plain-HTTP LAN self-hosts cannot register one, and a cached
 * shell would skew against upgraded APIs). What install DOES need is a
 * complete manifest: start_url/scope, a stable identity, real icon files, and maskable
 * variants so Android does not letterbox the icon.
 */
type ManifestIcon = { src: string; sizes: string; type: string; purpose?: string };

const publicPath = (p: string) =>
  fileURLToPath(new URL(`../../../apps/web/public/${p}`, import.meta.url));

const manifest = JSON.parse(readFileSync(publicPath("manifest.json"), "utf8")) as {
  name: string;
  short_name: string;
  description?: string;
  start_url?: string;
  scope?: string;
  id?: string;
  display: string;
  theme_color: string;
  background_color: string;
  icons: ManifestIcon[];
};

const indexHtml = readFileSync(
  fileURLToPath(new URL("../../../apps/web/index.html", import.meta.url)),
  "utf8",
);

describe("PWA manifest is installable", () => {
  it("has the fields install prompts require", () => {
    expect(manifest.name).toBe("SnapOtter");
    expect(manifest.short_name).toBe("SnapOtter");
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.scope).toBeTruthy();
    expect(manifest.display).toBe("standalone");
    expect(manifest.description).toBeTruthy();
    expect(manifest.theme_color).toBe("#E07832");
    // Splash background must match the app's light background token
    // (--color-background in globals.css), not stark white.
    expect(manifest.background_color).toBe("#FAFAF7");
  });

  it.each(["/", "/snapotter/", "/apps/snapotter/"])(
    "keeps launch, scope, identity, and icons inside %s",
    (basePath) => {
      const appUrl = new URL(basePath, "https://example.com");
      const manifestUrl = new URL("manifest.json", appUrl);
      const startUrl = new URL(manifest.start_url ?? "", manifestUrl);
      const scope = new URL(manifest.scope ?? "", manifestUrl);
      // An explicit id resolves against the origin, not the manifest directory.
      // Omitting it uses start_url and keeps each deployment's identity distinct.
      // https://www.w3.org/TR/appmanifest/#id-member
      const id = manifest.id === undefined ? startUrl : new URL(manifest.id, startUrl.origin);

      expect(startUrl.href).toBe(appUrl.href);
      expect(scope.href).toBe(appUrl.href);
      expect(id.href).toBe(appUrl.href);
      for (const icon of manifest.icons) {
        const iconUrl = new URL(icon.src, manifestUrl);
        expect(iconUrl.origin).toBe(appUrl.origin);
        expect(iconUrl.pathname.startsWith(basePath)).toBe(true);
      }
    },
  );

  it("ships 192 and 512 icons for both any and maskable purposes", () => {
    for (const purpose of ["any", "maskable"] as const) {
      for (const sizes of ["192x192", "512x512"] as const) {
        const icon = manifest.icons.find(
          (i) => (i.purpose ?? "any") === purpose && i.sizes === sizes,
        );
        expect(icon, `missing ${purpose} ${sizes} icon`).toBeTruthy();
      }
    }
  });

  it("references only icon files that actually exist", () => {
    for (const icon of manifest.icons) {
      expect(existsSync(publicPath(icon.src.replace(/^\//, ""))), `${icon.src} missing`).toBe(true);
    }
  });

  it("is linked from index.html", () => {
    expect(indexHtml).toContain('rel="manifest"');
  });
});
