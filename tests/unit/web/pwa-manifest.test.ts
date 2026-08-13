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
 * complete manifest: start_url/scope/id, real icon files, and maskable
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
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.id).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.description).toBeTruthy();
    expect(manifest.theme_color).toBe("#E07832");
    // Splash background must match the app's light background token
    // (--color-background in globals.css), not stark white.
    expect(manifest.background_color).toBe("#FAFAF7");
  });

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
