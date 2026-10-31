import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanToolUiLiterals } from "../../helpers/tool-ui-literals.js";

/**
 * Unit tests for the literal scanner behind the drift guard (#906, #909).
 * Each case writes a throwaway .tsx file and asserts on what the scan reports,
 * so the guard's blind spots are pinned down rather than discovered by luck.
 */

const tmpDirs: string[] = [];

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "literal-scan-"));
  tmpDirs.push(dir);
  for (const [name, code] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), code, "utf8");
  }
  return dir;
}

afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop() as string, { recursive: true, force: true });
});

const texts = (dir: string | string[]) => scanToolUiLiterals(dir).map((h) => h.text);
const kinds = (dir: string) => scanToolUiLiterals(dir).map((h) => [h.kind, h.text]);

describe("scanToolUiLiterals", () => {
  it("reports JSX text, user-facing attributes and rendered expressions", () => {
    const dir = fixture({
      "a.tsx": `export const A = ({ busy }: { busy: boolean }) => (
        <div title="Open settings">
          Saved changes
          <input placeholder="Your name" />
          <span>{busy ? "Uploading now" : "Idle now"}</span>
        </div>
      );`,
    });
    expect(texts(dir).sort()).toEqual(
      ["Idle now", "Open settings", "Saved changes", "Uploading now", "Your name"].sort(),
    );
  });

  it("ignores literals that never reach the screen", () => {
    const dir = fixture({
      "a.tsx": `export const A = ({ mode }: { mode: string }) => (
        <div className="flex items-center" data-testid="wrapper">
          {mode === "compare" && <img src="/logo.png" />}
        </div>
      );`,
    });
    expect(texts(dir)).toEqual([]);
  });

  it("reports a literal assigned to a local before it is rendered as a child", () => {
    const dir = fixture({
      "a.tsx": `export const A = ({ busy }: { busy: boolean }) => {
        const label = busy ? "Uploading images" : "Processing images";
        return <span>{label}</span>;
      };`,
    });
    expect(texts(dir).sort()).toEqual(["Processing images", "Uploading images"]);
  });

  it("reports a literal assigned to a local before it reaches a user-facing attribute", () => {
    const dir = fixture({
      "a.tsx": `export const A = ({ open }: { open: boolean }) => {
        const hint = open ? "Collapse panel" : "Expand panel";
        return <button title={hint} />;
      };`,
    });
    expect(texts(dir).sort()).toEqual(["Collapse panel", "Expand panel"]);
  });

  it("reports a local built from a template literal", () => {
    const dir = fixture({
      "a.tsx": `export const A = ({ n }: { n: number }) => {
        const summary = \`Removed \${n} pages from the document\`;
        return <p>{summary}</p>;
      };`,
    });
    expect(texts(dir).sort()).toEqual(["Removed", "pages from the document"]);
  });

  it("does not report literals in a local's non-rendered subexpressions", () => {
    const dir = fixture({
      "a.tsx": `export const A = ({ items }: { items: string[] }) => {
        const count = items.filter((i) => i.endsWith(".png")).length;
        return <span>{count}</span>;
      };`,
    });
    expect(texts(dir)).toEqual([]);
  });

  it("does not report a local whose literals never render", () => {
    const dir = fixture({
      "a.tsx": `export const A = ({ busy }: { busy: boolean }) => {
        const cls = busy ? "opacity-50 cursor-wait" : "opacity-100";
        return <span className={cls}>{"12"}</span>;
      };`,
    });
    expect(texts(dir)).toEqual([]);
  });

  it("resolves a rendered identifier to the nearest declaration, not a same-named outer one", () => {
    const dir = fixture({
      "a.tsx": `const label = "Outer only, never rendered";
      export const A = ({ t }: { t: { go: string } }) => {
        const label = t.go;
        return <span>{label}</span>;
      };`,
    });
    expect(texts(dir)).toEqual([]);
  });

  it("does not mistake a prop for a same-named outer const", () => {
    const dir = fixture({
      "a.tsx": `const label = "Outer const, never rendered";
      export function A({ label }: { label: string }) {
        return <p>{label}</p>;
      }`,
    });
    expect(texts(dir)).toEqual([]);
  });

  it("does not mistake a destructured prop for a same-named outer const", () => {
    const dir = fixture({
      "a.tsx": `const title = "Outer const, never rendered";
      export function A({ title, size }: { title: string; size: number }) {
        return <button title={title}>{size}</button>;
      }`,
    });
    expect(texts(dir)).toEqual([]);
  });

  it("reports literals composed through format() in a rendered position", () => {
    const dir = fixture({
      "a.tsx": `import { format } from "@/lib/format";
      export const A = ({ n }: { n: number }) => (
        <div>
          <span>{format("Removed {count} pages", { count: n })}</span>
          <button title={format("Delete {count} items", { count: n })} />
        </div>
      );`,
    });
    expect(texts(dir).sort()).toEqual(["Delete {count} items", "Removed {count} pages"]);
  });

  it("reports both branches of a rendered plural()", () => {
    const dir = fixture({
      "a.tsx": `import { plural } from "@/lib/format";
      export const A = ({ n }: { n: number }) => (
        <span>{plural(n, "One file selected", "Many files selected")}</span>
      );`,
    });
    expect(texts(dir).sort()).toEqual(["Many files selected", "One file selected"]);
  });

  it("reports a module-scope local rendered inside a component", () => {
    const dir = fixture({
      "a.tsx": `const emptyMessage = "No files selected yet";
      export const A = () => <p>{emptyMessage}</p>;`,
    });
    expect(texts(dir)).toEqual(["No files selected yet"]);
  });

  it("reports each local literal once even when the local renders twice", () => {
    const dir = fixture({
      "a.tsx": `export const A = () => {
        const label = "Retry the upload";
        return (
          <div>
            <span>{label}</span>
            <button title={label} />
          </div>
        );
      };`,
    });
    expect(texts(dir)).toEqual(["Retry the upload"]);
  });

  it("reports labels held in a data structure and read back through a property (#922)", () => {
    const dir = fixture({
      "a.tsx": `const SAMPLE_SIZES = [
        { label: "Point (1x1)", value: 1 },
        { label: "3x3 Average", value: 3 },
      ];
      export const A = ({ size }: { size: number }) => (
        <span>{SAMPLE_SIZES.find((s) => s.value === size)?.label}</span>
      );`,
    });
    expect(kinds(dir)).toEqual([
      ["PROP", "Point (1x1)"],
      ["PROP", "3x3 Average"],
    ]);
  });

  it("reports every user-facing property name, whether or not this file renders it (#922)", () => {
    const dir = fixture({
      "a.tsx": `export const OPTIONS = [
        { title: "Blend mode", description: "How layers mix", desc: "Short blurb" },
        { name: "Fast preset", hint: "Lower quality", tooltip: "Hover text" },
        { placeholder: "Search layers", text: "Body copy", message: "Saved it" },
        { label: \`Tile size\` },
      ];`,
    });
    expect(texts(dir).sort()).toEqual(
      [
        "Blend mode",
        "Body copy",
        "Fast preset",
        "Hover text",
        "How layers mix",
        "Lower quality",
        "Saved it",
        "Search layers",
        "Short blurb",
        "Tile size",
      ].sort(),
    );
  });

  it("reports both branches of a conditional property value (#922)", () => {
    const dir = fixture({
      "a.tsx": `export const item = (on: boolean) => ({ label: on ? "Hide grid" : "Show grid" });`,
    });
    expect(texts(dir).sort()).toEqual(["Hide grid", "Show grid"]);
  });

  it("ignores identifier-shaped values and non-copy property names (#922)", () => {
    const dir = fixture({
      "a.tsx": `export const CURSORS = [
        { name: "crosshair", label: "move-tool", text: "text" },
        { value: "Not a copy slot", id: "Also Not Copy", className: "Utility Classes" },
      ];`,
    });
    expect(texts(dir)).toEqual([]);
  });

  it("reports a destructuring default that renders (#922)", () => {
    const dir = fixture({
      "a.tsx": `const cfg: { heading?: string } = {};
      export const A = () => {
        const { heading = "Fallback heading" } = cfg;
        return <h2>{heading}</h2>;
      };`,
    });
    expect(kinds(dir)).toEqual([["LOCAL", "Fallback heading"]]);
  });

  it("reports the source object of a destructured copy property through PROP (#922)", () => {
    const dir = fixture({
      "a.tsx": `const config = { title: "Export settings" };
      export const A = () => {
        const { title } = config;
        return <h2>{title}</h2>;
      };`,
    });
    expect(kinds(dir)).toEqual([["PROP", "Export settings"]]);
  });

  it("reports a parameter default that renders (#922)", () => {
    const dir = fixture({
      "a.tsx": `export function A({ label = "Cancel changes" }: { label?: string }) {
        return <button>{label}</button>;
      }
      export function B(caption = "Untitled layer") {
        return <p>{caption}</p>;
      }`,
    });
    expect(texts(dir).sort()).toEqual(["Cancel changes", "Untitled layer"]);
  });

  it("does not report a parameter default that never renders (#922)", () => {
    const dir = fixture({
      "a.tsx": `export function A({ mode = "Compare Mode" }: { mode?: string }) {
        return <div data-mode={mode} />;
      }`,
    });
    expect(texts(dir)).toEqual([]);
  });

  it("reports literals assigned to a rendered let after its declaration (#922)", () => {
    const dir = fixture({
      "a.tsx": `export const A = ({ code }: { code: number }) => {
        let msg = "";
        if (code === 404) msg = "File not found";
        else if (code === 413) msg = code > 1 ? "File too large" : "Too big";
        return <p>{msg}</p>;
      };`,
    });
    expect(texts(dir).sort()).toEqual(["File not found", "File too large", "Too big"]);
  });

  it("follows += onto a rendered let (#922)", () => {
    const dir = fixture({
      "a.tsx": `export const A = ({ n }: { n: number }) => {
        let msg = "Start here";
        if (n) msg += " and more words";
        return <p>{msg}</p>;
      };`,
    });
    expect(texts(dir).sort()).toEqual(["Start here", "and more words"]);
  });

  it("ignores assignments to a same-named let in a nested function (#922)", () => {
    const dir = fixture({
      "a.tsx": `export const A = () => {
        let msg = "Outer copy shown";
        const helper = () => {
          let msg = "";
          msg = "Inner only copy";
          return msg.length;
        };
        helper();
        return <p>{msg}</p>;
      };`,
    });
    expect(texts(dir)).toEqual(["Outer copy shown"]);
  });

  it("does not report assignments to a let that never renders (#922)", () => {
    const dir = fixture({
      "a.tsx": `export const A = ({ code }: { code: number }) => {
        let cls = "";
        if (code) cls = "Bold Red Text";
        return <p className={cls}>{code}</p>;
      };`,
    });
    expect(texts(dir)).toEqual([]);
  });

  it("reports literals handed to an error or message setter, and to confirm() (#922)", () => {
    const dir = fixture({
      "a.tsx": `export const A = ({ data }: { data: { error?: string } }) => {
        setError(data.error || "Failed to change password");
        setInspectError(\`Failed to inspect \${"x"}\`);
        setStatusMessage(data.error ? "Retrying now" : "Saved it");
        if (!confirm("Delete this role?")) return null;
        window.confirm("Discard the draft?");
        return null;
      };`,
    });
    expect(texts(dir).sort()).toEqual(
      [
        "Delete this role?",
        "Discard the draft?",
        "Failed to change password",
        "Failed to inspect",
        "Retrying now",
        "Saved it",
      ].sort(),
    );
  });

  it("reports literals handed to a member error setter (#922)", () => {
    const dir = fixture({
      "a.tsx": `export const A = () => {
        store.setError("Collage failed");
        useFileStore.getState().setError(\`Upload failed: \${"x"}\`);
        return null;
      };`,
    });
    expect(kinds(dir)).toEqual([
      ["SINK", "Collage failed"],
      ["SINK", "Upload failed:"],
    ]);
  });

  it("does not report literals handed to other setters (#922)", () => {
    const dir = fixture({
      "a.tsx": `export const A = () => {
        setPreset("Custom Preset");
        setMode("Grid Mode");
        setError(null);
        setErrorCount("Not A Message");
        setMessages("Not A Message Either");
        store.setPreset("Custom Preset");
        dialog.confirm("Their Own Dialog");
        return null;
      };`,
    });
    expect(texts(dir)).toEqual([]);
  });

  it("scans every directory it is given", () => {
    const one = fixture({ "one.tsx": `export const A = () => <p>First message here</p>;` });
    const two = fixture({ "two.tsx": `export const B = () => <p>Second message here</p>;` });
    const hits = scanToolUiLiterals([one, two]);
    expect(hits.map((h) => h.text).sort()).toEqual(["First message here", "Second message here"]);
    expect(new Set(hits.map((h) => h.file)).size).toBe(2);
  });

  it("reports paths relative to the repo root for files inside it", () => {
    const dir = path.resolve(__dirname, "../../../apps/web/src/components/tools");
    const hits = scanToolUiLiterals(dir);
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) {
      expect(path.isAbsolute(hit.file)).toBe(false);
      expect(hit.file.startsWith("apps/web/src/components/tools/")).toBe(true);
    }
  });

  it("still accepts a single directory string", () => {
    const dir = fixture({ "a.tsx": `export const A = () => <p>Only one directory</p>;` });
    expect(texts(dir)).toEqual(["Only one directory"]);
  });

  it("descends into subdirectories so a new folder cannot slip past the guard", () => {
    const dir = fixture({ "a.tsx": `export const A = () => <p>Top level copy</p>;` });
    mkdirSync(path.join(dir, "nested", "deeper"), { recursive: true });
    writeFileSync(
      path.join(dir, "nested", "deeper", "b.tsx"),
      `export const B = () => <p>Buried copy</p>;`,
      "utf8",
    );
    expect(texts(dir).sort()).toEqual(["Buried copy", "Top level copy"]);
  });

  it("ignores non-tsx files", () => {
    const dir = fixture({
      "a.ts": `export const message = "Plain module string";`,
      "b.tsx": `export const B = () => <p>Rendered copy</p>;`,
    });
    expect(texts(dir)).toEqual(["Rendered copy"]);
  });
});
