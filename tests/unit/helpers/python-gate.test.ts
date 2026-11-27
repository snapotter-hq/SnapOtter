import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  findMissingGeneratedPythonPrerequisite,
  hasPython,
  resolvePython,
  weasyprintUsable,
} from "../../helpers/python-gate.js";

const NO_CAPABILITIES = {
  fitz: false,
  fontTools: false,
  markdown: false,
  pdf2docx: false,
  pikepdf: false,
  weasyprint: false,
};

describe("Python interpreter resolution", () => {
  it("uses Scripts/python.exe from a configured Windows venv", () => {
    const located: string[] = [];

    expect(
      resolvePython({
        cwd: "C:\\repo",
        env: { PYTHON_VENV_PATH: "C:\\venv" },
        fileExists: (path) => path === "C:\\venv\\Scripts\\python.exe",
        locate: (command, executable) => {
          located.push(`${command} ${executable}`);
          return [];
        },
        platform: "win32",
      }),
    ).toBe("C:\\venv\\Scripts\\python.exe");
    expect(located).toEqual([]);
  });

  it("uses where to find a Windows system interpreter", () => {
    expect(
      resolvePython({
        cwd: "C:\\repo",
        env: {},
        fileExists: (path) => path === "C:\\Python313\\python.exe",
        locate: (command, executable) => {
          expect([command, executable]).toEqual(["where", "python"]);
          return ["C:\\missing\\python.exe", "C:\\Python313\\python.exe"];
        },
        platform: "win32",
      }),
    ).toBe("C:\\Python313\\python.exe");
  });

  it("uses bin/python3 from a Unix venv", () => {
    const located: string[] = [];

    expect(
      resolvePython({
        cwd: "/repo",
        env: {},
        fileExists: (path) => path === "/repo/.venv/bin/python3",
        locate: (command, executable) => {
          located.push(`${command} ${executable}`);
          return [];
        },
        platform: "linux",
      }),
    ).toBe("/repo/.venv/bin/python3");
    expect(located).toEqual([]);
  });

  it("uses which to find a Unix system interpreter", () => {
    expect(
      resolvePython({
        cwd: "/repo",
        env: {},
        fileExists: (path) => path === "/usr/local/bin/python3",
        locate: (command, executable) => {
          expect([command, executable]).toEqual(["which", "python3"]);
          return ["/usr/local/bin/python3"];
        },
        platform: "linux",
      }),
    ).toBe("/usr/local/bin/python3");
  });
});

describe.skipIf(!hasPython)("WeasyPrint capability probe", () => {
  let stubRoot: string;
  beforeAll(() => {
    stubRoot = mkdtempSync(join(tmpdir(), "weasyprint-gate-"));
  });
  afterAll(() => rmSync(stubRoot, { recursive: true, force: true }));

  // A stub package on PYTHONPATH shadows any real WeasyPrint the host has.
  function stubWeasyprint(name: string, urlsSource: string): NodeJS.ProcessEnv {
    const pkg = join(stubRoot, name, "weasyprint");
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, "__init__.py"), "class HTML:\n    pass\n");
    writeFileSync(join(pkg, "urls.py"), urlsSource);
    return { ...process.env, PYTHONPATH: join(stubRoot, name) };
  }

  it("rejects a release whose weasyprint.urls has no URLFetcher", () => {
    // Ubuntu 24.04's apt python3-weasyprint 61.1 imports fine but fails the tool (#5077).
    const env = stubWeasyprint("old", "def fetch(url):\n    pass\n");

    expect(weasyprintUsable(env)).toBe(false);
  });

  it("accepts a release that has URLFetcher", () => {
    const env = stubWeasyprint("current", "class URLFetcher:\n    pass\n");

    expect(weasyprintUsable(env)).toBe(true);
  });
});

describe("generated source Python prerequisites", () => {
  it.each([
    ["flatten-pdf", "fitz"],
    ["redact-pdf", "fitz"],
    ["sign-pdf", "fitz"],
    ["pdf-to-text", "fitz"],
    ["pdf-to-word", "pdf2docx"],
    ["pdf-metadata", "pikepdf"],
    ["html-to-pdf", "weasyprint"],
    ["markdown-to-pdf", "weasyprint"],
  ])("gates %s on %s", (toolId, moduleName) => {
    expect(findMissingGeneratedPythonPrerequisite(toolId, {}, NO_CAPABILITIES)).toContain(
      moduleName,
    );
  });

  it("gates only the PDF branch of epub-convert", () => {
    expect(
      findMissingGeneratedPythonPrerequisite("epub-convert", { format: "pdf" }, NO_CAPABILITIES),
    ).toContain("weasyprint");
    expect(
      findMissingGeneratedPythonPrerequisite("epub-convert", { format: "html" }, NO_CAPABILITIES),
    ).toBeUndefined();
  });

  it("skips convert-font without fontTools", () => {
    expect(findMissingGeneratedPythonPrerequisite("convert-font", {}, NO_CAPABILITIES)).toContain(
      "fontTools",
    );
  });

  it.each(["otf-to-ttf", "woff-to-ttf", "woff2-to-ttf", "ttf-to-woff2"])(
    "gates the %s preset on its base's fontTools (#5053)",
    (presetId) => {
      expect(findMissingGeneratedPythonPrerequisite(presetId, {}, NO_CAPABILITIES)).toContain(
        "fontTools",
      );
    },
  );

  it("allows tools when their Python capability is present", () => {
    const capabilities = {
      fitz: true,
      fontTools: true,
      markdown: true,
      pdf2docx: true,
      pikepdf: true,
      weasyprint: true,
    };

    expect(
      findMissingGeneratedPythonPrerequisite("markdown-to-pdf", {}, capabilities),
    ).toBeUndefined();
    expect(
      findMissingGeneratedPythonPrerequisite("convert-font", {}, capabilities),
    ).toBeUndefined();
  });

  it("requires the markdown module in addition to weasyprint", () => {
    expect(
      findMissingGeneratedPythonPrerequisite(
        "markdown-to-pdf",
        {},
        {
          ...NO_CAPABILITIES,
          weasyprint: true,
        },
      ),
    ).toContain("markdown");
  });
});
