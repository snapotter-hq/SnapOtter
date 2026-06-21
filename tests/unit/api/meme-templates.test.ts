import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const TEMPLATES_DIR = join(__dirname, "../../../apps/api/static/meme-templates");
const MANIFEST_PATH = join(TEMPLATES_DIR, "meme-templates.json");
const VALID_CATEGORIES = ["reaction", "comparison", "opinion", "animals", "classic"];

interface TextBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  defaultText: string;
}

interface Template {
  id: string;
  name: string;
  aliases: string[];
  tags: string[];
  category: string;
  filename: string;
  width: number;
  height: number;
  popularity: number;
  textBoxes: TextBox[];
}

interface Manifest {
  version: number;
  categories: string[];
  templates: Template[];
}

function loadManifest(): Manifest {
  const raw = readFileSync(MANIFEST_PATH, "utf-8");
  return JSON.parse(raw);
}

describe("meme template manifest validation", () => {
  it("manifest file exists and is valid JSON with version 1 and non-empty templates array", () => {
    expect(existsSync(MANIFEST_PATH)).toBe(true);

    const raw = readFileSync(MANIFEST_PATH, "utf-8");
    let manifest: Manifest;
    expect(() => {
      manifest = JSON.parse(raw);
    }).not.toThrow();

    manifest = JSON.parse(raw);
    expect(manifest.version).toBe(1);
    expect(Array.isArray(manifest.templates)).toBe(true);
    expect(manifest.templates.length).toBeGreaterThan(0);
  });

  it("has no duplicate template IDs", () => {
    const manifest = loadManifest();
    const ids = manifest.templates.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);

    // Identify duplicates for a useful error message
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const id of ids) {
      if (seen.has(id)) {
        duplicates.push(id);
      }
      seen.add(id);
    }
    expect(duplicates, `Duplicate template IDs: ${duplicates.join(", ")}`).toHaveLength(0);
  });

  it("every template has required fields with correct types", () => {
    const manifest = loadManifest();

    for (const template of manifest.templates) {
      const label = `template "${template.id || template.name || "unknown"}"`;

      // Required string fields
      expect(typeof template.id, `${label}: id must be a string`).toBe("string");
      expect(template.id.length, `${label}: id must not be empty`).toBeGreaterThan(0);
      expect(typeof template.name, `${label}: name must be a string`).toBe("string");
      expect(template.name.length, `${label}: name must not be empty`).toBeGreaterThan(0);

      // aliases must be an array
      expect(Array.isArray(template.aliases), `${label}: aliases must be an array`).toBe(true);

      // tags must be an array
      expect(Array.isArray(template.tags), `${label}: tags must be an array`).toBe(true);

      // category must be valid
      expect(
        VALID_CATEGORIES.includes(template.category),
        `${label}: category "${template.category}" is not one of ${VALID_CATEGORIES.join(", ")}`,
      ).toBe(true);

      // filename
      expect(typeof template.filename, `${label}: filename must be a string`).toBe("string");
      expect(template.filename.length, `${label}: filename must not be empty`).toBeGreaterThan(0);

      // width and height must be positive numbers
      expect(typeof template.width, `${label}: width must be a number`).toBe("number");
      expect(template.width, `${label}: width must be positive`).toBeGreaterThan(0);
      expect(typeof template.height, `${label}: height must be a number`).toBe("number");
      expect(template.height, `${label}: height must be positive`).toBeGreaterThan(0);

      // popularity must be non-negative
      expect(typeof template.popularity, `${label}: popularity must be a number`).toBe("number");
      expect(
        template.popularity,
        `${label}: popularity must be non-negative`,
      ).toBeGreaterThanOrEqual(0);

      // textBoxes must be a non-empty array
      expect(Array.isArray(template.textBoxes), `${label}: textBoxes must be an array`).toBe(true);
      expect(
        template.textBoxes.length,
        `${label}: must have at least one textBox`,
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it("text box coordinates are in valid percentage range (0-100)", () => {
    const manifest = loadManifest();

    for (const template of manifest.templates) {
      for (const box of template.textBoxes) {
        const label = `template "${template.id}" textBox "${box.id}"`;

        expect(box.x, `${label}: x must be >= 0`).toBeGreaterThanOrEqual(0);
        expect(box.x, `${label}: x must be <= 100`).toBeLessThanOrEqual(100);

        expect(box.y, `${label}: y must be >= 0`).toBeGreaterThanOrEqual(0);
        expect(box.y, `${label}: y must be <= 100`).toBeLessThanOrEqual(100);

        expect(box.width, `${label}: width must be >= 0`).toBeGreaterThanOrEqual(0);
        expect(box.width, `${label}: width must be <= 100`).toBeLessThanOrEqual(100);

        expect(box.height, `${label}: height must be >= 0`).toBeGreaterThanOrEqual(0);
        expect(box.height, `${label}: height must be <= 100`).toBeLessThanOrEqual(100);
      }
    }
  });

  it("no duplicate text box IDs within a template", () => {
    const manifest = loadManifest();

    for (const template of manifest.templates) {
      const boxIds = template.textBoxes.map((b) => b.id);
      const uniqueBoxIds = new Set(boxIds);
      expect(uniqueBoxIds.size, `template "${template.id}" has duplicate textBox IDs`).toBe(
        boxIds.length,
      );
    }
  });

  it("every template has a corresponding full-size image in full/ directory", () => {
    const manifest = loadManifest();
    const fullDir = join(TEMPLATES_DIR, "full");

    for (const template of manifest.templates) {
      const imagePath = join(fullDir, template.filename);
      expect(
        existsSync(imagePath),
        `template "${template.id}": missing full image at full/${template.filename}`,
      ).toBe(true);
    }
  });

  it("every template has a corresponding thumbnail in thumbs/ directory", () => {
    const manifest = loadManifest();
    const thumbsDir = join(TEMPLATES_DIR, "thumbs");

    for (const template of manifest.templates) {
      // Thumbnail uses the same base name but with .webp extension
      const baseName = template.filename.replace(/\.[^.]+$/, "");
      const thumbFilename = `${baseName}.webp`;
      const thumbPath = join(thumbsDir, thumbFilename);
      expect(
        existsSync(thumbPath),
        `template "${template.id}": missing thumbnail at thumbs/${thumbFilename}`,
      ).toBe(true);
    }
  });
});
