#!/usr/bin/env node
// Reduces a Vitest/Playwright JSON report to { testIds: string[], passSet: string[] }.
// Used by the parity gate: a later phase must keep testIds >= pre and passSet >= pre.
import { readFileSync, writeFileSync } from "node:fs";

const inPath = process.argv[2];
const outPath = process.argv[3];
if (!inPath || !outPath) {
  console.error("usage: extract-inventory.mjs <report.json> <out.json>");
  process.exit(1);
}
const report = JSON.parse(readFileSync(inPath, "utf8"));
const testIds = [];
const passSet = [];
// Vitest/Jest shape: { testResults: [{ name, assertionResults: [{ fullName, status }] }] }
for (const file of report.testResults ?? []) {
  for (const a of file.assertionResults ?? []) {
    const id = `${file.name} > ${a.fullName}`;
    testIds.push(id);
    if (a.status === "passed") passSet.push(id);
  }
}
testIds.sort();
passSet.sort();
writeFileSync(outPath, JSON.stringify({ testIds, passSet, counts: { total: testIds.length, passed: passSet.length } }, null, 2));
console.log(`inventory: ${testIds.length} tests, ${passSet.length} passed -> ${outPath}`);
