// Every package that two bundles could ship at different versions is pinned in
// the manifest's "constraints", which build-bundle.sh exports as PIP_CONSTRAINT
// for every build (#4739). These are the versions the published amd64 set
// ships; arm64 bundles were rebuilt to match.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../../docker/feature-manifest.json"), "utf-8"),
) as { constraints: string[] };

const SHARED_PINS = [
  "absl-py==2.5.1",
  "imageio==2.38.1",
  "kiwisolver==1.5.1",
  "lazy-loader==0.6",
  "llvmlite==0.50.0",
  "matplotlib==3.11.2",
  "numba==0.68.1",
  "platformdirs==4.14.5",
  "protobuf==7.36.2",
  "pyparsing==3.3.3",
  "python-dateutil==4.0.0",
  "sounddevice==0.5.6",
];

describe("bundle version pins", () => {
  it("pins every package the bundles used to ship at more than one version", () => {
    expect(manifest.constraints).toEqual(expect.arrayContaining(SHARED_PINS));
  });

  it("pins each package once, as an exact version", () => {
    const names = manifest.constraints.map((c) => c.split("==")[0]?.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    for (const c of manifest.constraints) expect(c).toMatch(/^[A-Za-z0-9_.-]+==[A-Za-z0-9_.+-]+$/);
  });
});
