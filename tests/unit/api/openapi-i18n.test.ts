// tests/unit/api/openapi-i18n.test.ts
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  generateLocaleLlmsTxt,
  resolveSpecFile,
} from "../../../apps/api/src/routes/openapi-i18n.js";
import { proseFields } from "../../../scripts/i18n/adapters/api-spec.mjs";
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
