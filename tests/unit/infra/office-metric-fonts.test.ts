import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dockerfile = readFileSync(resolve(process.cwd(), "docker/Dockerfile"), "utf8");
const aptosConfPath = "docker/fontconfig/35-snapotter-aptos.conf";

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
    expect(dockerfile).not.toMatch(/aptos[^\s]*\.(ttf|otf)/i);
  });
});

// Aptos replaced Calibri as Office's default in 2024 and has no free clone, so
// without an alias it lands on DejaVu Sans like Calibri used to. Carlito is the
// closest free sans already in the image (#4879). The theme pairs Aptos body
// text with Aptos Display headings, so both need the alias.
describe("Aptos stand-in (#4879)", () => {
  const conf = readFileSync(resolve(process.cwd(), aptosConfPath), "utf8");

  it.each(["Aptos", "Aptos Display"])("aliases %s to Carlito", (family) => {
    const alias = conf
      .split("<alias")
      .slice(1)
      .find((block) => block.includes(`<family>${family}</family>`));
    expect(alias, `${family} should have an alias`).toBeDefined();
    expect(alias).toMatch(/<accept>\s*<family>Carlito<\/family>\s*<\/accept>/);
  });

  it("installs the alias into fontconfig before the guarded apt layer", () => {
    const copy = dockerfile.indexOf(`COPY ${aptosConfPath} /etc/fonts/conf.d/`);
    expect(copy, "Dockerfile should copy the Aptos alias into conf.d").toBeGreaterThan(0);
    expect(copy).toBeLessThan(dockerfile.indexOf("fc-match Calibri"));
  });

  it("fails the build when Aptos stops resolving to Carlito", () => {
    const block = runtimeAptBlock();
    expect(block).toContain("fc-match Aptos | grep -q Carlito");
    expect(block).toContain('fc-match "Aptos Display" | grep -q Carlito');
  });
});
