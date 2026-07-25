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
