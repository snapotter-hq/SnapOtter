#!/usr/bin/env node
/**
 * Gate the vulnerabilities a Trivy `ignore-unfixed` scan cannot see.
 *
 * The release workflow blocks on CRITICAL/HIGH findings that have a fix
 * available, which is the actionable gate: a fix exists and we did not take
 * it. Everything without a fix was dropped silently, so a shipped image could
 * carry an unfixed CRITICAL and the release scan would still print zero. That
 * reads exactly like a clean scan.
 *
 * This closes the gap without making the pipeline permanently red on things
 * nobody can act on. Findings that are known, written down and re-checked pass;
 * anything new fails. Stale allowlist entries only warn, because the release
 * matrix scans one architecture per job and the two do not carry the same set.
 *
 * Usage:
 *   node scripts/trivy-unfixed-gate.mjs <report.json> [options]
 *
 *   --allow <file>        allowlist path (default .trivy-unfixed-allow)
 *   --severity <list>     comma-separated severities (default CRITICAL)
 *   --label <text>        artifact name for the report heading
 *   --summary <file>      append the markdown report here (GITHUB_STEP_SUMMARY)
 */

import { appendFileSync, readFileSync } from "node:fs";

const ALLOW_ENTRY = /^(?:CVE|GHSA|PYSEC|DLA|DSA|TEMP|OSV)-[\w.-]+$/i;

function parseArgs(argv) {
  const options = {
    report: undefined,
    allow: ".trivy-unfixed-allow",
    severity: ["CRITICAL"],
    label: "artifact",
    summary: "",
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--allow") options.allow = argv[++i];
    else if (arg === "--severity")
      options.severity = argv[++i].split(",").map((s) => s.trim().toUpperCase());
    else if (arg === "--label") options.label = argv[++i];
    else if (arg === "--summary") options.summary = argv[++i];
    else if (!options.report) options.report = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (!options.report)
    throw new Error(
      "Usage: trivy-unfixed-gate.mjs <report.json> [--allow f] [--severity l] [--label t] [--summary f]",
    );
  return options;
}

/**
 * Collect unfixed findings, keyed by vulnerability ID.
 *
 * "Unfixed" matches Trivy's own `--ignore-unfixed` rule (no FixedVersion) so
 * this view and the blocking scan partition the report between them with no
 * finding falling in the gap.
 */
export function collectUnfixed(report, severities) {
  const wanted = new Set(severities);
  const byId = new Map();
  for (const result of report.Results ?? []) {
    for (const vuln of result.Vulnerabilities ?? []) {
      if (!wanted.has(vuln.Severity)) continue;
      if (vuln.FixedVersion) continue;
      const entry = byId.get(vuln.VulnerabilityID) ?? {
        id: vuln.VulnerabilityID,
        severity: vuln.Severity,
        title: vuln.Title ?? "",
        packages: new Set(),
      };
      entry.packages.add(`${vuln.PkgName} ${vuln.InstalledVersion ?? "?"}`);
      byId.set(vuln.VulnerabilityID, entry);
    }
  }
  return [...byId.values()]
    .map((entry) => ({ ...entry, packages: [...entry.packages].sort() }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function parseAllowlist(text) {
  const ids = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    if (!ALLOW_ENTRY.test(line)) throw new Error(`Not a vulnerability ID: "${line}"`);
    ids.push(line.toUpperCase());
  }
  return new Set(ids);
}

function markdown(label, severities, findings, unexpected, stale) {
  const lines = [
    `### Unfixed ${severities.join("/")} findings: ${label}`,
    "",
    findings.length === 0
      ? "None. Every finding at this severity has a fix available and is covered by the blocking scan."
      : `${findings.length} finding${findings.length === 1 ? "" : "s"} with no fix available upstream.`,
    "",
  ];
  if (findings.length > 0) {
    lines.push(
      "| ID | Severity | Package | Allowed | Summary |",
      "| --- | --- | --- | --- | --- |",
    );
    for (const f of findings) {
      // Backslashes first: escaping the pipe first would then re-escape the
      // backslash we just added, and a title containing a literal \| would
      // break out of the table cell.
      const summary = f.title.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").slice(0, 90);
      const allowed = unexpected.some((u) => u.id === f.id) ? "**no**" : "yes";
      lines.push(
        `| ${f.id} | ${f.severity} | ${f.packages.join("<br>")} | ${allowed} | ${summary} |`,
      );
    }
    lines.push("");
  }
  if (unexpected.length > 0) {
    lines.push(
      `**${unexpected.length} not in the allowlist.** Fix them, or add each ID to \`.trivy-unfixed-allow\` with an owner, what unblocks the fix, and a re-check date.`,
      "",
    );
  }
  if (stale.length > 0) {
    lines.push(`Allowlist entries not seen in this scan: ${stale.join(", ")}.`, "");
  }
  return lines.join("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = JSON.parse(readFileSync(options.report, "utf8"));
  const findings = collectUnfixed(report, options.severity);
  const allowed = parseAllowlist(readFileSync(options.allow, "utf8"));

  const unexpected = findings.filter((f) => !allowed.has(f.id.toUpperCase()));
  const seen = new Set(findings.map((f) => f.id.toUpperCase()));
  const stale = [...allowed].filter((id) => !seen.has(id)).sort();

  const body = markdown(options.label, options.severity, findings, unexpected, stale);
  process.stdout.write(`${body}\n`);
  if (options.summary) appendFileSync(options.summary, `${body}\n`);

  // Stale entries warn rather than fail: the release matrix scans one platform
  // per job, and an entry that is live on arm64 is absent from the amd64 job.
  // One aggregate annotation, since the per-ID detail is in the summary table.
  if (stale.length > 0) {
    console.log(
      `::warning::${stale.length} allowlist entr${stale.length === 1 ? "y is" : "ies are"} absent from ${options.label}; re-check whether they are still needed`,
    );
  }
  for (const finding of unexpected) {
    console.log(
      `::error::${finding.id} (${finding.severity}, ${finding.packages.join(", ")}) has no fix available and is not in .trivy-unfixed-allow`,
    );
  }

  if (unexpected.length > 0) {
    console.error(
      `\n${unexpected.length} unfixed ${options.severity.join("/")} finding(s) in ${options.label} are not accounted for.`,
    );
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
