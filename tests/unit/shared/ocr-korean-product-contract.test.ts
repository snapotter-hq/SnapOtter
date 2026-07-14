import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadTranslations, SUPPORTED_LOCALES } from "@snapotter/shared";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../../..");
const localizedCodes = SUPPORTED_LOCALES.map((locale) => locale.code).filter(
  (locale) => locale !== "en",
);

type OpenApiContract = {
  components: {
    schemas: {
      FeatureNotInstalledError: {
        properties: {
          requestedQuality: { enum: string[]; description: string };
          guidance: { description: string };
        };
      };
    };
  };
  paths: Record<
    string,
    {
      post: {
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                properties: {
                  file: { maxLength?: number };
                  settings: { description: string };
                };
              };
            };
          };
        };
      };
    }
  >;
};

function readOpenApi(locale: string): OpenApiContract {
  const suffix = locale === "en" ? "" : `.${locale}`;
  return yaml.load(
    readFileSync(join(root, `apps/api/src/openapi${suffix}.yaml`), "utf8"),
  ) as OpenApiContract;
}

describe("Korean OCR product contract", () => {
  it("publishes the Fast incompatibility response in every OpenAPI locale", () => {
    for (const locale of SUPPORTED_LOCALES.map((item) => item.code)) {
      const spec = readOpenApi(locale);
      const properties = spec.components.schemas.FeatureNotInstalledError.properties;

      expect(properties.requestedQuality.enum, locale).toEqual(["fast", "balanced", "best"]);
      expect(properties.requestedQuality.description, locale).toMatch(/Fast.*Korean/i);
      expect(properties.guidance.description, locale).toMatch(/guidance/i);

      for (const route of ["/api/v1/tools/image/ocr", "/api/v1/tools/pdf/ocr-pdf"]) {
        const settings =
          spec.paths[route].post.requestBody.content["multipart/form-data"].schema.properties
            .settings.description;
        expect(settings, `${locale} ${route}`).toContain("Korean never selects fast");
        expect(settings, `${locale} ${route}`).toContain("legacy tesseract alias");
      }
    }
  });

  it("publishes the encoded-input ceiling on both OCR routes, not unrelated PDF tools", () => {
    for (const locale of SUPPORTED_LOCALES.map((item) => item.code)) {
      const spec = readOpenApi(locale);
      const fileLimit = (route: string) =>
        spec.paths[route].post.requestBody.content["multipart/form-data"].schema.properties.file
          .maxLength;

      expect(fileLimit("/api/v1/tools/image/ocr"), `${locale} image OCR`).toBe(536_870_912);
      expect(fileLimit("/api/v1/tools/pdf/ocr-pdf"), `${locale} PDF OCR`).toBe(536_870_912);
      expect(fileLimit("/api/v1/tools/pdf/flatten-pdf"), `${locale} flatten PDF`).toBeUndefined();
    }
  });

  it("describes Korean tier compatibility accurately on the landing page", () => {
    const source = readFileSync(join(root, "apps/landing/src/data/tool-seo.ts"), "utf8");

    expect(source).toContain("Korean requires the Balanced or Best tier");
    expect(source).toContain("Fast returns an incompatibility error for Korean");
    expect(source).not.toContain(
      "The same language choices are available for the Fast, Balanced, and Best tiers.",
    );
  });

  it("provides localized accessible guidance in all 21 app locales", async () => {
    const english = (await loadTranslations("en")).toolSettings.ocr.fastKoreanUnsupported;
    expect(english).toMatch(/Fast OCR.*Korean.*Accurate OCR pack.*Balanced or Best/);

    for (const locale of localizedCodes) {
      const message = (await loadTranslations(locale)).toolSettings.ocr.fastKoreanUnsupported;
      expect(message, locale).toBeTruthy();
      expect(message, locale).not.toBe(english);
    }
  });

  it("documents the compatibility boundary in all localized OCR guides", () => {
    const documents = [
      "api/ai.md",
      "guide/deployment.md",
      "tools/image/ocr.md",
      "tools/pdf/ocr-pdf.md",
    ];

    for (const locale of localizedCodes) {
      for (const document of documents) {
        const content = readFileSync(join(root, "apps/docs", locale, document), "utf8");
        expect(content, `${locale}/${document}`).toContain("<!-- korean-ocr-contract:start -->");
        expect(content, `${locale}/${document}`).toContain("`fast-korean-unsupported`");
        expect(content, `${locale}/${document}`).toContain("`FEATURE_INCOMPATIBLE`");
        expect(content, `${locale}/${document}`).toContain("Linux amd64");
        expect(content, `${locale}/${document}`).toContain("arm64");
        expect(content, `${locale}/${document}`).toContain("NVIDIA");
      }
    }
  });

  it("publishes the measured 25 MiB Fast OCR footprint without stale 24/29 MiB copy", () => {
    const documents = [
      "api/ai.md",
      "guide/deployment.md",
      "tools/image/ocr.md",
      "tools/pdf/ocr-pdf.md",
    ];
    const files = [
      "README.md",
      "DOCKERHUB.md",
      "llms.txt",
      "apps/landing/public/llms.txt",
      ...documents.map((document) => join("apps/docs", document)),
      ...localizedCodes.flatMap((locale) =>
        documents.map((document) => join("apps/docs", locale, document)),
      ),
    ];

    expect(files).toHaveLength(88);
    for (const file of files) {
      const footprintLines = readFileSync(join(root, file), "utf8")
        .split("\n")
        .filter(
          (line) =>
            /OCR|Tesseract|`fast`/i.test(line) &&
            line.includes("MiB") &&
            /\b(?:24|25|29)\b/.test(line),
        );

      expect(footprintLines, file).toHaveLength(1);
      expect(footprintLines[0], file).toMatch(/\b25\b/);
      expect(footprintLines[0], file).not.toMatch(/\b24\b/);
      expect(footprintLines[0], file).not.toMatch(/\b29\b/);
    }
  });
});
