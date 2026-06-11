import { spawnSync } from "node:child_process";

const cache = new Map<string, string | null>();

function which(bin: string): string | null {
  const res = spawnSync(process.platform === "win32" ? "where" : "which", [bin], {
    encoding: "utf8",
  });
  if (res.status === 0 && res.stdout.trim()) return res.stdout.trim().split("\n")[0];
  return null;
}

function resolveBin(envVar: string, name: string): string | null {
  const key = `${envVar}:${name}`;
  if (!cache.has(key)) cache.set(key, process.env[envVar] || which(name));
  return cache.get(key) ?? null;
}

export function resolveQpdf(): string | null {
  return resolveBin("QPDF_PATH", "qpdf");
}
export function resolveSoffice(): string | null {
  return resolveBin("SOFFICE_PATH", "soffice");
}
export function resolveGs(): string | null {
  return resolveBin("GS_PATH", "gs");
}
export function qpdfAvailable(): boolean {
  return resolveQpdf() !== null;
}
export function sofficeAvailable(): boolean {
  return resolveSoffice() !== null;
}
