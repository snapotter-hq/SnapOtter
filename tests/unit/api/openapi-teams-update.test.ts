/**
 * PUT /api/v1/teams/:id takes a partial update, { name?, storageQuota?,
 * retentionHours? } with at least one present and no other keys (#1906, #2005).
 * The spec is what a client generates its request from, so it has to say so in
 * the English copy and in every translated copy (#2011).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { load } from "js-yaml";
import { beforeAll, describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "../../../packages/shared/src/i18n/index.js";
import { createDocsAdapter } from "../../../scripts/i18n/adapters/docs-md.mjs";
import { hash } from "../../../scripts/i18n/lib/hash.mjs";

const SPEC_DIR = path.resolve(import.meta.dirname, "../../../apps/api/src");
const DOCS_DIR = path.resolve(import.meta.dirname, "../../../apps/docs");
const SUMMARY_ID = "paths./api/v1/teams/{id}.put.summary";
const LOCALES = SUPPORTED_LOCALES.map((l) => l.code).filter((code) => code !== "en");

const STALE_RENAME_DESCRIPTIONS: Record<string, string> = {
  ar: "إعادة تسمية فريق",
  de: "Team umbenennen",
  es: "Renombrar equipo",
  fr: "Renomme une équipe",
  hi: "टीम का नाम बदलें",
  id: "Ganti nama tim",
  it: "Rinomina un team",
  ja: "チームを名前変更",
  ko: "팀 이름 변경",
  nl: "Team hernoemen",
  pl: "Zmień nazwę zespołu",
  "pt-BR": "Renomeia um time",
  ru: "Переименование команды",
  sv: "Byt namn på team",
  th: "เปลี่ยนชื่อทีม",
  tr: "Ekibi yeniden adlandır",
  uk: "Перейменувати команду",
  vi: "Đổi tên nhóm",
  "zh-CN": "重命名团队",
  "zh-TW": "重新命名團隊",
};

const EXPECTED_REST_DOC_DESCRIPTIONS: Record<string, string> = {
  ar: "تحديث فريق (يلزم حقل واحد على الأقل)",
  de: "Team aktualisieren (mindestens ein Feld erforderlich)",
  es: "Actualizar equipo (se requiere al menos un campo)",
  fr: "Met à jour une équipe (au moins un champ requis)",
  hi: "टीम अपडेट करें (कम से कम एक फ़ील्ड आवश्यक है)",
  id: "Perbarui tim (setidaknya satu field diperlukan)",
  it: "Aggiorna un team (è richiesto almeno un campo)",
  ja: "チームを更新（少なくとも 1 つのフィールドが必要）",
  ko: "팀 업데이트(최소 하나의 필드 필요)",
  nl: "Team bijwerken (minstens één veld vereist)",
  pl: "Zaktualizuj zespół (wymagane co najmniej jedno pole)",
  "pt-BR": "Atualiza um time (pelo menos um campo obrigatório)",
  ru: "Обновление команды (требуется хотя бы одно поле)",
  sv: "Uppdatera team (minst ett fält krävs)",
  th: "อัปเดตทีม (ต้องระบุอย่างน้อยหนึ่งฟิลด์)",
  tr: "Ekibi güncelle (en az bir alan zorunlu)",
  uk: "Оновити команду (потрібне щонайменше одне поле)",
  vi: "Cập nhật nhóm (bắt buộc ít nhất một trường)",
  "zh-CN": "更新团队（至少需要一个字段）",
  "zh-TW": "更新團隊（至少需要一個欄位）",
};

interface Operation {
  summary?: string;
  requestBody?: {
    required?: boolean;
    content?: { "application/json"?: { schema?: Record<string, unknown> } };
  };
  responses?: Record<string, unknown>;
}

function putTeam(file: string): Operation {
  const spec = load(readFileSync(path.join(SPEC_DIR, file), "utf8")) as {
    paths: Record<string, { put?: Operation }>;
  };
  const op = spec.paths["/api/v1/teams/{id}"]?.put;
  if (!op) throw new Error(`${file} has no PUT /api/v1/teams/{id}`);
  return op;
}

function postTeam(file: string): Operation {
  const spec = load(readFileSync(path.join(SPEC_DIR, file), "utf8")) as {
    paths: Record<string, { post?: Operation }>;
  };
  const op = spec.paths["/api/v1/teams"]?.post;
  if (!op) throw new Error(`${file} has no POST /api/v1/teams`);
  return op;
}

const english = putTeam("openapi.yaml");
const bodySchema = english.requestBody?.content?.["application/json"]?.schema ?? {};
const englishPost = postTeam("openapi.yaml");
const postBodySchema = englishPost.requestBody?.content?.["application/json"]?.schema ?? {};

describe("POST /api/v1/teams in the API reference (#2767)", () => {
  it("rejects unknown keys in the request body", () => {
    expect(postBodySchema.additionalProperties).toBe(false);
  });
});

describe("PUT /api/v1/teams/{id} in the API reference (#2011)", () => {
  it("no longer calls the operation a rename", () => {
    expect(english.summary).not.toMatch(/rename/i);
  });

  it("does not make name mandatory", () => {
    expect(bodySchema).not.toHaveProperty("required");
  });

  it("declares the three fields the route accepts, the quotas as nullable integers", () => {
    const properties = bodySchema.properties as Record<string, unknown>;
    expect(Object.keys(properties).sort()).toEqual(["name", "retentionHours", "storageQuota"]);
    expect(properties.name).toEqual({ type: "string" });
    expect(properties.storageQuota).toMatchObject({
      type: ["integer", "null"],
      minimum: 1,
      maximum: Number.MAX_SAFE_INTEGER,
    });
    expect(properties.retentionHours).toMatchObject({
      type: ["integer", "null"],
      minimum: 1,
      maximum: 2_147_483_647,
    });
  });

  // storageQuota is bytes (compared against summed storageUsed), not the MB the
  // env var and settings UI use, and null means "no limit" or "instance
  // default", so a client has to be told which (#2011 review).
  it("says what unit the quotas use and what null does", () => {
    const properties = bodySchema.properties as Record<string, { description?: string }>;
    expect(properties.storageQuota.description).toMatch(/bytes/);
    expect(properties.storageQuota.description).toMatch(/null removes/);
    expect(properties.retentionHours.description).toMatch(/hours/i);
    expect(properties.retentionHours.description).toMatch(/FILE_MAX_AGE_HOURS/);
  });

  it("requires at least one field and rejects unknown keys", () => {
    expect(bodySchema.minProperties).toBe(1);
    expect(bodySchema.additionalProperties).toBe(false);
  });

  it("documents the 400 the route returns for a bad or empty body", () => {
    expect(english.responses?.["400"]).toMatchObject({
      content: {
        "application/json": { schema: { $ref: "#/components/schemas/Error" } },
      },
    });
  });

  // The structure in every locale copy is held equal to English by
  // openapi-upload-responses.test.ts. The summary is the prose that changed: a
  // translation left over from "Rename a team" would still say rename in the
  // locale's own words, and only the pipeline's stamp can tell. The sourceHash
  // says it was translated from the current English; the outputHash says the
  // text next to it is the text that was stamped, so editing the stamp without
  // the summary (or the reverse) fails.
  it.each(LOCALES)("%s summary was translated from the current English summary", (locale) => {
    const spec = load(readFileSync(path.join(SPEC_DIR, `openapi.${locale}.yaml`), "utf8")) as {
      "x-i18n": {
        entries: Record<string, { sourceHash: string; outputHash: string; stale?: boolean }>;
      };
    };
    const stamp = spec["x-i18n"].entries[SUMMARY_ID];
    expect(stamp.sourceHash).toBe(hash(english.summary ?? ""));
    expect(stamp.outputHash).toBe(hash(putTeam(`openapi.${locale}.yaml`).summary ?? ""));
    expect(stamp.stale).toBeUndefined();
  });
});

function putTeamDocDescription(relPath: string): string {
  const doc = readFileSync(path.join(DOCS_DIR, relPath), "utf8");
  const rows = doc.split("\n").filter((line) => line.startsWith("| `PUT` | `/api/v1/teams/:id` |"));
  if (rows.length !== 1) {
    throw new Error(`${relPath} expected 1 PUT /api/v1/teams/:id row, found ${rows.length}`);
  }
  const cells = rows[0].split("|");
  if (cells.length < 6) {
    throw new Error(`${relPath} has malformed PUT /api/v1/teams/:id row: ${rows[0]}`);
  }
  return cells[4].trim();
}

describe("PUT /api/v1/teams/:id in the REST guide (#2006, #3338)", () => {
  const docsAdapter = createDocsAdapter({ root: DOCS_DIR });
  let expectedRestDocSourceHash = "";

  beforeAll(async () => {
    const extracted = await docsAdapter.extract();
    const sourceUnit = extracted.find((u: { id: string }) => u.id === "api/rest.md");
    expect(sourceUnit).toBeDefined();
    expectedRestDocSourceHash = hash(sourceUnit?.sourceText ?? "");
  });

  it("documents the English route as a partial update requiring at least one field", () => {
    expect(putTeamDocDescription("api/rest.md")).toBe("Update team (at least one field required)");
  });

  it.each(LOCALES)(
    "%s rest.md describes PUT /api/v1/teams/:id as an update with a required-field note and fresh i18n hashes",
    async (locale) => {
      const staleRename = STALE_RENAME_DESCRIPTIONS[locale];
      expect(staleRename).toBeTruthy();
      const description = putTeamDocDescription(`${locale}/api/rest.md`);
      expect(description).not.toBe(staleRename);
      expect(description).not.toContain(staleRename);
      expect(description).not.toBe(putTeamDocDescription("api/rest.md"));
      expect(description).toBe(EXPECTED_REST_DOC_DESCRIPTIONS[locale]);
      expect(description).toMatch(/^[^\s（(].*[（(].+[）)]$/);

      const loaded = await docsAdapter.load(locale);
      const entry = loaded.get("api/rest.md");
      expect(entry).toBeDefined();
      expect(entry?.provenance).toBe("human");
      expect(entry?.sourceHash).toBe(expectedRestDocSourceHash);
      expect(entry?.outputHash).toBe(hash(entry?.text ?? ""));
      expect(entry?.stale).toBe(false);

      const rawDoc = readFileSync(path.join(DOCS_DIR, locale, "api/rest.md"), "utf8");
      expect(rawDoc.match(/^i18n_output_hash:\s*(\S+)$/m)?.[1]).toBe(hash(entry?.text ?? ""));
      expect(rawDoc).not.toMatch(/^i18n_(stale|fallback):/m);
    },
  );
});
