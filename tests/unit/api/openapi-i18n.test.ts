// tests/unit/api/openapi-i18n.test.ts
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  generateLocaleLlmsTxt,
  resolveSpecFile,
} from "../../../apps/api/src/routes/openapi-i18n.js";
import { makeApiSpecAdapter, proseFields } from "../../../scripts/i18n/adapters/api-spec.mjs";
import { hash } from "../../../scripts/i18n/lib/hash.mjs";

describe("resolveSpecFile", () => {
  let dir: string;
  const setup = () => {
    dir = mkdtempSync(join(tmpdir(), "openapi-i18n-"));
    writeFileSync(join(dir, "openapi.yaml"), "openapi: 3.1.0\n", "utf8");
    writeFileSync(join(dir, "openapi.de.yaml"), "openapi: 3.1.0\nx-i18n:\n  locale: de\n", "utf8");
    return dir;
  };

  it("returns the locale file when it exists and the code is supported", () => {
    const d = setup();
    expect(resolveSpecFile(d, "de")).toBe(join(d, "openapi.de.yaml"));
  });

  it("falls back to English for an unsupported code", () => {
    const d = setup();
    expect(resolveSpecFile(d, "zz")).toBe(join(d, "openapi.yaml"));
  });

  it("falls back to English when the supported locale spec is absent", () => {
    const d = setup();
    // fr is a supported locale but no openapi.fr.yaml was written.
    expect(resolveSpecFile(d, "fr")).toBe(join(d, "openapi.yaml"));
  });

  it("returns English for en and for an empty/undefined lang", () => {
    const d = setup();
    expect(resolveSpecFile(d, "en")).toBe(join(d, "openapi.yaml"));
    expect(resolveSpecFile(d, "")).toBe(join(d, "openapi.yaml"));
    expect(resolveSpecFile(d, undefined)).toBe(join(d, "openapi.yaml"));
  });
});

describe("generateLocaleLlmsTxt", () => {
  const spec = {
    info: { title: "SnapOtter API", version: "2.0.0" },
    tags: [{ name: "Tools", description: "Werkzeuge zur Dateiverarbeitung." }],
    paths: {
      "/api/v1/tools/image/resize": { post: { tags: ["Tools"], summary: "Groesse aendern" } },
    },
  };
  const sections = [{ id: "image", name: "Image" }];
  const toolsBySection = {
    image: [{ id: "resize", executionHint: "fast" as const }],
  };
  // Translated tool strings for de, as loadToolStrings(locale) returns them.
  const toolStrings = { resize: { name: "Groesse aendern", description: "Nach Pixeln." } };

  it("uses translated tool names and descriptions from shared i18n", () => {
    const out = generateLocaleLlmsTxt({ spec, sections, toolsBySection, toolStrings });
    expect(out).toContain("# SnapOtter API");
    expect(out).toContain("Werkzeuge zur Dateiverarbeitung.");
    expect(out).toContain("Groesse aendern - Nach Pixeln. (resize, sync)");
  });

  it("falls back to the tool id label when a translation is missing", () => {
    const out = generateLocaleLlmsTxt({
      spec,
      sections,
      toolsBySection,
      toolStrings: {}, // no translation available
    });
    // Still lists the tool by id with the sync mode, never crashes.
    expect(out).toContain("(resize, sync)");
  });

  it("lists content-aware-resize as async now that it runs on the queue (#4338)", () => {
    const out = generateLocaleLlmsTxt({
      spec,
      sections,
      toolsBySection: {
        image: [
          { id: "content-aware-resize", executionHint: "long" as const },
          { id: "passport-photo", executionHint: "long" as const },
        ],
      },
      toolStrings: {},
    });
    expect(out).toContain("(content-aware-resize, async)");
    expect(out).toContain("(passport-photo, two-phase)");
  });
});

describe("openapi.zh-TW.yaml auth, roles, and features descriptions (#3585, #3597)", () => {
  const specDir = resolve(import.meta.dirname, "../../../apps/api/src");
  const english = load(readFileSync(join(specDir, "openapi.yaml"), "utf8")) as {
    paths: Record<string, Record<string, { description?: string }>>;
  };
  const zhtw = load(readFileSync(join(specDir, "openapi.zh-TW.yaml"), "utf8")) as {
    paths: Record<string, Record<string, { description?: string }>>;
    "x-i18n": {
      entries: Record<string, { sourceHash: string; outputHash: string; stale?: boolean }>;
    };
  };

  const simplifiedOnlyChars = /[户码创权义给该将认无删备踪]/;

  const expectedDescriptions: Array<{
    path: string;
    method: string;
    expected: string;
  }> = [
    {
      path: "/api/auth/users/{id}/reset-password",
      method: "post",
      expected:
        "重設本機使用者的密碼。需要對目標目前角色的 users:manage 權限和權限，包括層次結構、權限、工具存取權限和任何 API-key 範圍。\n",
    },
    {
      path: "/api/v1/admin/features/{bundleId}/install",
      method: "post",
      expected:
        "開始非同步安裝 AI 功能套件。下載模型並設定 Python sidecar。回傳可透過 SSE 端點進行進度追蹤的 jobId。需要 features:manage 權限。\n\n對於 bundleId=ocr，支援在官方 Linux amd64 與 arm64 容器中安裝。系統會下載為此主機選擇的目標，驗證版本索引的 Ed25519 簽章與 artifact/模型摘要，對暫存的不可變世代執行冒煙測試，並以原子方式啟用它。即使容器具有 NVIDIA GPU 存取權限，OCR 執行階段仍會使用 CPU。高精準度執行階段需要至少 4 GiB 的有效記憶體（已設定的容器 cgroup 限制，否則為主機記憶體）。低於該已簽章相容性下限的系統會在下載前被拒絕，並回傳 compatibilityReason=insufficient-memory。快速 Tesseract OCR 不受此要求限制。\n\n安裝會在伺服器端依序執行：在另一個安裝正在執行時發出的請求會進入佇列（queued=true）而非被拒絕，並在執行中的安裝完成時自動啟動。對同一個執行中套件的重複請求會進行去重，並回傳相同的 jobId。",
    },
    {
      path: "/api/v1/roles",
      method: "post",
      expected:
        "建立具有指定權限的新自訂角色。角色名稱必須是\n2-30 字符，帶有連字符和下劃線的小寫字母數字。\n需要 security:manage 權限。新角色的權限與工具\n存取必須包含在行為者的有效權限內。\n",
    },
    {
      path: "/api/v1/roles/{id}",
      method: "delete",
      expected:
        '刪除自訂角色。指派給該角色的使用者將重新指派為\n預設的 "user" 角色。內建角色無法刪除。需要\nsecurity:manage 權限、對目前角色的權限，以及\n指派後備角色的權限。\n',
    },
  ];

  it.each(expectedDescriptions)(
    "uses Traditional Chinese and valid x-i18n hashes for $method $path",
    ({ path, method, expected }) => {
      const id = `paths.${path}.${method}.description`;
      const sourceText = english.paths[path]?.[method]?.description ?? "";
      const translatedText = zhtw.paths[path]?.[method]?.description ?? "";
      const stamp = zhtw["x-i18n"].entries[id];

      expect(sourceText).not.toBe("");
      expect(translatedText).not.toMatch(simplifiedOnlyChars);
      expect(translatedText).toBe(expected);
      expect(stamp).toBeDefined();
      expect(stamp.sourceHash).toBe(hash(sourceText));
      expect(stamp.outputHash).toBe(hash(translatedText));
      expect(stamp.stale).toBeUndefined();
    },
  );

  it("contains none of the leaked Simplified-only characters across any prose field in openapi.zh-TW.yaml", () => {
    const offending = proseFields(zhtw)
      .filter(([, text]) => simplifiedOnlyChars.test(text))
      .map(([id]) => id);
    expect(offending).toEqual([]);
  });
});

describe("openapi.sv.yaml Swedish diacritics (#2047)", () => {
  const specDir = resolve(import.meta.dirname, "../../../apps/api/src");
  const sv = load(readFileSync(join(specDir, "openapi.sv.yaml"), "utf8")) as {
    tags?: Array<{ name: string; description?: string }>;
    paths: Record<string, Record<string, { summary?: string; description?: string }>>;
    "x-i18n": {
      entries: Record<string, { sourceHash: string; outputHash: string; stale?: boolean }>;
    };
  };

  const foldedPattern =
    /\b(haalsokontroll|haalsokontroller|haamta|installningar|aateranvandbara|arbetsfloden|innehaall|storleksandring|behorigheter|spaarning|aatgarder|haalsodiagnostik)\b/i;

  it("preserves Swedish characters å, ä, and ö in key endpoints and tags", () => {
    expect(sv.paths["/api/v1/health"]?.get?.summary).toBe("Hälsokontroll");
    expect(sv.paths["/api/v1/tools/image/content-aware-resize"]?.post?.summary).toBe(
      "Innehållsmedveten storleksändring",
    );
    expect(sv.paths["/api/v1/settings"]?.get?.summary).toBe("Hämta alla inställningar");
    expect(sv.paths["/api/v1/pipeline/list"]?.get?.description).toContain(
      "Hämta alla sparade pipeline-definitioner för den aktuella användaren",
    );

    const systemTag = sv.tags?.find((t) => t.name === "System");
    expect(systemTag?.description).toBe("Hälsokontroller, konfiguration och jobbframsteg.");

    const pipelinesTag = sv.tags?.find((t) => t.name === "Pipelines");
    expect(pipelinesTag?.description).toBe(
      "Kedja ihop flera verktyg till återanvändbara arbetsflöden.",
    );
  });

  it("contains no ASCII-folded Swedish placeholder words in openapi.sv.yaml", () => {
    const offending = proseFields(sv)
      .filter(([, text]) => foldedPattern.test(text))
      .map(([id, text]) => ({ id, text }));
    expect(offending).toEqual([]);
  });
});

describe("OpenAPI intro positioning (#4916)", () => {
  const specDir = resolve(import.meta.dirname, "../../../apps/api/src");
  const specFiles = readdirSync(specDir).filter((f) => /^openapi(\.[A-Za-z-]+)?\.yaml$/.test(f));

  const intro = (file: string) =>
    (load(readFileSync(join(specDir, file), "utf8")) as { info: { description: string } }).info
      .description;

  it("describes the product as an open-source file toolkit in English", () => {
    const text = intro("openapi.yaml");
    expect(text).toContain("the open-source file toolkit with 200+ tools");
    expect(text).not.toMatch(/infrastructure/i);
  });

  it("keeps 200+ in all 21 specs and drops the retired infrastructure wording in English", () => {
    expect(specFiles).toHaveLength(21);
    for (const file of specFiles) expect(intro(file), file).toContain("200+");
  });

  it("no longer carries the translated 'file-processing infrastructure' phrase", () => {
    const retired = [
      "infraestructura autoalojada",
      "Infrastruktur zur Dateiverarbeitung",
      "infrastructure auto-hébergée",
      "инфраструктуры обработки файлов",
      "基盤です",
      "基础设施",
      "基礎架構",
      "인프라입니다",
    ];
    for (const file of specFiles) {
      const first = intro(file).split("\n")[0] ?? "";
      for (const phrase of retired) expect(first, `${file}: ${phrase}`).not.toContain(phrase);
    }
  });
});

describe("locale specs match what the i18n adapter writes (#5012)", () => {
  const specDir = resolve(import.meta.dirname, "../../../apps/api/src");
  const locales = readdirSync(specDir)
    .map((f) => f.match(/^openapi\.([A-Za-z-]+)\.yaml$/)?.[1])
    .filter((l): l is string => Boolean(l));
  const adapter = makeApiSpecAdapter({ dir: specDir });
  // A hand edit here shows up as unrelated churn in the next import's diff. To
  // regenerate, write `{}` to .i18n-batches/api.<locale>.done.json for each
  // locale and run `pnpm i18n:translate --import --surface=api`.
  const regenerate =
    "the adapter's next write would rewrite this file; regenerate it through the adapter";

  it("finds all 20 locale specs", () => {
    expect(locales).toHaveLength(20);
  });

  it.each(locales)("openapi.%s.yaml is byte-identical to the adapter's output", async (locale) => {
    const onDisk = readFileSync(join(specDir, `openapi.${locale}.yaml`), "utf8");
    const rendered = adapter.render(locale, await adapter.load(locale));
    expect(rendered === onDisk, regenerate).toBe(true);
  });

  it.each(locales)(
    "openapi.%s.yaml machine entries still match their outputHash",
    async (locale) => {
      const drifted = [...(await adapter.load(locale))]
        .filter(([, e]) => e.provenance === "machine" && hash(e.text) !== e.outputHash)
        .map(([id]) => id);
      // An import would flip each of these to provenance: human.
      expect(drifted).toEqual([]);
    },
  );
});
