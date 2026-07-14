import { readFileSync } from "node:fs";
import { totalmem } from "node:os";
import { posix } from "node:path";

export const OCR_RUNTIME_MINIMUM_MEMORY_BYTES = 4 * 1024 * 1024 * 1024;

const CGROUP_MEMORY_LIMIT_PATHS = [
  "/sys/fs/cgroup/memory.max",
  "/sys/fs/cgroup/memory/memory.limit_in_bytes",
  "/sys/fs/cgroup/memory.limit_in_bytes",
] as const;

export interface OcrRuntimeMemoryOptions {
  /** Exact test/caller override after physical and cgroup limits are resolved. */
  effectiveMemoryBytes?: number;
  /** Test seam for the host's configured physical capacity. */
  physicalMemoryBytes?: number;
  /** Test seam for cgroup v1/v2 capacity files. */
  readTextFile?: (path: string) => string;
  /** Test seam for Linux fail-closed cgroup discovery. */
  hostPlatform?: NodeJS.Platform;
}

function positiveSafeBytes(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

function parseCgroupLimit(raw: string): bigint | null {
  const value = raw.trim();
  if (value === "max" || !/^[0-9]+$/.test(value)) return null;
  const parsed = BigInt(value);
  return parsed > 0n ? parsed : null;
}

function decodeMountInfoPath(value: string): string {
  return value.replace(/\\([0-7]{3})/g, (_match, octal: string) =>
    String.fromCharCode(Number.parseInt(octal, 8)),
  );
}

interface CgroupMount {
  filesystem: "cgroup" | "cgroup2";
  root: string;
  mountPoint: string;
  controllers: Set<string>;
}

function parseCgroupMounts(raw: string): CgroupMount[] {
  const mounts: CgroupMount[] = [];
  for (const line of raw.split("\n")) {
    if (!line) continue;
    const fields = line.split(" ");
    const separator = fields.indexOf("-");
    if (separator < 6) continue;
    const filesystem = fields[separator + 1];
    if (filesystem !== "cgroup" && filesystem !== "cgroup2") continue;
    mounts.push({
      filesystem,
      root: decodeMountInfoPath(fields[3]),
      mountPoint: decodeMountInfoPath(fields[4]),
      controllers: new Set(
        fields
          .slice(separator + 3)
          .join(",")
          .split(","),
      ),
    });
  }
  return mounts;
}

function cgroupProcessPath(mount: CgroupMount, membership: string): string | null {
  const root = posix.normalize(mount.root);
  const member = posix.normalize(membership);
  if (!root.startsWith("/") || !member.startsWith("/") || !mount.mountPoint.startsWith("/")) {
    return null;
  }
  let suffix: string;
  if (root === "/") suffix = member.slice(1);
  else if (member === root) suffix = "";
  else if (member.startsWith(`${root}/`)) suffix = member.slice(root.length + 1);
  else return null;
  const candidate = posix.normalize(posix.join(mount.mountPoint, suffix));
  return candidate === mount.mountPoint || candidate.startsWith(`${mount.mountPoint}/`)
    ? candidate
    : null;
}

function membershipMemoryLimits(
  readTextFile: (path: string) => string,
  failClosed: boolean,
): bigint[] | null {
  let membershipRaw: string;
  try {
    membershipRaw = readTextFile("/proc/self/cgroup");
  } catch {
    if (failClosed) throw new Error("unable to read the process cgroup memory capacity");
    return null;
  }

  const membershipLines = membershipRaw.split("\n").filter(Boolean);
  if (failClosed && membershipLines.length === 0) {
    throw new Error("unable to read the process cgroup memory capacity");
  }
  const parsedMemberships = membershipLines.map((line) => /^([^:]*):([^:]*):(.*)$/.exec(line));
  if (
    failClosed &&
    parsedMemberships.some((fields) => fields === null || !fields[3]?.startsWith("/"))
  ) {
    throw new Error("unable to read the process cgroup memory capacity");
  }
  const memberships = parsedMemberships
    .filter(
      (fields): fields is RegExpExecArray => fields !== null && fields[3]?.startsWith("/") === true,
    )
    .map(([, hierarchy, controllers, membershipPath]) => ({
      kind: hierarchy === "0" && controllers === "" ? "cgroup2" : "cgroup",
      controllers: new Set(controllers.split(",").filter(Boolean)),
      path: membershipPath,
    }))
    .filter((membership) => membership.kind === "cgroup2" || membership.controllers.has("memory"));
  if (memberships.length === 0) return null;

  let mountInfoRaw: string;
  try {
    mountInfoRaw = readTextFile("/proc/self/mountinfo");
  } catch {
    throw new Error("unable to resolve the process cgroup memory capacity");
  }

  const mounts = parseCgroupMounts(mountInfoRaw);
  let selected: { mount: CgroupMount; processPath: string; limitFile: string } | undefined;
  for (const membership of memberships) {
    for (const mount of mounts) {
      if (
        mount.filesystem !== membership.kind ||
        (mount.filesystem === "cgroup" && !mount.controllers.has("memory"))
      ) {
        continue;
      }
      const processPath = cgroupProcessPath(mount, membership.path);
      if (!processPath) continue;
      if (!selected || mount.root.length > selected.mount.root.length) {
        selected = {
          mount,
          processPath,
          limitFile: mount.filesystem === "cgroup2" ? "memory.max" : "memory.limit_in_bytes",
        };
      }
    }
  }
  if (!selected) {
    throw new Error("unable to resolve the process cgroup memory capacity");
  }

  const limits: bigint[] = [];
  let unreadable = false;
  let current = selected.processPath;
  while (true) {
    try {
      const raw = readTextFile(posix.join(current, selected.limitFile));
      const normalized = raw.trim();
      if (normalized !== "max" && !/^[0-9]+$/.test(normalized)) {
        throw new Error("malformed cgroup memory capacity");
      }
      const limit = parseCgroupLimit(raw);
      if (limit !== null) limits.push(limit);
    } catch {
      unreadable = true;
    }
    if (current === selected.mount.mountPoint) break;
    const parent = posix.dirname(current);
    if (parent === current || !parent.startsWith(selected.mount.mountPoint)) break;
    current = parent;
  }
  if (unreadable) throw new Error("unable to read the process cgroup memory capacity");
  return limits;
}

/** Configured capacity available to this process, including container limits. */
export function getOcrRuntimeEffectiveMemoryBytes(options: OcrRuntimeMemoryOptions = {}): number {
  if (options.effectiveMemoryBytes !== undefined) {
    return positiveSafeBytes(options.effectiveMemoryBytes, "effective OCR runtime memory");
  }

  const physical = positiveSafeBytes(
    options.physicalMemoryBytes ?? totalmem(),
    "physical OCR runtime memory",
  );
  let effective = BigInt(physical);
  const readTextFile = options.readTextFile ?? ((path: string) => readFileSync(path, "utf8"));
  const membershipLimits = membershipMemoryLimits(
    readTextFile,
    (options.hostPlatform ?? process.platform) === "linux",
  );
  if (membershipLimits === null) {
    for (const path of CGROUP_MEMORY_LIMIT_PATHS) {
      try {
        const limit = parseCgroupLimit(readTextFile(path));
        if (limit !== null && limit < effective) effective = limit;
      } catch {
        // A host normally exposes either cgroup v2, one v1 layout, or neither.
      }
    }
  } else {
    for (const limit of membershipLimits) if (limit < effective) effective = limit;
  }
  const constrained =
    options.physicalMemoryBytes === undefined && typeof process.constrainedMemory === "function"
      ? process.constrainedMemory()
      : undefined;
  if (constrained && Number.isSafeInteger(constrained) && constrained > 0) {
    effective = effective < BigInt(constrained) ? effective : BigInt(constrained);
  }
  return Number(effective);
}

export function hasOcrRuntimeMemory(
  minimumMemoryBytes: number,
  options: OcrRuntimeMemoryOptions = {},
): boolean {
  positiveSafeBytes(minimumMemoryBytes, "OCR runtime minimum memory");
  return getOcrRuntimeEffectiveMemoryBytes(options) >= minimumMemoryBytes;
}

export function assertOcrRuntimeMemory(
  minimumMemoryBytes: number,
  options: OcrRuntimeMemoryOptions = {},
): void {
  positiveSafeBytes(minimumMemoryBytes, "OCR runtime minimum memory");
  const effectiveMemoryBytes = getOcrRuntimeEffectiveMemoryBytes(options);
  if (effectiveMemoryBytes < minimumMemoryBytes) {
    throw new Error(
      `insufficient memory for accurate OCR runtime: ${minimumMemoryBytes} bytes required, ${effectiveMemoryBytes} available; Fast OCR remains available`,
    );
  }
}
