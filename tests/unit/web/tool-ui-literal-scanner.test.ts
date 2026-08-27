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

  it("scans every directory it is given and reports repo-relative file paths", () => {
    const one = fixture({ "one.tsx": `export const A = () => <p>First message here</p>;` });
    const two = fixture({ "two.tsx": `export const B = () => <p>Second message here</p>;` });
    const hits = scanToolUiLiterals([one, two]);
    expect(hits.map((h) => h.text).sort()).toEqual(["First message here", "Second message here"]);
    expect(hits.every((h) => h.file.includes(path.sep))).toBe(true);
    expect(new Set(hits.map((h) => h.file)).size).toBe(2);
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
