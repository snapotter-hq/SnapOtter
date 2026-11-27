// tests/unit/scripts/i18n/check-parity.test.ts
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDocsAdapter } from "../../../../scripts/i18n/adapters/docs-md.mjs";
import { adapter as landingSeo } from "../../../../scripts/i18n/adapters/landing-seo.mjs";
import { adapter as landingUi } from "../../../../scripts/i18n/adapters/landing-ui.mjs";
import { checkAdapter } from "../../../../scripts/i18n/check-parity.mjs";
import { hash } from "../../../../scripts/i18n/lib/hash.mjs";
import { localeCodes } from "../../../../scripts/i18n/lib/shared-i18n.mjs";
import { makeFakeAdapter } from "./fake-adapter";

// Seed a locale store on the fake adapter with a full, in-sync translation,
// so checkAdapter has something complete to validate against.
// biome-ignore lint/suspicious/noExplicitAny: fake in-memory adapter, untyped by design
async function seedComplete(adapter: any, locale: string) {
  const units = await adapter.extract();
  // biome-ignore lint/suspicious/noExplicitAny: stored entry shape mirrors core.mjs StoredEntry
  const entries = new Map<string, any>();
  for (const u of units) {
    const sourceHash = hash(u.sourceText);
    const text = `${locale}:${u.sourceText}`;
    entries.set(u.id, {
      text,
      sourceHash,
      provenance: "machine",
      outputHash: hash(text),
      stale: false,
    });
  }
  await adapter.write(locale, entries);
}

describe("checkAdapter", () => {
  it("passes when every locale has every unit with a matching source hash", async () => {
    const adapter = makeFakeAdapter([
      { id: "a", sourceText: "hi" },
      { id: "b", sourceText: "bye" },
    ]);
    await seedComplete(adapter, "de");
    await seedComplete(adapter, "fr");
    const report = await checkAdapter(adapter, ["de", "fr"]);
    expect(report.ok).toBe(true);
    expect(report.problems).toEqual([]);
  });

  it("fails and reports the unit when a locale is missing a translation", async () => {
    const adapter = makeFakeAdapter([
      { id: "a", sourceText: "hi" },
      { id: "b", sourceText: "bye" },
    ]);
    await seedComplete(adapter, "de");
    // Drop unit "b" from the German store to simulate an untranslated unit.
    // biome-ignore lint/suspicious/noExplicitAny: fake store is untyped by design
    const de = adapter._store.get("de") as Map<string, any>;
    de.delete("b");
    const report = await checkAdapter(adapter, ["de"]);
    expect(report.ok).toBe(false);
    const joined = report.problems.join(" ");
    expect(joined).toMatch(/de/);
    expect(joined).toMatch(/\bb\b/);
    expect(joined).toMatch(/missing/i);
  });

  it("fails when a stored source hash is stale (English moved under the translation)", async () => {
    const adapter = makeFakeAdapter([{ id: "a", sourceText: "hi" }]);
    await seedComplete(adapter, "de");
    // Corrupt the stored sourceHash so it no longer matches the English source.
    // biome-ignore lint/suspicious/noExplicitAny: fake store is untyped by design
    const de = adapter._store.get("de") as Map<string, any>;
    de.get("a").sourceHash = "deadbeefdead";
    const report = await checkAdapter(adapter, ["de"]);
    expect(report.ok).toBe(false);
    expect(report.problems.join(" ")).toMatch(/stale/i);
  });

  it("skips en and treats it as the source, never a target", async () => {
    const adapter = makeFakeAdapter([{ id: "a", sourceText: "hi" }]);
    await seedComplete(adapter, "de");
    // en is never seeded; it must be ignored even if passed in.
    const report = await checkAdapter(adapter, ["en", "de"]);
    expect(report.ok).toBe(true);
  });
});

describe("checkAdapter output-hash check", () => {
  // biome-ignore lint/suspicious/noExplicitAny: fake in-memory adapter, untyped by design
  async function editedAdapter(verifiesOutputHash: boolean, provenance = "machine"): Promise<any> {
    const adapter = { ...makeFakeAdapter([{ id: "a", sourceText: "hi" }]), verifiesOutputHash };
    await seedComplete(adapter, "de");
    // biome-ignore lint/suspicious/noExplicitAny: fake store is untyped by design
    const entry = (adapter._store.get("de") as Map<string, any>).get("a");
    entry.text = "hand edited";
    entry.provenance = provenance;
    return adapter;
  }

  it("flags a machine entry whose text was edited without restamping", async () => {
    const report = await checkAdapter(await editedAdapter(true), ["de"]);
    expect(report.ok).toBe(false);
    expect(report.problems.join(" ")).toMatch(/de.*"a".*without restamping/);
  });

  it("accepts an edited entry that is stamped human", async () => {
    const report = await checkAdapter(await editedAdapter(true, "human"), ["de"]);
    expect(report.ok).toBe(true);
  });

  it("ignores output hashes for an adapter that has not opted in", async () => {
    const report = await checkAdapter(await editedAdapter(false), ["de"]);
    expect(report.ok).toBe(true);
  });
});

describe.each([
  ["landing-ui", landingUi],
  ["landing-seo", landingSeo],
])("%s committed catalogs", (_name, adapter) => {
  it("opts into the output-hash check", () => {
    expect(adapter.verifiesOutputHash).toBe(true);
  });

  it("holds no machine entry whose text was edited without restamping", async () => {
    const edited: string[] = [];
    for (const locale of localeCodes().filter((c: string) => c !== "en")) {
      for (const [id, entry] of await adapter.load(locale)) {
        if (entry.provenance === "machine" && hash(entry.text) !== entry.outputHash) {
          edited.push(`${locale}/${id}`);
        }
      }
    }
    expect(edited).toEqual([]);
  });
});

describe("docs adapter output-hash check", () => {
  const SOURCE = "---\ntitle: Users\n---\n# Users {#users}\n\nBody.\n";
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  async function importedDocs() {
    const root = await mkdtemp(join(tmpdir(), "i5358-docs-"));
    dirs.push(root);
    await mkdir(join(root, "guide"), { recursive: true });
    await writeFile(join(root, "guide/users.md"), SOURCE, "utf8");
    const adapter = createDocsAdapter({ root });
    const [unit] = await adapter.extract();
    await adapter.write(
      "de",
      new Map([
        [
          unit.id,
          {
            text: "---\ntitle: Benutzer\n---\n# Benutzer {#users}\n\nText.\n",
            sourceHash: hash(unit.sourceText),
            provenance: "machine",
            outputHash: "",
            stale: false,
          },
        ],
      ]),
    );
    return { root, adapter, file: join(root, "de/guide/users.md") };
  }

  it("passes a freshly imported page", async () => {
    const { adapter } = await importedDocs();
    expect((await checkAdapter(adapter, ["de"])).ok).toBe(true);
  });

  it("flags a body edited by hand after the import", async () => {
    const { adapter, file } = await importedDocs();
    await writeFile(file, (await readFile(file, "utf8")).replace("Text.", "Neuer Text."), "utf8");
    const report = await checkAdapter(adapter, ["de"]);
    expect(report.ok).toBe(false);
    expect(report.problems.join(" ")).toContain("without restamping");
  });

  it("skips a legacy version 1 page, which load() trusts once", async () => {
    const { adapter, file } = await importedDocs();
    const edited = (await readFile(file, "utf8"))
      .replace("Text.", "Neuer Text.")
      .replace("i18n_hash_version: 2", "i18n_hash_version: 1");
    await writeFile(file, edited, "utf8");
    expect((await checkAdapter(adapter, ["de"])).ok).toBe(true);
  });
});

describe("check-parity CLI --surface", () => {
  const root = resolve(__dirname, "../../../..");
  const run = (...args: string[]) =>
    spawnSync(
      resolve(root, "apps/api/node_modules/.bin/tsx"),
      [resolve(root, "scripts/i18n/check-parity.mjs"), ...args],
      { encoding: "utf8", cwd: root },
    );

  it("exits 2 on an unknown surface so a typo can't turn the gate off", () => {
    const result = run("--surface=apii");
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Unknown --surface");
    expect(result.stdout).not.toContain("passed");
  });

  it("exits 2 when one name in a comma list is unknown", () => {
    expect(run("--surface=api,nope").status).toBe(2);
  });
});
