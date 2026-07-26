import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const gate = resolve(root, "scripts/trivy-unfixed-gate.mjs");
const allowFile = resolve(root, ".trivy-unfixed-allow");
const workspace = mkdtempSync(join(tmpdir(), "trivy-gate-"));

afterAll(() => rmSync(workspace, { recursive: true, force: true }));

function vuln(overrides: Record<string, unknown>) {
  return {
    VulnerabilityID: "CVE-0000-0000",
    PkgName: "somepkg",
    InstalledVersion: "1.0",
    Severity: "CRITICAL",
    Title: "example",
    ...overrides,
  };
}

function report(vulnerabilities: Record<string, unknown>[]): string {
  const path = join(workspace, `report-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(path, JSON.stringify({ Results: [{ Vulnerabilities: vulnerabilities }] }));
  return path;
}

function allow(body: string): string {
  const path = join(workspace, `allow-${Math.random().toString(36).slice(2)}`);
  writeFileSync(path, body);
  return path;
}

function run(reportPath: string, allowPath: string, extra: string[] = []) {
  return spawnSync(process.execPath, [gate, reportPath, "--allow", allowPath, ...extra], {
    encoding: "utf8",
  });
}

describe("trivy unfixed gate", () => {
  it("fails on an unfixed CRITICAL that nobody has written down", () => {
    const result = run(
      report([vuln({ VulnerabilityID: "CVE-2026-99999" })]),
      allow("# nothing allowed\n"),
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("::error::CVE-2026-99999");
    expect(result.stdout).toContain("**no**");
  });

  it("passes an unfixed CRITICAL that is on the allowlist, and still reports it", () => {
    const result = run(
      report([vuln({ VulnerabilityID: "CVE-2026-99999" })]),
      allow("# justified elsewhere\nCVE-2026-99999\n"),
    );

    expect(result.status).toBe(0);
    // Allowed is not the same as hidden: the whole point is that it stays visible.
    expect(result.stdout).toContain("CVE-2026-99999");
    expect(result.stdout).toContain("1 finding with no fix available upstream");
  });

  it("leaves findings with a fix to the blocking scan", () => {
    const result = run(
      report([vuln({ VulnerabilityID: "CVE-2026-99999", FixedVersion: "1.1" })]),
      allow(""),
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("None.");
  });

  it("ignores severities outside the requested set", () => {
    const path = report([
      vuln({ VulnerabilityID: "CVE-2026-11111", Severity: "HIGH" }),
      vuln({ VulnerabilityID: "CVE-2026-22222", Severity: "CRITICAL" }),
    ]);

    expect(run(path, allow("CVE-2026-22222\n")).status).toBe(0);
    expect(run(path, allow("CVE-2026-22222\n"), ["--severity", "CRITICAL,HIGH"]).status).toBe(1);
  });

  it("warns but does not fail when an allowlist entry is absent", () => {
    // The release matrix scans one architecture per job, so an entry that is
    // live on arm64 is legitimately missing from the amd64 report.
    const result = run(report([]), allow("CVE-2026-99999\n"));

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("::warning::1 allowlist entry is absent");
  });

  it("rejects an allowlist line that is not a vulnerability ID", () => {
    const result = run(report([]), allow("please ignore this one\n"));

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Not a vulnerability ID");
  });

  it("writes the report to the GitHub step summary when one is configured", () => {
    const summary = join(workspace, "summary.md");
    writeFileSync(summary, "");
    run(report([vuln({ VulnerabilityID: "CVE-2026-99999" })]), allow("CVE-2026-99999\n"), [
      "--summary",
      summary,
    ]);

    expect(readFileSync(summary, "utf8")).toContain("CVE-2026-99999");
  });

  it("keeps the committed allowlist parseable and free of duplicates", () => {
    const ids = readFileSync(allowFile, "utf8")
      .split("\n")
      .map((line) => line.replace(/#.*$/, "").trim())
      .filter(Boolean);

    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^(?:CVE|GHSA|PYSEC|DLA|DSA|TEMP|OSV)-[\w.-]+$/);
  });

  it("is wired into both release scan jobs", () => {
    const release = readFileSync(resolve(root, ".github/workflows/release.yml"), "utf8");
    const gateSteps = release.match(/node scripts\/trivy-unfixed-gate\.mjs/g) ?? [];

    expect(gateSteps).toHaveLength(2);
    // The reports the gate reads must not be pre-filtered, or it sees nothing.
    expect(release).not.toMatch(/format: "json"[\s\S]{0,200}?ignore-unfixed/);
    expect(release).not.toMatch(/format: json[\s\S]{0,200}?ignore-unfixed/);
  });
});
