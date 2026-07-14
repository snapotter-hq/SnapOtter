import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

type TrackedFile = {
  path: string;
  bytes: number;
  sha256: string;
};

type Fixture = {
  id: string;
  category: string;
  language: string;
  image: TrackedFile & {
    mediaType: string;
    width: number;
    height: number;
    sourceSha256: string;
  };
  annotation: TrackedFile & {
    sourceField: string;
  };
  groundTruth: TrackedFile & {
    encoding: string;
    derivation: string;
    sourceField: string;
    joinSeparator: string;
    terminalNewline: boolean;
    unicodeNormalization: string;
    whitespaceNormalization: string;
    comparisonNormalization: {
      unicode: string;
      case: string;
      whitespace: string;
      punctuation: string;
    };
  };
  evaluation: {
    mode: string;
    ignoredTokens: string[];
    notes: string;
  };
  provenance: {
    dataset: string;
    upstreamId: string;
    repositoryRevision: string;
    sourceRecordUrl: string;
    sourceDatasetUrl: string;
    pixelLicense: string;
    annotationLicense: string;
    licenseEvidenceUrls: string[];
    attribution: string;
    modifications: string[];
    privacyReview: string;
  } & (
    | {
        split: string;
        sourceShard: TrackedFile & {
          globalRowIndex: number;
          rowGroup: number;
          rowIndex: number;
        };
        sourceFile?: never;
      }
    | {
        split?: never;
        sourceShard?: never;
        sourceFile: {
          bytes: number;
          fileTimestamp: string;
          pageId: number;
          sha1: string;
          sha256: string;
          sourceUrl: string;
        };
      }
  );
};

type Manifest = {
  schemaVersion: number;
  heldOutPolicy: string;
  boardCohort: {
    distinctRowGroups: number[];
    fixtureIds: string[];
    perImageFastFloor: {
      minimumTokenF1: number;
      minimumTokenPrecision: number;
      minimumTokenRecall: number;
    };
    selectionRule: string;
    selectionStatus: string;
    stopPolicy: string;
  };
  koreanCohort: {
    fastDisposition: {
      accurateTierResults: Record<
        "balanced" | "best",
        {
          releaseGatePassed: true;
          tokenF1: number;
          tokenPrecision: number;
          tokenRecall: number;
        }
      >;
      boundedStrategyAudit: {
        diagnosticManifestSha256: string;
        failed: number;
        tested: number;
      };
      decision: {
        enforcedBehavior: string;
        unsupportedReason: string;
      };
      evidence: {
        artifactSha256: string;
        fastReportSha256: string;
        fastText: string;
        fastTextSha256: string;
        qualityCheckpointSha256: string;
        sourceImageId: string;
        verifierSha256: string;
      };
      fastResult: {
        releaseGatePassed: false;
        tokenF1: number;
        tokenPrecision: number;
        tokenRecall: number;
      };
      status: string;
    };
    fixtureIds: string[];
    perImageTierFloors: Record<
      "balanced" | "best" | "fast",
      {
        minimumTokenF1: number;
        minimumTokenPrecision: number;
        minimumTokenRecall: number;
      }
    >;
    selectionRule: string;
    selectionStatus: string;
    stopPolicy: string;
  };
  fixtures: Fixture[];
  licenseFiles: Array<TrackedFile & { spdx: string; sourceUrl: string }>;
};

const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(here, "../../fixtures/ocr-real");
const manifestRaw = readFileSync(join(fixtureRoot, "manifest.json"), "utf8");
const manifest = JSON.parse(manifestRaw) as Manifest;

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, child]) => [key, sortJson(child)]),
    );
  }
  return value;
}

function expectSortedJsonKeys(value: unknown): void {
  if (Array.isArray(value)) {
    for (const child of value) expectSortedJsonKeys(child);
    return;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    expect(entries.map(([key]) => key)).toEqual(
      entries.map(([key]) => key).sort((left, right) => left.localeCompare(right, "en")),
    );
    for (const [, child] of entries) expectSortedJsonKeys(child);
  }
}

function assertSafeRelativePath(path: string): string {
  const resolved = resolve(fixtureRoot, path);
  expect(path).not.toMatch(/^[/\\]/);
  expect(path.split(/[\\/]/)).not.toContain("..");
  expect(relative(fixtureRoot, resolved).split(sep)).not.toContain("..");
  return resolved;
}

function assertTrackedFile(file: TrackedFile): Buffer {
  expect(file.path).toMatch(/^[a-z0-9][a-z0-9./_-]*$/);
  expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(file.bytes).toBeGreaterThan(0);

  const contents = readFileSync(assertSafeRelativePath(file.path));
  expect(contents.byteLength, `${file.path} byte count`).toBe(file.bytes);
  expect(createHash("sha256").update(contents).digest("hex"), `${file.path} sha256`).toBe(
    file.sha256,
  );
  return contents;
}

function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(absolute) : [relative(fixtureRoot, absolute)];
  });
}

describe("held-out real-world OCR fixtures", () => {
  it("keeps canonical annotations out of generic Biome formatting", () => {
    const biomeConfig = JSON.parse(
      readFileSync(resolve(fixtureRoot, "../../..", "biome.json"), "utf8"),
    ) as { files: { includes: string[] } };

    expect(biomeConfig.files.includes).toContain("!**/tests/fixtures/ocr-real/annotations/*.json");
  });

  it("pins seven licensed, attributed fixtures with a lean binary budget", () => {
    expect(manifest.schemaVersion).toBe(1);
    expect(createHash("sha256").update(manifestRaw).digest("hex")).toBe(
      "979c2ce9fbae524a2627e3b12ba785d5f3c2d73b2c372d486e66f7a1fd248f5f",
    );
    expect(manifest.heldOutPolicy).toBe(
      "These files are regression inputs only and must not be used to tune OCR models or acceptance thresholds after observing their outputs.",
    );
    expect(manifest.fixtures).toHaveLength(7);
    expect(new Set(manifest.fixtures.map((fixture) => fixture.id)).size).toBe(7);

    const categories = new Set(manifest.fixtures.map((fixture) => fixture.category));
    expect(categories).toEqual(new Set(["mobile-receipt", "board-or-sign", "photographed-form"]));
    expect(
      manifest.fixtures.filter((fixture) => fixture.category === "mobile-receipt"),
    ).toHaveLength(2);
    expect(
      manifest.fixtures.filter((fixture) => fixture.category === "board-or-sign"),
    ).toHaveLength(4);
    expect(manifest.fixtures.filter((fixture) => fixture.language === "ja")).toHaveLength(4);
    expect(manifest.fixtures.filter((fixture) => fixture.language === "ko")).toHaveLength(1);
    expect(manifest.boardCohort).toEqual({
      distinctRowGroups: [0, 1, 3],
      fixtureIds: ["jawildtext-board-0001", "jawildtext-board-0049", "jawildtext-board-0127"],
      perImageFastFloor: {
        minimumTokenF1: 0.32,
        minimumTokenPrecision: 0.5,
        minimumTokenRecall: 0.25,
      },
      selectionRule:
        "The smallest byte-for-byte source image in each of row groups 0, 1, and 3; image-only visual/privacy review confirmed distinct conditions and safe public content.",
      selectionStatus: "FROZEN_BEFORE_ANY_OCR_OUTPUT",
      stopPolicy:
        "If any frozen cohort image fails after the general development-corpus fix, stop rotating fixtures and reconsider the Fast CJK architecture.",
    });
    expect(manifest.koreanCohort).toEqual({
      fastDisposition: {
        accurateTierResults: {
          balanced: {
            releaseGatePassed: true,
            tokenF1: 0.692308,
            tokenPrecision: 0.9,
            tokenRecall: 0.5625,
          },
          best: {
            releaseGatePassed: true,
            tokenF1: 0.692308,
            tokenPrecision: 0.9,
            tokenRecall: 0.5625,
          },
        },
        boundedStrategyAudit: {
          diagnosticManifestSha256:
            "8e82e22b5d939ca40e97d8a74e8ce73dda451e99ba8b33a95a94723c4679d1b4",
          failed: 6,
          tested: 6,
        },
        decision: {
          enforcedBehavior: "reject-before-tesseract-spawn",
          unsupportedReason:
            "Fast OCR does not support Korean. Install the Accurate OCR bundle and choose Balanced or Best.",
        },
        evidence: {
          artifactSha256: "42b9609dab9b8680c208d4b20828314ce912f3691bbd12114b31ab31b4cfbd05",
          fastReportSha256: "0a9743c46e67aad7948d5a5880bfbd5096a4023c6006de5f94668580a2df276a",
          fastText: "=\n< 하 계\n: Hagye 최\nㅜㅠ 좋\n==",
          fastTextSha256: "6ddecdd52dd0a66074fb3c1d003a28493975f63421f70600706ccc01b7bb2c73",
          qualityCheckpointSha256:
            "41e4c01959602c3c255c09210fd3203ab80eee696bf28578d1137bf07f38bab7",
          sourceImageId: "sha256:127753b7916aea38eac139a4070af95854ccdc68f93a9c4d59618c7e8c7f4bfa",
          verifierSha256: "d4f9e3c1572c7eba4f5157c2a70785233ceed0296cb734a50890e940d16dd2cf",
        },
        fastResult: {
          releaseGatePassed: false,
          tokenF1: 0.214286,
          tokenPrecision: 0.25,
          tokenRecall: 0.1875,
        },
        status: "REJECTED_AFTER_FROZEN_GATE",
      },
      fixtureIds: ["commons-hagye-station-715"],
      perImageTierFloors: {
        balanced: {
          minimumTokenF1: 0.56,
          minimumTokenPrecision: 0.65,
          minimumTokenRecall: 0.5,
        },
        best: {
          minimumTokenF1: 0.6,
          minimumTokenPrecision: 0.68,
          minimumTokenRecall: 0.55,
        },
        fast: {
          minimumTokenF1: 0.32,
          minimumTokenPrecision: 0.5,
          minimumTokenRecall: 0.25,
        },
      },
      selectionRule:
        "On 2026-07-13, enumerate original bitmap files in Wikimedia Commons Category:Train station signs of Seoul Subway Line 7, sort by byte size ascending, retain public-domain landscape photographs at least 500×400 with no people or private data and manually legible Hangul, Latin, and Arabic digits, then choose the smallest. Hagye01.jpg is the first eligible file; the smaller public-domain Junggokst01.jpg is only 411×308.",
      selectionStatus: "FROZEN_BEFORE_ANY_OCR_OUTPUT",
      stopPolicy:
        "If the frozen Korean fixture fails, do not swap or edit the fixture, transcript, or limits; reconsider the Korean Fast model.",
    });
    const koreanFixture = manifest.fixtures.find(
      (fixture) => fixture.id === "commons-hagye-station-715",
    );
    expect(koreanFixture?.annotation).toEqual({
      bytes: 520,
      path: "annotations/commons-hagye-station-715.json",
      sha256: "3a4d752b0403c4bbc140842bc7fce343e8caaefa13d43ddf7cdf818cb8be7241",
      sourceField: "manualTranscription",
    });
    expect(koreanFixture?.groundTruth).toMatchObject({
      bytes: 70,
      path: "ground-truth/commons-hagye-station-715.txt",
      sha256: "653a0b2be1543052a42ec83c36c2c8375321a3fc03c48051dd70b4b33624d120",
      sourceField: "manualTranscription",
    });
    expect(manifestRaw.endsWith("\n")).toBe(true);
    expectSortedJsonKeys(manifest);

    let imageBytes = 0;
    for (const fixture of manifest.fixtures) {
      imageBytes += assertTrackedFile(fixture.image).byteLength;
      expect(fixture.image.mediaType).toMatch(/^image\/(jpeg|png|webp)$/);
      expect(fixture.image.width).toBeGreaterThan(0);
      expect(fixture.image.height).toBeGreaterThan(0);
      expect(fixture.image.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(fixture.image.sourceSha256).toBe(fixture.image.sha256);

      expect(fixture.provenance.dataset).not.toHaveLength(0);
      expect(fixture.provenance.upstreamId).not.toHaveLength(0);
      expect(fixture.provenance.sourceRecordUrl).toMatch(/^https:\/\//);
      expect(fixture.provenance.sourceDatasetUrl).toMatch(/^https:\/\//);
      expect(fixture.provenance.sourceRecordUrl).toContain(fixture.provenance.repositoryRevision);
      const hasSourceShard = fixture.provenance.sourceShard !== undefined;
      const hasSourceFile = fixture.provenance.sourceFile !== undefined;
      expect(hasSourceShard).not.toBe(hasSourceFile);
      if (hasSourceShard) {
        expect(fixture.provenance.repositoryRevision).toMatch(/^[a-f0-9]{40}$/);
        expect(fixture.provenance.split).toMatch(/^(train|validation|test)$/);
        expect(fixture.provenance.sourceDatasetUrl).toContain(
          fixture.provenance.repositoryRevision,
        );
        expect(fixture.provenance.sourceShard?.path).toMatch(/\.parquet$/);
        expect(fixture.provenance.sourceShard?.sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(fixture.provenance.sourceShard?.bytes).toBeGreaterThan(fixture.image.bytes);
        expect(fixture.provenance.sourceShard?.globalRowIndex).toBeGreaterThanOrEqual(0);
        expect(fixture.provenance.sourceShard?.rowGroup).toBeGreaterThanOrEqual(0);
        expect(fixture.provenance.sourceShard?.rowIndex).toBeGreaterThanOrEqual(0);
      } else {
        expect(fixture.provenance.repositoryRevision).toBe("1234274506");
        expect(fixture.provenance.split).toBeUndefined();
        expect(fixture.provenance.sourceFile).toEqual({
          bytes: 44677,
          fileTimestamp: "2009-08-18T13:00:50Z",
          pageId: 7592246,
          sha1: "fd1f0cc88f931af22576c7404270837916c60d8d",
          sha256: "a9ae819505be17d87393695bdadd1aaff47b0a8b81faec98b38408397942b3dc",
          sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/c/cb/Hagye01.jpg",
        });
      }
      expect(["Apache-2.0", "CC-BY-4.0", "LicenseRef-Public-Domain", "MIT"]).toContain(
        fixture.provenance.pixelLicense,
      );
      expect(fixture.provenance.annotationLicense).toBe(fixture.provenance.pixelLicense);
      expect(fixture.provenance.licenseEvidenceUrls.length).toBeGreaterThanOrEqual(2);
      for (const sourceUrl of fixture.provenance.licenseEvidenceUrls) {
        expect(sourceUrl).toMatch(/^https:\/\//);
      }
      expect(fixture.provenance.attribution.trim().length).toBeGreaterThan(20);
      expect(fixture.provenance.modifications.length).toBeGreaterThan(0);
      expect(fixture.provenance.modifications.join(" ")).toContain("byte-for-byte");
      expect(fixture.provenance.privacyReview.trim().length).toBeGreaterThan(20);

      const annotationRaw = assertTrackedFile(fixture.annotation).toString("utf8");
      const annotation = JSON.parse(annotationRaw) as {
        exactGroundTruth: string;
        source: {
          repositoryRevision: string;
          upstreamId: string;
        };
      };
      const groundTruth = assertTrackedFile(fixture.groundTruth).toString("utf8");
      expect(annotationRaw).toBe(`${JSON.stringify(sortJson(annotation), null, 2)}\n`);
      expect(annotation.source.repositoryRevision).toBe(fixture.provenance.repositoryRevision);
      expect(annotation.source.upstreamId).toBe(fixture.provenance.upstreamId);
      expect(fixture.annotation.sourceField).not.toHaveLength(0);
      expect(fixture.groundTruth.encoding).toBe("UTF-8");
      expect(fixture.groundTruth.derivation).toBe("verbatim-from-annotation");
      expect(fixture.groundTruth.sourceField).not.toHaveLength(0);
      expect(fixture.groundTruth.joinSeparator).toBe("LF");
      expect(fixture.groundTruth.terminalNewline).toBe(true);
      expect(fixture.groundTruth.unicodeNormalization).toBe("none");
      expect(fixture.groundTruth.whitespaceNormalization).toBe("none");
      expect(fixture.groundTruth.comparisonNormalization).toEqual({
        case: "casefold",
        punctuation: "preserve",
        unicode: "NFC",
        whitespace: "collapse-runs-and-trim",
      });
      expect(["annotation-token-coverage", "page-transcript"]).toContain(fixture.evaluation.mode);
      expect(fixture.evaluation.notes.trim().length).toBeGreaterThan(20);
      expect(new Set(fixture.evaluation.ignoredTokens).size).toBe(
        fixture.evaluation.ignoredTokens.length,
      );
      expect(groundTruth).toBe(`${annotation.exactGroundTruth}\n`);
      if (fixture.id === "commons-hagye-station-715") {
        expect(annotation.exactGroundTruth).toBe(
          "715\n중계\nJunggye\n中溪\n하계\nHagye\n下溪\n공릉\nGongneung\n孔陵",
        );
      }
      expect(groundTruth).not.toMatch(/^\uFEFF/);
    }

    expect(imageBytes).toBeLessThanOrEqual(5 * 1024 * 1024);
  });

  it("tracks every redistributed file and its primary license source", () => {
    const trackedPaths = new Set<string>();
    for (const fixture of manifest.fixtures) {
      for (const file of [fixture.image, fixture.annotation, fixture.groundTruth]) {
        expect(trackedPaths.has(file.path), `duplicate tracked path: ${file.path}`).toBe(false);
        trackedPaths.add(file.path);
      }
    }

    expect(manifest.licenseFiles.map((license) => license.spdx).sort()).toEqual([
      "Apache-2.0",
      "CC-BY-4.0",
      "MIT",
    ]);
    for (const license of manifest.licenseFiles) {
      assertTrackedFile(license);
      expect(license.sourceUrl).toMatch(/^https:\/\//);
      trackedPaths.add(license.path);
    }

    trackedPaths.add("NOTICE.md");
    trackedPaths.add("manifest.json");
    expect(listFiles(fixtureRoot).sort()).toEqual([...trackedPaths].sort());
    expect(statSync(join(fixtureRoot, "NOTICE.md")).size).toBeGreaterThan(0);
  });
});
