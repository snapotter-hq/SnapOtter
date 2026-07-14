import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../../..");
const manifest = JSON.parse(readFileSync(join(root, "docker/feature-manifest.json"), "utf8"));
const models = JSON.parse(readFileSync(join(root, "docker/ocr-runtime-models.json"), "utf8"));
const buildScript = readFileSync(join(root, "docker/build-ocr-runtime.sh"), "utf8");
const verifierScript = readFileSync(join(root, "docker/verify-ocr-runtime.sh"), "utf8");
const legacyBuildScript = readFileSync(join(root, "docker/build-bundle.sh"), "utf8");
const dockerfile = readFileSync(join(root, "docker/Dockerfile"), "utf8");
const ciWorkflow = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
const deploymentGuide = readFileSync(join(root, "apps/docs/guide/deployment.md"), "utf8");
const pdfOcrGuide = readFileSync(join(root, "apps/docs/tools/pdf/ocr-pdf.md"), "utf8");
const openApi = readFileSync(join(root, "apps/api/src/openapi.yaml"), "utf8");
const featureRoutes = readFileSync(join(root, "apps/api/src/routes/features.ts"), "utf8");
const adapterSource = readFileSync(join(root, "packages/ai/python/ocr_runtime.py"), "utf8");
const tesseractSource = readFileSync(join(root, "packages/ai/src/tesseract.ts"), "utf8");

const TARGETS = ["linux-amd64-cpu-py312", "linux-arm64-cpu-py311"] as const;
const MEASURED_RUNTIME_SIZES = {
  "linux-amd64-cpu-py312": {
    compressed: 244_622_462,
    expanded: 510_762_511,
  },
  "linux-arm64-cpu-py311": {
    compressed: 218_031_562,
    expanded: 428_565_655,
  },
} as const;
const MODEL_IDS = [
  "pp-ocrv6-small-det",
  "pp-ocrv6-small-rec",
  "pp-ocrv6-medium-det",
  "pp-ocrv6-medium-rec",
  "korean-pp-ocrv5-mobile-rec",
  "pp-lcnet-x0-25-textline-ori",
  "pp-lcnet-x1-0-doc-ori",
  "pp-ocrv6-dictionary",
  "korean-pp-ocrv5-dictionary",
  "best-v1-calibration",
];
const LEGAL_ASSET_IDS = ["snapotter-agpl", "apache-2.0", "antlr-4.9.3-license"];

function requirementsFor(target: (typeof TARGETS)[number]): string {
  const suffix = target.includes("amd64") ? "amd64" : "arm64";
  return readFileSync(join(root, `docker/ocr-runtime-requirements-${suffix}.txt`), "utf8");
}

function requirementLines(contents: string): string[] {
  return contents
    .split("\n")
    .map((line) => line.replace(/\s+#.*$/, "").trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("--"));
}

describe("OCR v3 runtime artifact contract", () => {
  it("revalidates the post-install runtime against a genuine ephemeral Ed25519 signature", () => {
    expect(verifierScript).toContain('generateKeyPairSync("ed25519")');
    expect(verifierScript).toContain(
      "sign(null, Buffer.from(canonical(unsignedIndex)), privateKey)",
    );
    expect(verifierScript).toContain('algorithm: "ed25519"');
    expect(verifierScript).toContain('OCR_RUNTIME_INDEX_KEY_ID="ci-runtime-verifier"');
    expect(verifierScript).toContain("OCR_RUNTIME_INDEX_PUBLIC_KEY_PEM_B64");
    expect(verifierScript).not.toContain("verified-inside-trusted-ci-boundary");
  });

  it("enables Node's environment proxy support and documents private-network trust", () => {
    expect(dockerfile).toMatch(/\bNODE_USE_ENV_PROXY=1\b/);
    for (const variable of ["HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "NODE_EXTRA_CA_CERTS"]) {
      expect(deploymentGuide).toContain(`\`${variable}\``);
    }
    expect(deploymentGuide).toContain("/etc/snapotter/custom-ca.pem");
  });

  it("documents legacy engine precedence consistently for image and PDF OCR", () => {
    expect(pdfOcrGuide).toContain("| engine | string | No | - |");
    expect(pdfOcrGuide).toContain(
      "If `quality` and the deprecated `engine` field are both omitted",
    );
    expect(openApi.match(/When both quality and engine are omitted/g)).toHaveLength(2);
  });

  it("uses the short-write-safe primitive for offline multipart uploads", () => {
    expect(featureRoutes).toContain("writeBufferFully,");
    expect(featureRoutes).toContain("await writeBufferFully(file, chunk);");
    expect(featureRoutes).not.toContain("await file.write(chunk);");
  });

  it("declares only portable CPU targets with representative measured estimates", () => {
    expect(dockerfile).toContain("ARG SNAPOTTER_OFFICIAL_CONTAINER=0");
    expect(dockerfile).toContain(
      "SNAPOTTER_OFFICIAL_CONTAINER=$" + "{SNAPOTTER_OFFICIAL_CONTAINER}",
    );
    expect(dockerfile).not.toContain("SNAPOTTER_OFFICIAL_CONTAINER=1");
    const ocr = manifest.bundles.ocr;
    expect(ocr.runtimeFormatVersion).toBe(3);
    expect(ocr.runtimeFamily).toBe("ocr");
    expect(ocr.archives).toBeUndefined();
    expect(Object.keys(ocr.targets).sort()).toEqual([...TARGETS].sort());

    for (const target of TARGETS) {
      const entry = ocr.targets[target];
      expect(entry.file).toBe(`v3/ocr-${target}.tar.gz`);
      expect(entry.compressedSizeEstimate).toBe(MEASURED_RUNTIME_SIZES[target].compressed);
      expect(entry.extractedSizeEstimate).toBe(MEASURED_RUNTIME_SIZES[target].expanded);
      expect(entry.sizeKind).toBe("measured-estimate");
      expect(entry.minimumMemoryBytes).toBe(4 * 1024 ** 3);
      expect(entry.requirements).toMatch(/^docker\/ocr-runtime-requirements-(amd64|arm64)\.txt$/);
    }
    expect(buildScript).toContain('"minimumMemoryBytes": 4 * 1024 * 1024 * 1024');
  });

  it("removes unused Tesseract OSD data and restricts Fast to non-OSD layouts", () => {
    const osdPath = "/usr/share/tesseract-ocr/5/tessdata/osd.traineddata";
    expect(dockerfile).toContain(`rm -f ${osdPath}`);
    expect(dockerfile).toContain(`test ! -e ${osdPath}`);
    expect(tesseractSource.match(/pageSegmentationMode\?: ([^;]+);/)?.[1]).toBe("6 | 11");
    for (const mode of [0, 1, 12]) {
      expect(tesseractSource).not.toMatch(new RegExp(`pageSegmentationMode:\\s*${mode}(?!\\d)`));
    }
  });

  it("keeps integration CI aligned with the exact Fast OCR base payload", () => {
    const integrationJob = ciWorkflow.match(
      /^ {2}test-integration:\n[\s\S]*?(?=^ {2}test-e2e-smoke:)/m,
    )?.[0];
    expect(integrationJob).toBeDefined();
    const systemDependencyRunBlock = integrationJob?.match(
      /^ {6}- name: Install system dependencies[^\n]*\n {8}run: \|\n(?<run>[\s\S]*?)(?=^ {6}- )/m,
    )?.groups?.run;
    expect(systemDependencyRunBlock).toBeDefined();

    const expectedPackages = [
      "tesseract-ocr",
      "tesseract-ocr-eng",
      "tesseract-ocr-deu",
      "tesseract-ocr-fra",
      "tesseract-ocr-spa",
      "tesseract-ocr-chi-sim",
      "tesseract-ocr-jpn",
    ];
    const systemDependencyLines = systemDependencyRunBlock?.split("\n") ?? [];
    const installStart = systemDependencyLines.findIndex((line) =>
      line.includes("sudo apt-get install -y --no-install-recommends"),
    );
    expect(installStart).toBeGreaterThanOrEqual(0);
    const installCommand: string[] = [];
    for (let index = installStart; index < systemDependencyLines.length; index++) {
      const line = systemDependencyLines[index];
      installCommand.push(line);
      if (!line.trimEnd().endsWith("\\")) break;
    }
    const installedPackages =
      installCommand.join("\n").match(/\btesseract-ocr(?:-[a-z0-9-]+)?\b/g) ?? [];
    expect([...new Set(installedPackages)].sort()).toEqual([...expectedPackages].sort());

    const osdPath = "/usr/share/tesseract-ocr/5/tessdata/osd.traineddata";
    const orderedCommands: Array<[string, (line: string) => boolean]> = [
      ["OSD removal", (line) => line.trim() === `sudo rm -f ${osdPath}`],
      ["OSD absence assertion", (line) => line.trim() === `test ! -e ${osdPath}`],
      ["expected inventory", (line) => line.trim() === "expected=(chi_sim deu eng fra jpn spa)"],
      [
        "sorted Tesseract inventory",
        (line) =>
          line.trim() ===
          "mapfile -t actual < <(tesseract --list-langs 2>/dev/null | tail -n +2 | LC_ALL=C sort)",
      ],
      [
        "exact inventory assertion",
        (line) =>
          /\[\[ "\$\{actual\[\*\]\}" == "\$\{expected\[\*\]\}" \]\] \|\| \{/.test(line.trim()),
      ],
    ];
    let previousCommand = installStart + installCommand.length - 1;
    for (const [label, matches] of orderedCommands) {
      const command = systemDependencyLines.findIndex(matches);
      expect(command, `${label} must follow the integration apt install command`).toBeGreaterThan(
        previousCommand,
      );
      previousCommand = command;
    }
  });

  it("validates Redis without executing a target-architecture binary during cross-builds", () => {
    expect(dockerfile).toContain("dpkg-query -W -f='${Version}\\n' redis-server");
    expect(dockerfile).not.toContain("redis-server --version");
  });

  it("keeps Korean traineddata out of the official Fast OCR base image", () => {
    expect(dockerfile).not.toContain("tesseract-ocr-script-hang");
    expect(dockerfile).not.toContain("tesseract-ocr-kor");
    expect(dockerfile).not.toContain("Hangul.traineddata");
    expect(dockerfile).not.toContain("kor.traineddata");
    expect(dockerfile).not.toMatch(/tessdata[-_]best.*(?:Hangul|kor)/i);
  });

  it("pins the complete CPU runtime and rejects Paddle, CUDA, and ranges", () => {
    for (const target of TARGETS) {
      const contents = requirementsFor(target);
      const lines = requirementLines(contents);

      expect(contents).not.toMatch(/paddle|cuda|onnxruntime-gpu/i);
      expect(lines.some((line) => /^rapidocr==3\.9\.1\b/.test(line))).toBe(true);
      expect(lines.some((line) => /^onnxruntime==1\.20\.1\b/.test(line))).toBe(true);
      expect(lines.some((line) => /^pillow==12\.3\.0\b/.test(line))).toBe(true);
      expect(lines.some((line) => /^protobuf==5\.29\.6\b/.test(line))).toBe(true);
      expect(lines.some((line) => /^urllib3==2\.7\.0\b/.test(line))).toBe(true);
      for (const line of lines) {
        expect(line, `unlocked requirement in ${target}`).toMatch(
          /^[A-Za-z0-9_.-]+==[^\s]+\s+--hash=sha256:[a-f0-9]{64}$/,
        );
      }
    }

    const amd64 = requirementsFor("linux-amd64-cpu-py312");
    const arm64 = requirementsFor("linux-arm64-cpu-py311");
    expect(amd64).toContain("bb71a814f66517a65628c9e4a2bb530a6edd2cd5d87ffa0af0f6f773a027d99e");
    expect(arm64).toContain("f6243e34d74423bdd1edf0ae9596dd61023b260f546ee17d701723915f06a9f7");
    expect(amd64).toContain("78cb2c6865a35ab8ff8b75fd122f6033b92a62c82801110e48ddd6c936a45d91");
    expect(arm64).toContain("bcb46e2f9feff8d06323983bd83ed00c201fdcab3d74973e7072a889b3979fcd");
    expect(amd64).not.toContain("f6243e34d74423bdd1edf0ae9596dd61023b260f546ee17d701723915f06a9f7");
    expect(arm64).not.toContain("bb71a814f66517a65628c9e4a2bb530a6edd2cd5d87ffa0af0f6f773a027d99e");
  });

  it("binds every official model object to an immutable revision and literal metadata", () => {
    expect(models.schemaVersion).toBe(1);
    expect(models.family).toBe("ocr");
    const allObjects = [...models.models, ...models.localAssets];
    expect(allObjects.map((model: { id: string }) => model.id).sort()).toEqual(
      [...MODEL_IDS].sort(),
    );

    for (const model of models.models) {
      expect(model.repository).toMatch(/^(PaddlePaddle|RapidAI)\//);
      expect(model.revision).toMatch(/^[a-f0-9]{40}$/);
      const expectedUrl = model.repository.startsWith("PaddlePaddle/")
        ? `https://huggingface.co/${model.repository}/resolve/${model.revision}/${model.file}`
        : `https://www.modelscope.cn/models/${model.repository}/resolve/${model.revision}/${model.file}`;
      expect(model.url).toBe(expectedUrl);
      expect(model.url).not.toMatch(/\/(main|master|latest)\//i);
      expect(model.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(model.size).toBeGreaterThan(0);
      expect(model.license).toBe("Apache-2.0");
      expect(model.path).toMatch(/^models\/[A-Za-z0-9._/-]+$/);
      expect(adapterSource, `${model.path} is not consumed by the adapter`).toContain(
        model.path.replace(/^models\//, ""),
      );
    }

    for (const asset of models.localAssets) {
      const source = join(root, asset.source);
      const contents = readFileSync(source);
      expect(asset.url).toBeUndefined();
      expect(asset.path).toBe("models/best-v1-calibration.json");
      expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(asset.sha256).toBe(createHash("sha256").update(contents).digest("hex"));
      expect(asset.size).toBe(contents.byteLength);
      expect(adapterSource).toContain(asset.path.replace(/^models\//, ""));
    }
  });

  it("ships hash-bound license texts and a complete machine-readable attribution inventory", () => {
    expect(models.legalAssets.map((asset: { id: string }) => asset.id).sort()).toEqual(
      [...LEGAL_ASSET_IDS].sort(),
    );

    for (const asset of models.legalAssets) {
      expect(asset.path).toMatch(/^(LICENSES|THIRD_PARTY_LICENSES)\/[A-Za-z0-9._/-]+$/);
      expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(asset.size).toBeGreaterThan(0);
      expect(asset.license).toMatch(/^(AGPL-3\.0|Apache-2\.0|BSD-3-Clause)$/);
      if (asset.source) {
        const source = join(root, asset.source);
        const contents = readFileSync(source);
        expect(asset.sha256).toBe(createHash("sha256").update(contents).digest("hex"));
        expect(asset.size).toBe(contents.byteLength);
      } else {
        expect(asset.url).toMatch(/^https:\/\//);
      }
    }

    expect(buildScript).toContain('manifest.get("legalAssets", [])');
    expect(buildScript).toContain('runtime_root / "THIRD_PARTY_NOTICES.json"');
    expect(buildScript).toContain('site_packages.glob("*.dist-info")');
    expect(buildScript).toContain("package has no included license material");
    expect(buildScript).toContain('"legalMaterials": sorted(legal_objects');
    expect(buildScript).toContain('"sourceUrl"');
    expect(buildScript).toContain('"licenseFiles"');
  });

  it("builds a native complete venv and emits installer-compatible exact metadata", () => {
    expect(buildScript).toContain("uname -m");
    expect(buildScript).toContain("-m venv --copies");
    expect(buildScript).toContain("--require-hashes");
    expect(buildScript).toContain("--no-deps");
    expect(buildScript).toContain("ocr_runtime.py");
    expect(buildScript).toContain("ocr_runner.py");
    expect(buildScript).toContain('"files"');
    expect(buildScript).toContain('"expandedSize"');
    expect(buildScript).toContain('"pythonPath"');
    expect(buildScript).toContain('"entrypoint"');
    expect(buildScript).toContain('"adapterPath"');
    expect(buildScript).toContain('"models"');
    expect(buildScript).toContain('"modelObjects": sorted(model_objects');
    expect(buildScript).toContain('"provenance"');
    expect(buildScript).toContain('"sourceImageDigest"');
    expect(buildScript).toContain('"sourceCommit"');
    expect(buildScript).toContain('"builderId"');
    expect(buildScript).toContain('"CPUExecutionProvider"');
    expect(buildScript).toContain("ocr_runtime_entrypoint.py");
    expect(buildScript).toContain('"$' + '{RUNTIME_ROOT}/ocr_runner.py" --smoke');
    expect(buildScript).toContain("--sort=name");
    expect(buildScript).toContain("gzip -n");
    expect(buildScript).toContain('site_packages.glob("*.dist-info/RECORD")');
    expect(buildScript).toContain("wheel RECORD path escapes the runtime");
    expect(buildScript).toContain('csv.writer(output, lineterminator="\\n")');
    expect(buildScript.indexOf("except FileNotFoundError:")).toBeLessThan(
      buildScript.indexOf("duplicate retained wheel RECORD path"),
    );
    expect(buildScript).not.toMatch(/site-packages.*delta|paddle|onnxruntime-gpu|libcuda/i);
  });

  it("stops model downloads at the signed object size instead of reading to EOF", () => {
    expect(buildScript).toContain('expected_size = object_size(obj.get("size"), label)');
    expect(buildScript).toContain("remaining = expected_size + 1");
    expect(buildScript).toContain("response.read(min(1024 * 1024, remaining))");
    expect(buildScript).not.toContain("shutil.copyfileobj(response, output");
  });

  it("delegates OCR before the legacy shared-site-package bundle builder", () => {
    const delegate = legacyBuildScript.indexOf('if [[ "$' + '{BUNDLE_ID}" == "ocr" ]]');
    const legacyDelta = legacyBuildScript.indexOf("Recording base site-packages");
    expect(delegate).toBeGreaterThanOrEqual(0);
    expect(delegate).toBeLessThan(legacyDelta);
    expect(legacyBuildScript).toContain("build-ocr-runtime.sh");
  });

  it("ships every declared build input", () => {
    // The native artifact is assembled inside the final app image, so every
    // repository-local legal input must be present there rather than merely in
    // the outer GitHub Actions checkout.
    expect(dockerfile).toContain("COPY LICENSE ./LICENSE");
    for (const path of [
      "docker/build-ocr-runtime.sh",
      "docker/ocr-runtime-models.json",
      "docker/ocr-runtime-requirements-amd64.txt",
      "docker/ocr-runtime-requirements-arm64.txt",
      "docker/ocr-best-v1-calibration.json",
      "LICENSE",
      "packages/ai/python/ocr_runtime.py",
      "packages/ai/python/ocr_runtime_entrypoint.py",
    ]) {
      expect(existsSync(join(root, path)), `${path} is missing`).toBe(true);
    }
  });
});
