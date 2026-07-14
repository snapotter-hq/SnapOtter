import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const verifierPath = path.resolve(root, "docker/verify-bundle.sh");
const builderPath = path.resolve(root, "docker/build-bundle.sh");
const workflowPath = path.resolve(root, ".github/workflows/ai-bundles.yml");
const manifestPath = path.resolve(root, "docker/feature-manifest.json");

function readRequired(file: string): string {
  expect(existsSync(file), `${path.relative(root, file)} is missing`).toBe(true);
  return readFileSync(file, "utf8");
}

function job(workflow: string, name: string): string {
  const start = workflow.indexOf(`  ${name}:\n`);
  expect(start, `job ${name} is missing`).toBeGreaterThanOrEqual(0);
  return workflow.slice(start);
}

describe("legacy bundle release workflow", () => {
  it("keeps immutable v2 legacy bundles out of each OCR release", () => {
    const workflow = readRequired(workflowPath);
    const manifest = JSON.parse(readRequired(manifestPath));

    expect(workflow).not.toContain("  build-legacy:\n");
    expect(workflow).not.toContain("  verify-legacy:\n");
    for (const [bundleId, bundle] of Object.entries(manifest.bundles) as Array<
      [string, { runtimeFormatVersion?: number; archives?: Record<string, { file: string }> }]
    >) {
      if (bundleId === "ocr" || bundle.runtimeFormatVersion === 3) continue;
      for (const archive of Object.values(bundle.archives ?? {})) {
        expect(archive.file).toMatch(/^v2\.0\.0\//);
      }
    }
  });

  it("derives the verification purelib directory from the image interpreter", () => {
    const verifier = readRequired(verifierPath);

    expect(verifier).toContain(
      `SITE_PACKAGES="$("\${PYTHON}" -c 'import sysconfig; print(sysconfig.get_paths()["purelib"])')"`,
    );
    expect(verifier).not.toMatch(/lib\/python3\.11\/site-packages/);
  });

  it("runs every functional smoke directly through the Python executable under timeout", () => {
    const verifier = readRequired(verifierPath);

    expect(verifier).not.toMatch(/timeout\s+300\s+run_python/);
    for (const script of [
      "remove_bg.py",
      "detect_faces.py",
      "colorize.py",
      "upscale.py",
      "restore.py",
      "transcribe.py",
    ]) {
      expect(verifier).toContain(`timeout 300 "\${PYTHON}" "\${AI_SCRIPTS}/${script}"`);
    }
  });

  it("addresses fixtures through the mounted modality directories", () => {
    const verifier = readRequired(verifierPath);
    const fixturePaths = [
      "image/valid/test-200x150.png",
      "image/valid/sample-photo.jpg",
      "image/valid/test-100x100.jpg",
      "audio/valid/speech-10s.wav",
    ];

    for (const fixture of fixturePaths) {
      expect(existsSync(path.resolve(root, "tests/fixtures", fixture)), fixture).toBe(true);
      expect(verifier).toContain(`/fixtures/${fixture}`);
    }
    expect(verifier).not.toContain("/fixtures/content/");
  });

  it("normalizes legacy archives for byte-reproducible rebuilds", () => {
    const builder = readRequired(builderPath);

    expect(builder).toContain(`SOURCE_DATE_EPOCH="\${SOURCE_DATE_EPOCH:-0}"`);
    expect(builder).toContain("LC_ALL=C sort -z");
    expect(builder).toContain("--sort=name");
    expect(builder).toContain(`--mtime="@\${SOURCE_DATE_EPOCH}"`);
    expect(builder).toContain("--owner=0");
    expect(builder).toContain("--group=0");
    expect(builder).toContain("--numeric-owner");
    expect(builder).toContain("--no-recursion");
    expect(builder).toContain("gzip -n");
    expect(builder).not.toMatch(/tar\s+-czf\s+"\$\{ARCHIVE_PATH\}"/);
  });

  it("rejects a manifestless version prefix that already contains remote objects", () => {
    const publish = job(readRequired(workflowPath), "publish");
    const manifestMissing = publish.indexOf("if not api.file_exists");
    const prefixListing = publish.indexOf("api.list_repo_files", manifestMissing);
    const prefixGuard = publish.indexOf("if existing_version_files:", prefixListing);
    const prefixFailure = publish.indexOf(
      "Refusing to publish into an existing feature-bundle version without a manifest",
      prefixGuard,
    );
    const newVersionExit = publish.indexOf("raise SystemExit(0)", prefixFailure);

    expect(manifestMissing).toBeGreaterThanOrEqual(0);
    expect(prefixListing).toBeGreaterThan(manifestMissing);
    expect(publish).toContain('path.startswith(f"v{version}/")');
    expect(prefixGuard).toBeGreaterThan(prefixListing);
    expect(prefixFailure).toBeGreaterThan(prefixGuard);
    expect(newVersionExit).toBeGreaterThan(prefixFailure);
  });
});
