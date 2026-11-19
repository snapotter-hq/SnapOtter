import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dockerfile = readFileSync(resolve(process.cwd(), "docker/Dockerfile"), "utf8");

function runtimeAptBlock(): string {
  const start = dockerfile.indexOf("libreoffice-calc libreoffice-impress libreoffice-writer");
  expect(start, "production image should install LibreOffice").toBeGreaterThan(0);
  const runStart = dockerfile.lastIndexOf("\nRUN ", start);
  const runEnd = dockerfile.indexOf("\n\n", start);
  return dockerfile
    .slice(runStart, runEnd)
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
}

// Without these, fontconfig falls back to DejaVu Sans for Office's default
// fonts, which runs about 24% wider than Calibri and pushes slide text off the
// page in LibreOffice conversions (#4834). Both packages are freely
// redistributable under the SIL OFL 1.1.
describe("office metric-compatible fonts (#4834)", () => {
  it("installs Carlito and Caladea next to LibreOffice", () => {
    const block = runtimeAptBlock();
    expect(block).toMatch(/\bfonts-crosextra-carlito\b/);
    expect(block).toMatch(/\bfonts-crosextra-caladea\b/);
  });

  it("fails the build when Calibri or Cambria stop resolving to their clones", () => {
    const block = runtimeAptBlock();
    expect(block).toContain("fc-match Calibri | grep -q Carlito");
    expect(block).toContain("fc-match Cambria | grep -q Caladea");
  });

  it("never bundles Microsoft's own fonts", () => {
    expect(dockerfile).not.toMatch(/ttf-mscorefonts|fonts-microsoft|mscorefonts/i);
  });
});
