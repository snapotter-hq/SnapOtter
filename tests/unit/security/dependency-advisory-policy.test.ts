import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function packageJson(path: string): {
  dependencies?: Record<string, string>;
  engines?: { node?: string };
  pnpm?: { overrides?: Record<string, string> };
} {
  return JSON.parse(readFileSync(resolve(root, path), "utf8"));
}

function minimumNodeVersion(range: string | undefined): [number, number, number] | null {
  const match = range?.match(/^>=(\d+)\.(\d+)\.(\d+)$/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

describe("production dependency advisory policy", () => {
  it("keeps directly reachable server dependencies on patched releases", () => {
    const api = packageJson("apps/api/package.json");

    expect(api.dependencies?.["@fastify/static"]).toBe("^10.1.2");
    expect(api.dependencies?.tar).toBe("^7.5.21");
  });

  it("uses the patched non-RSC React Router release without the compatibility wrapper", () => {
    const web = packageJson("apps/web/package.json");

    expect(web.dependencies?.["react-router"]).toBe("^8.3.0");
    expect(web.dependencies).not.toHaveProperty("react-router-dom");
  });

  it("advertises a Node floor supported by the production router", () => {
    const rootPackage = packageJson("package.json");
    const routerPackage = packageJson("apps/web/node_modules/react-router/package.json");
    const advertisedFloor = minimumNodeVersion(rootPackage.engines?.node);
    const routerFloor = minimumNodeVersion(routerPackage.engines?.node);

    expect(
      advertisedFloor,
      "root package must declare an exact minimum Node version",
    ).not.toBeNull();
    expect(routerFloor, "React Router must declare an exact minimum Node version").not.toBeNull();
    expect(advertisedFloor).toEqual(routerFloor);
  });

  it("pins the vulnerable brace-expansion release to its patched successor", () => {
    const rootPackage = packageJson("package.json");

    expect(rootPackage.pnpm?.overrides?.["brace-expansion@5.0.7"]).toBe("5.0.8");
  });

  it("resolves only the patched versions in the frozen lockfile", () => {
    const lockfile = readFileSync(resolve(root, "pnpm-lock.yaml"), "utf8");

    expect(lockfile).toContain("'@fastify/static@10.1.2'");
    expect(lockfile).toContain("brace-expansion@5.0.8");
    expect(lockfile).toContain("react-router@8.3.0");
    expect(lockfile).toContain("tar@7.5.22");
    expect(lockfile).not.toContain("'@fastify/static@9.3.0'");
    expect(lockfile).not.toMatch(/\n {2}brace-expansion@5\.0\.7:\n/);
    expect(lockfile).not.toContain("react-router@7.18.1");
    expect(lockfile).not.toContain("tar@7.5.20");
  });
});

type Version = [number, number, number];

function parseVersion(value: string): Version | null {
  const match = value.match(/^(\d+)\.(\d+)\.(\d+)$/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function compareVersions(a: Version, b: Version): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

// The release line an advisory is backported to: the major for 1.x and up,
// major.minor for 0.x packages, where each minor is its own line.
function lineOf(version: Version): string {
  return version[0] === 0 ? `0.${version[1]}` : String(version[0]);
}

// The minimum version a caret or >= range admits: the number that matters for
// a security floor, since a loose range resolves to whatever the lockfile says.
function rangeFloor(range: string | undefined): Version | null {
  const match = range?.match(/^(?:\^|>=)(\d+\.\d+\.\d+)$/);
  return match ? parseVersion(match[1]) : null;
}

// Every version the frozen lockfile resolves for a package, read from the
// `packages:` section (keys are `name@version`, scoped names quoted). The
// capture is deliberately loose so a pre-release or a git tarball surfaces as
// a failure instead of being skipped.
function lockfileVersions(lockfile: string, name: string): string[] {
  const section = lockfile.slice(
    lockfile.indexOf("\npackages:\n"),
    lockfile.indexOf("\nsnapshots:\n"),
  );
  const escaped = name.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const pattern = new RegExp(`^  '?${escaped}@(.+?)'?:$`, "gm");
  return [...section.matchAll(pattern)].map((match) => match[1]);
}

// Dependabot alerts triaged in issue #835. Each floor is the first patched
// release from the advisory. A per-line map covers packages the lockfile
// resolves at several release lines, where each line has its own backport.
const ALERT_FLOORS: Record<string, string | Record<string, string>> = {
  // GHSA-hq66-cqwq-w95j: arbitrary JS execution on opening a malicious PDF.
  "pdfjs-dist": "6.2.108",
  // GHSA-7p8r-x3mc-p8w7, GHSA-jqff-g426-hqxp, GHSA-fph4-wmhf-6fwf,
  // GHSA-f65p-4m7j-42xc, GHSA-5jgf-p345-68v8: host confusion and SSRF.
  "fast-uri": "4.1.3",
  // GHSA-w2qp-rph6-63g4 and GHSA-3m5p-2c4r-xxw2 (5.12.1), then
  // GHSA-9q9j-q6p8-xq58, GHSA-hwr6-493r-vm6h, GHSA-p68q-wchp-6fh7,
  // GHSA-667r-xxjv-c9mm (5.12.2): validation and auth bypasses.
  fastify: "5.12.2",
  // GHSA-5p4m-2wfm-xmqj: quadratic CPU in !!omap resolution.
  "js-yaml": "4.3.1",
  // GHSA-4cwx-7wf7-3272 and friends, backported per major line.
  undici: { "6": "6.28.0", "7": "7.29.0", "8": "8.9.0" },
  // GHSA-6gmq-8vp8-gcm6: XML fragment injection, patched on both 0.x lines.
  "@xmldom/xmldom": { "0.8": "0.8.15", "0.9": "0.9.12" },
  // GHSA-55q2-fjhq-7xh7: IN_PLACE hook removal leaves executable subtree.
  dompurify: "3.4.13",
  // GHSA-px8p-9vwx-vf98: unzipSync infinite loop on malformed ZIP. posthog-js
  // still rides the 0.4 line; apps/api and apps/web are on 0.8.
  fflate: { "0.4": "0.4.9", "0.8": "0.8.3" },
  // GHSA-x5fp-wj9c-mxmx: array-limit bypass.
  qs: "6.16.0",
  // GHSA-fxqj-rqcc-2cmp: incomplete fix of GHSA-6g55-p6wh-862q.
  postcss: "8.5.23",
};

function floorFor(floors: string | Record<string, string>, version: Version): string | undefined {
  return typeof floors === "string" ? floors : floors[lineOf(version)];
}

describe("Dependabot alert floors (issue #835)", () => {
  const lockfile = readFileSync(resolve(root, "pnpm-lock.yaml"), "utf8");

  it.each(Object.entries(ALERT_FLOORS))(
    "resolves %s only at or above its patched release",
    (name, floors) => {
      const resolved = lockfileVersions(lockfile, name);
      expect(resolved, `${name} must appear in the lockfile`).not.toHaveLength(0);
      for (const version of resolved) {
        const parsed = parseVersion(version);
        expect(parsed, `${name}@${version} must be a plain semver`).not.toBeNull();
        if (!parsed) continue;
        const floor = floorFor(floors, parsed);
        expect(floor, `${name} line ${lineOf(parsed)} needs a floor`).toBeDefined();
        const parsedFloor = parseVersion(floor as string) as Version;
        expect(
          compareVersions(parsed, parsedFloor),
          `${name}@${version} is below the patched floor ${floor}`,
        ).toBeGreaterThanOrEqual(0);
      }
    },
  );

  it("declares patched floors where the manifests and overrides pin the alerted packages", () => {
    const rootPackage = packageJson("package.json");
    const overrides = rootPackage.pnpm?.overrides ?? {};
    const api = packageJson("apps/api/package.json");
    const web = packageJson("apps/web/package.json");
    // [what is pinned, the declared range, the patched floor it must admit]
    const declared: Array<[string, string | undefined, string]> = [
      ["web pdfjs-dist", web.dependencies?.["pdfjs-dist"], "6.2.108"],
      ["api fastify", api.dependencies?.fastify, "5.12.2"],
      ["api js-yaml", api.dependencies?.["js-yaml"], "4.3.1"],
      ["override js-yaml", overrides["js-yaml"], "4.3.1"],
      ["override fast-uri", overrides["fast-uri"], "4.1.3"],
      ["override qs", overrides.qs, "6.16.0"],
      ["override postcss", overrides.postcss, "8.5.23"],
      ["override dompurify", overrides.dompurify, "3.4.13"],
      ["override undici@6", overrides["undici@6"], "6.28.0"],
      ["override undici@7", overrides["undici@7"], "7.29.0"],
      ["override undici@8", overrides["undici@8"], "8.9.0"],
      ["override @xmldom/xmldom@0.8", overrides["@xmldom/xmldom@0.8"], "0.8.15"],
      ["override fflate@0.4", overrides["fflate@0.4"], "0.4.9"],
    ];
    for (const [what, range, patched] of declared) {
      const floor = rangeFloor(range);
      expect(floor, `${what} range ${range} must be a caret or >= floor`).not.toBeNull();
      expect(
        compareVersions(floor as Version, parseVersion(patched) as Version),
        `${what} range ${range} admits versions below ${patched}`,
      ).toBeGreaterThanOrEqual(0);
    }
  });
});
