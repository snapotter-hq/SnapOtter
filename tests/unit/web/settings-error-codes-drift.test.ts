/**
 * The settings screens pick their error copy by the API's `code` (#1445).
 * A code renamed or dropped on the server would silently fall back to the
 * generic line, so every code the screens map must still be one the API
 * sends, and every setting the Security tab can name must be a real one.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const CLIENT_FILES = [
  "apps/web/src/lib/api.ts",
  "apps/web/src/components/settings/settings-dialog.tsx",
  "apps/web/src/components/settings/two-factor-settings.tsx",
];

function apiSource(dir = join(ROOT, "apps/api/src")): string {
  return readdirSync(dir, { withFileTypes: true })
    .map((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return apiSource(path);
      return entry.name.endsWith(".ts") ? readFileSync(path, "utf8") : "";
    })
    .join("\n");
}

/** Keys of the code-to-copy maps: `SOME_CODE: t.…` or `SOME_CODE: format(…`. */
function mappedCodes(source: string): string[] {
  return [...source.matchAll(/\b([A-Z][A-Z_]*[A-Z]):\s*(?:t\.|format\()/g)].map((m) => m[1]);
}

describe("settings error codes stay in step with the API (#1445)", () => {
  const api = apiSource();

  it.each(CLIENT_FILES)("every code %s maps is one the API sends", (file) => {
    const codes = mappedCodes(read(file));
    expect(codes.length).toBeGreaterThan(0);
    const unknown = codes.filter((code) => !api.includes(`"${code}"`));
    expect(unknown).toEqual([]);
  });

  it("every setting the Security tab can name is a real setting", () => {
    const dialog = read("apps/web/src/components/settings/settings-dialog.tsx");
    const start = dialog.indexOf("function securitySettingLabel(");
    const body = dialog.slice(start, dialog.indexOf("return labels[key];", start));
    const keys = [...body.matchAll(/^\s+(\w+): t\./gm)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(0);

    const policy = read("apps/api/src/lib/settings-policy.ts");
    const missing = keys.filter((key) => !new RegExp(`\\b${key}\\b`).test(policy));
    expect(missing).toEqual([]);
  });
});
