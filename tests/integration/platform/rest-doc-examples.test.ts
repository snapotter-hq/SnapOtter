/**
 * Runs the fenced `bash example` blocks in apps/docs/api/rest.md against a live
 * test instance, so the published curl examples cannot drift silently.
 *
 * A block opts in by using the `bash example` info string. Each block runs once
 * under `bash -c` with these substitutions:
 *   - http://localhost:1349 -> the test server's base URL
 *   - <token> and <session-token> -> a session token from loginAsAdmin
 *
 * curl is shimmed so every request prints its HTTP status. The doc commands stay
 * unchanged, and the test asserts each status is 2xx even though curl exits 0 on
 * HTTP errors.
 */
import { execFile, execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures, readFixture } from "../../fixtures/index.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

const execFileAsync = promisify(execFile);

const DOC_PATH = fileURLToPath(new URL("../../../apps/docs/api/rest.md", import.meta.url));
const DOC_HOST = "http://localhost:1349";
const STATUS_MARKER = "__STATUS__";
const examples = extractDocExamples(readFileSync(DOC_PATH, "utf8"));

interface DocExample {
  index: number;
  command: string;
}

/** Pull the body of every fence whose info string is exactly `bash example`. */
function extractDocExamples(markdown: string): DocExample[] {
  const pattern = /^```bash example[ \t]*\n([\s\S]*?)^```[ \t]*$/gm;
  const examples: DocExample[] = [];
  for (const match of markdown.matchAll(pattern)) {
    examples.push({ index: examples.length, command: match[1] ?? "" });
  }
  return examples;
}

function countCurlInvocations(command: string): number {
  return command.split("\n").filter((line) => /^\s*curl\s/.test(line)).length;
}

function substitute(command: string, baseUrl: string, token: string): string {
  const replacements: Array<[string, string]> = [
    [DOC_HOST, baseUrl],
    ["<session-token>", token],
    ["<token>", token],
  ];
  return replacements.reduce((text, [from, to]) => text.split(from).join(to), command);
}

function parseStatuses(stdout: Buffer): number[] {
  const text = stdout.toString("latin1");
  return [...text.matchAll(new RegExp(`${STATUS_MARKER}(\\d{3})`, "g"))].map((m) => Number(m[1]));
}

let testApp: TestApp;
let baseUrl: string;
let token: string;
let workDir: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  // loginAsAdmin reads the seeded admin, and buildTestApp already clears its
  // mustChangePassword flag, so the first-run password change does not block
  // these calls.
  token = await loginAsAdmin(testApp.app);
  await testApp.app.listen({ port: 0, host: "127.0.0.1" });
  const addr = testApp.app.server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;

  workDir = mkdtempSync(join(tmpdir(), "rest-doc-examples-"));
  const binDir = join(workDir, "bin");
  mkdirSync(binDir);
  const realCurl = execFileSync("/bin/sh", ["-c", "command -v curl"], { encoding: "utf8" }).trim();
  writeFileSync(
    join(binDir, "curl"),
    `#!/bin/sh\n"${realCurl}" "$@" -w '\\n${STATUS_MARKER}%{http_code}\\n'\n`,
  );
  chmodSync(join(binDir, "curl"), 0o755);

  // Doc examples reference these files by relative name in the working directory.
  const jpeg = readFixture(fixtures.image.base.jpg100);
  for (const name of ["photo.jpg", "input.jpg", "a.jpg", "b.jpg", "c.jpg"]) {
    writeFileSync(join(workDir, name), jpeg);
  }
});

afterAll(async () => {
  await testApp?.cleanup();
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

describe("REST doc examples", () => {
  it("marks at least one runnable example", () => {
    expect(examples.length).toBeGreaterThan(0);
  });

  it.each(examples.map((example) => [example.index, example] as const))(
    "runs marked example %i",
    async (_index, example) => {
      const command = substitute(example.command, baseUrl, token);
      const script = `set -e\n${command}\n`;
      const { stdout } = await execFileAsync("bash", ["-c", script], {
        cwd: workDir,
        encoding: "buffer",
        maxBuffer: 256 * 1024 * 1024,
        env: {
          ...process.env,
          PATH: `${join(workDir, "bin")}:${process.env.PATH ?? ""}`,
          TOKEN: token,
        },
      });

      const statuses = parseStatuses(stdout);
      expect(statuses).toHaveLength(countCurlInvocations(example.command));
      const tail = stdout.toString("utf8").slice(-1000);
      for (const status of statuses) {
        expect(status, `status ${status}; last output: ${tail}`).toBeGreaterThanOrEqual(200);
        expect(status, `status ${status}; last output: ${tail}`).toBeLessThan(300);
      }
    },
  );
});
