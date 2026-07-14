import { readFileSync } from "node:fs";
import { totalmem } from "node:os";
import { posix } from "node:path";

export const OCR_RUNTIME_MINIMUM_MEMORY_BYTES = 4 * 1024 * 1024 * 1024;

const CGROUP_MEMORY_LIMIT_PATHS = [
  "/sys/fs/cgroup/memory.max",
  "/sys/fs/cgroup/memory/memory.limit_in_bytes",
  "/sys/fs/cgroup/memory.limit_in_bytes",
] as const;
const CGROUP_MEMBERSHIP_RESOLUTION_ATTEMPTS = 3;

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

function parseCgroupLimit(raw: string, zeroIsLimit = false): bigint | null {
  const value = raw.trim();
  if (value === "max" || !/^[0-9]+$/.test(value)) return null;
  const parsed = BigInt(value);
  return parsed > 0n || zeroIsLimit ? parsed : null;
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function hasParentPathSegment(value: string): boolean {
  return value.split("/").includes("..");
}

function decodeMountInfoPath(value: string): string {
  return value.replace(/\\([0-7]{3})/g, (_match, octal: string) =>
    String.fromCharCode(Number.parseInt(octal, 8)),
  );
}

interface MountInfoRecord {
  id: number;
  parentId: number;
  device: string;
  filesystem: string;
  root: string;
  mountPoint: string;
  controllers: Set<string>;
}

interface CgroupMount extends MountInfoRecord {
  filesystem: "cgroup" | "cgroup2";
}

function parseMountInfo(raw: string): MountInfoRecord[] {
  const mounts: MountInfoRecord[] = [];
  for (const line of raw.split("\n")) {
    if (!line) continue;
    const fields = line.split(" ");
    const separator = fields.indexOf("-");
    if (
      separator < 6 ||
      !/^[1-9][0-9]*$/.test(fields[0]) ||
      !/^[1-9][0-9]*$/.test(fields[1]) ||
      !/^[0-9]+:[0-9]+$/.test(fields[2])
    ) {
      throw new Error("unable to resolve the process cgroup memory capacity");
    }
    const id = Number(fields[0]);
    const parentId = Number(fields[1]);
    if (!Number.isSafeInteger(id) || !Number.isSafeInteger(parentId)) {
      throw new Error("unable to resolve the process cgroup memory capacity");
    }
    const filesystem = fields[separator + 1];
    const root = decodeMountInfoPath(fields[3]);
    const decodedMountPoint = decodeMountInfoPath(fields[4]);
    if (!decodedMountPoint.startsWith("/") || hasParentPathSegment(decodedMountPoint)) {
      throw new Error("unable to resolve the process cgroup memory capacity");
    }
    mounts.push({
      id,
      parentId,
      device: fields[2],
      filesystem,
      root,
      mountPoint: posix.normalize(decodedMountPoint),
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

function isStrictPathPrefix(parent: string, child: string): boolean {
  return parent === "/" ? child !== "/" : child.startsWith(`${parent}/`);
}

function pathDepth(value: string): number {
  return value.split("/").filter(Boolean).length;
}

function parseVisibleMounts(raw: string): MountInfoRecord[] {
  const mounts = parseMountInfo(raw);
  const mountsById = new Map<number, MountInfoRecord>();
  for (const mount of mounts) {
    if (mountsById.has(mount.id)) {
      throw new Error("unable to resolve the process cgroup memory capacity");
    }
    mountsById.set(mount.id, mount);
  }

  const parentStates = new Map<number, "visiting" | "visited">();
  const validateParentChain = (mount: MountInfoRecord): void => {
    if (mount.parentId === mount.id) {
      if (mount.mountPoint !== "/") {
        throw new Error("unable to resolve the process cgroup memory capacity");
      }
      parentStates.set(mount.id, "visited");
      return;
    }
    const state = parentStates.get(mount.id);
    if (state === "visiting") {
      throw new Error("unable to resolve the process cgroup memory capacity");
    }
    if (state === "visited") return;
    parentStates.set(mount.id, "visiting");
    const parent = mountsById.get(mount.parentId);
    if (parent) validateParentChain(parent);
    parentStates.set(mount.id, "visited");
  };
  for (const mount of mounts) validateParentChain(mount);

  const coveredIds = new Set<number>();
  for (const mount of mounts) {
    const parent = mountsById.get(mount.parentId);
    if (parent && parent.id !== mount.id && parent.mountPoint === mount.mountPoint) {
      coveredIds.add(parent.id);
    }
  }

  const visibleMounts: MountInfoRecord[] = [];
  const visibleIds = new Set<number>();
  const topMounts = mounts
    .filter((mount) => !coveredIds.has(mount.id))
    .sort((left, right) => pathDepth(left.mountPoint) - pathDepth(right.mountPoint));
  for (const mount of topMounts) {
    let containingParent = mountsById.get(mount.parentId);
    while (containingParent?.mountPoint === mount.mountPoint) {
      if (containingParent.parentId === containingParent.id) {
        containingParent = undefined;
        break;
      }
      containingParent = mountsById.get(containingParent.parentId);
    }

    let longestVisiblePrefix: MountInfoRecord | undefined;
    for (const visibleMount of visibleMounts) {
      if (
        isStrictPathPrefix(visibleMount.mountPoint, mount.mountPoint) &&
        (!longestVisiblePrefix ||
          visibleMount.mountPoint.length > longestVisiblePrefix.mountPoint.length)
      ) {
        longestVisiblePrefix = visibleMount;
      }
    }

    const visible = containingParent
      ? visibleIds.has(containingParent.id) && longestVisiblePrefix?.id === containingParent.id
      : longestVisiblePrefix === undefined;
    if (visible) {
      if (visibleMounts.some((candidate) => candidate.mountPoint === mount.mountPoint)) {
        throw new Error("unable to resolve the process cgroup memory capacity");
      }
      visibleMounts.push(mount);
      visibleIds.add(mount.id);
    }
  }

  return visibleMounts;
}

function isCgroupMount(mount: MountInfoRecord): mount is CgroupMount {
  return mount.filesystem === "cgroup" || mount.filesystem === "cgroup2";
}

function isPathPrefix(parent: string, child: string): boolean {
  return parent === child || isStrictPathPrefix(parent, child);
}

function normalizedAbsolutePath(value: string): string | null {
  if (!value.startsWith("/") || hasParentPathSegment(value)) return null;
  return posix.normalize(value);
}

function hasConsistentCgroupPath(
  selected: CgroupMount,
  path: string,
  visibleMounts: MountInfoRecord[],
): boolean {
  let owner: MountInfoRecord | undefined;
  for (const mount of visibleMounts) {
    if (
      isPathPrefix(mount.mountPoint, path) &&
      (!owner || mount.mountPoint.length > owner.mountPoint.length)
    ) {
      owner = mount;
    }
  }
  if (!owner) return false;
  if (owner.id === selected.id) return true;
  if (
    owner.filesystem !== selected.filesystem ||
    owner.device !== selected.device ||
    !isStrictPathPrefix(selected.mountPoint, owner.mountPoint)
  ) {
    return false;
  }

  const selectedRoot = normalizedAbsolutePath(selected.root);
  const ownerRoot = normalizedAbsolutePath(owner.root);
  if (!selectedRoot || !ownerRoot) return false;
  const relativeMountPoint = posix.relative(selected.mountPoint, owner.mountPoint);
  return ownerRoot === posix.normalize(posix.join(selectedRoot, relativeMountPoint));
}

function validLinuxMembership(fields: RegExpExecArray | null): fields is RegExpExecArray {
  if (fields === null || !fields[3]?.startsWith("/") || hasParentPathSegment(fields[3])) {
    return false;
  }
  const hierarchy = fields[1];
  const controllers = fields[2];
  return hierarchy === "0"
    ? controllers === ""
    : controllers.length > 0 && /^[1-9][0-9]*$/.test(hierarchy);
}

function cgroupProcessPath(mount: CgroupMount, membership: string): string | null {
  if (
    hasParentPathSegment(mount.root) ||
    hasParentPathSegment(mount.mountPoint) ||
    hasParentPathSegment(membership)
  ) {
    return null;
  }
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

function resolveMembershipMemoryLimits(
  readTextFile: (path: string) => string,
  failClosed: boolean,
  membershipRaw: string,
): bigint[] | null {
  const membershipLines = membershipRaw.split("\n").filter(Boolean);
  if (failClosed && membershipLines.length === 0) {
    throw new Error("unable to read the process cgroup memory capacity");
  }
  const parsedMemberships = membershipLines.map((line) => /^([^:]*):([^:]*):(.*)$/.exec(line));
  if (parsedMemberships.some((fields) => fields !== null && hasParentPathSegment(fields[3]))) {
    throw new Error("unable to read the process cgroup memory capacity");
  }
  if (failClosed && parsedMemberships.some((fields) => !validLinuxMembership(fields))) {
    throw new Error("unable to read the process cgroup memory capacity");
  }
  const allMemberships = parsedMemberships
    .filter(
      (fields): fields is RegExpExecArray => fields !== null && fields[3]?.startsWith("/") === true,
    )
    .map(([, hierarchy, controllers, membershipPath]) => ({
      kind: hierarchy === "0" && controllers === "" ? "cgroup2" : "cgroup",
      controllers: new Set(controllers.split(",").filter(Boolean)),
      path: membershipPath,
    }));
  const v1MemoryMemberships = allMemberships.filter(
    (membership) => membership.kind === "cgroup" && membership.controllers.has("memory"),
  );
  const memberships =
    v1MemoryMemberships.length > 0
      ? v1MemoryMemberships
      : allMemberships.filter((membership) => membership.kind === "cgroup2");
  if (memberships.length === 0) return null;

  let mountInfoRaw: string;
  try {
    mountInfoRaw = readTextFile("/proc/self/mountinfo");
  } catch {
    throw new Error("unable to resolve the process cgroup memory capacity");
  }

  const visibleMounts = parseVisibleMounts(mountInfoRaw);
  const mounts = visibleMounts.filter(isCgroupMount);
  const selectedMemberships = memberships.flatMap((membership) => {
    const selected: Array<{ mount: CgroupMount; processPath: string; limitFile: string }> = [];
    for (const mount of mounts) {
      if (
        mount.filesystem !== membership.kind ||
        (mount.filesystem === "cgroup" && !mount.controllers.has("memory"))
      ) {
        continue;
      }
      const processPath = cgroupProcessPath(mount, membership.path);
      if (!processPath) continue;
      selected.push({
        mount,
        processPath,
        limitFile: mount.filesystem === "cgroup2" ? "memory.max" : "memory.limit_in_bytes",
      });
    }
    if (selected.length === 0) {
      throw new Error("unable to resolve the process cgroup memory capacity");
    }
    return selected;
  });

  const limits: bigint[] = [];
  for (const selected of selectedMemberships) {
    if (!hasConsistentCgroupPath(selected.mount, selected.processPath, visibleMounts)) {
      throw new Error("unable to resolve the process cgroup memory capacity");
    }
    let current = selected.processPath;
    while (true) {
      let raw: string | undefined;
      const limitPath = posix.join(current, selected.limitFile);
      if (!hasConsistentCgroupPath(selected.mount, limitPath, visibleMounts)) {
        throw new Error("unable to resolve the process cgroup memory capacity");
      }
      try {
        raw = readTextFile(limitPath);
      } catch (error) {
        const absentV2Limit =
          selected.mount.filesystem === "cgroup2" && hasErrorCode(error, "ENOENT");
        if (absentV2Limit) {
          const controllersPath = posix.join(current, "cgroup.controllers");
          if (!hasConsistentCgroupPath(selected.mount, controllersPath, visibleMounts)) {
            throw new Error("unable to resolve the process cgroup memory capacity");
          }
          try {
            readTextFile(controllersPath);
          } catch {
            throw new Error("unable to read the process cgroup memory capacity");
          }
        } else {
          throw new Error("unable to read the process cgroup memory capacity");
        }
      }
      if (raw !== undefined) {
        const normalized = raw.trim();
        if (normalized !== "max" && !/^[0-9]+$/.test(normalized)) {
          throw new Error("malformed cgroup memory capacity");
        }
        const limit = parseCgroupLimit(raw, true);
        if (limit !== null) limits.push(limit);
      }
      if (current === selected.mount.mountPoint) break;
      const parent = posix.dirname(current);
      if (parent === current || !parent.startsWith(selected.mount.mountPoint)) break;
      current = parent;
    }
  }
  return limits;
}

function membershipMemoryLimits(
  readTextFile: (path: string) => string,
  failClosed: boolean,
): bigint[] | null {
  for (let attempt = 0; attempt < CGROUP_MEMBERSHIP_RESOLUTION_ATTEMPTS; attempt += 1) {
    let membershipRaw: string;
    try {
      membershipRaw = readTextFile("/proc/self/cgroup");
    } catch {
      if (failClosed || attempt > 0) {
        throw new Error("unable to read the process cgroup memory capacity");
      }
      return null;
    }

    let limits: bigint[] | null;
    try {
      limits = resolveMembershipMemoryLimits(readTextFile, failClosed, membershipRaw);
    } catch (error) {
      let failedMembershipRaw: string;
      try {
        failedMembershipRaw = readTextFile("/proc/self/cgroup");
      } catch {
        throw new Error("unable to read the process cgroup memory capacity");
      }
      if (failedMembershipRaw === membershipRaw) throw error;
      continue;
    }
    let confirmedMembershipRaw: string;
    try {
      confirmedMembershipRaw = readTextFile("/proc/self/cgroup");
    } catch {
      throw new Error("unable to read the process cgroup memory capacity");
    }
    if (confirmedMembershipRaw === membershipRaw) return limits;
  }
  throw new Error("unable to read a stable process cgroup memory capacity");
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
  const hostPlatform = options.hostPlatform ?? process.platform;
  const isLinux = hostPlatform === "linux";
  const membershipLimits = membershipMemoryLimits(readTextFile, isLinux);
  if (membershipLimits === null) {
    for (const path of CGROUP_MEMORY_LIMIT_PATHS) {
      try {
        const limit = parseCgroupLimit(readTextFile(path), isLinux);
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
