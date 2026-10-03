// Runs .github/actions/apt-install/install.sh against stubbed sudo, timeout,
// apt-get, dpkg and fuser, so the retry logic is exercised without root or a
// network. The stubs share one lock file standing in for /var/lib/dpkg/lock.
import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = resolve(".github/actions/apt-install/install.sh");

/** Behaviour of the first `apt-get install` call (the Azure mirror attempt). */
type FirstInstall =
  | "succeeds"
  | "times-out-leaving-dpkg"
  | "times-out-leaving-hung-dpkg"
  | "every-attempt-times-out-leaving-dpkg";

interface StubOpts {
  noFuser?: boolean;
  /** Something else (unattended-upgrades on a fresh runner) holds the dpkg lock for this long when the job starts. */
  lockedAtStartSeconds?: number;
  /** Every `apt-get update` exits with this code (124: timeout killed it). */
  updateExit?: number;
  /** Exit code per `apt-get update` call in order; the last one repeats. */
  updateExitSeq?: number[];
  /** Every update after the first exits 0 but reports the mirror unreachable, as real apt does. */
  updateUnreachableAfterFirst?: boolean;
  /** `apt-cache` can't resolve the requested packages, as after an index that never arrived. */
  indexUnready?: boolean;
}

/**
 * Scratch stand-ins for /etc/apt and /var/lib/apt/lists, so the mirror swap
 * edits files the test owns instead of the machine's real apt config.
 */
function aptDirs(dir: string) {
  const etc = join(dir, "etc-apt");
  const lists = join(dir, "apt-lists");
  mkdirSync(join(etc, "sources.list.d"), { recursive: true });
  mkdirSync(lists);
  return { etc, lists };
}

/** Writes a runner's apt config into the scratch dirs before the script runs. */
type AptLayout = (etc: string, lists: string) => void;

function stubDir(first: FirstInstall, opts: StubOpts = {}) {
  const dir = mkdtempSync(join(tmpdir(), "apt-install-"));
  const bin = join(dir, "bin");
  const lock = join(dir, "dpkg.lock");
  const calls = join(dir, "calls.log");
  if (opts.lockedAtStartSeconds) {
    writeFileSync(lock, "");
    spawn("/bin/sh", ["-c", `/bin/sleep ${opts.lockedAtStartSeconds}; rm -f "${lock}"`], {
      detached: true,
      stdio: "ignore",
    }).unref();
  }
  const stubs: Record<string, string> = {
    sudo: 'exec "$@"',
    // timeout -k <grace> <budget> cmd...: run cmd as-is; the stubs decide its outcome.
    timeout: 'shift 3; exec "$@"',
    sleep: "exec /bin/sleep 0.05",
    // The index knows every requested package, unless the test says otherwise.
    "apt-cache": opts.indexUnready ? "exit 1" : "exit 0",
    // Without fuser (exit 127), recover_dpkg can't wait and apt's own lock timeout must.
    fuser: opts.noFuser ? "exit 127" : `[ -e "${lock}" ]`,
    dpkg: `echo "dpkg $*" >> "${calls}"
if [ -e "${lock}" ]; then echo "dpkg: error: dpkg database lock was locked by another process" >&2; exit 2; fi`,
    "apt-get": `echo "apt-get $*" >> "${calls}"
case " $* " in *" update "*)
  u=$(grep -c ' update ' "${calls}")
  ${opts.updateUnreachableAfterFirst ? `[ "$u" -gt 1 ] && echo "W: Failed to fetch mirror+file:/etc/apt/apt-mirrors.txt/dists/noble/InRelease  Could not connect to archive.ubuntu.com:80 (10.255.255.1), connection timed out" >&2` : ":"}
  code=${opts.updateExit ?? 0}
  ${(opts.updateExitSeq ?? []).map((c, i) => `[ "$u" -eq ${i + 1} ] && code=${c}`).join("; ") || ":"}
  exit "$code" ;;
esac
n=$(grep -c "^apt-get .*install" "${calls}")
if [ "${first}" = every-attempt-times-out-leaving-dpkg ]; then
  # Each attempt's orphan holds the lock a bit under half the budget.
  touch "${lock}"
  ( /bin/sleep 2.5; rm -f "${lock}" ) >/dev/null 2>&1 &
  exit 124
fi
if [ "$n" = 1 ] && [ "${first}" != succeeds ]; then
  # timeout killed apt-get mid-configure; the dpkg it started carries on.
  touch "${lock}"
  if [ "${first}" = times-out-leaving-dpkg ]; then
    # Longer than three instant re-rolls take, shorter than DPKG_LOCK_WAIT.
    ( /bin/sleep 3; rm -f "${lock}" ) >/dev/null 2>&1 &
  fi
  exit 124
fi
wait_s=0
case "$*" in *DPkg::Lock::Timeout=*) wait_s=$(echo "$*" | sed -E 's/.*DPkg::Lock::Timeout=([0-9]+).*/\\1/') ;; esac
end=$(( $(date +%s) + wait_s ))
while [ -e "${lock}" ]; do
  if [ "$(date +%s)" -ge "$end" ]; then
    echo "E: Could not get lock /var/lib/dpkg/lock. It is held by process 3674 (dpkg)" >&2
    exit 100
  fi
  /bin/sleep 0.05
done
touch "${dir}/installed"`,
  };
  mkdirSync(bin);
  for (const [name, body] of Object.entries(stubs)) {
    const path = join(bin, name);
    writeFileSync(path, `#!/bin/bash\n${body}\n`, { flag: "w" });
    chmodSync(path, 0o755);
  }
  return { dir, bin, calls, ...aptDirs(dir) };
}

function runScript(
  first: FirstInstall,
  env: Record<string, string> = {},
  opts: StubOpts = {},
  layout?: AptLayout,
) {
  const { dir, bin, calls, etc, lists } = stubDir(first, opts);
  layout?.(etc, lists);
  const res = spawnSync("bash", [SCRIPT], {
    encoding: "utf8",
    timeout: 30_000,
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      PACKAGES: "qpdf ghostscript",
      UPDATE_TIMEOUT: "1",
      INSTALL_TIMEOUT: "1",
      DPKG_LOCK_WAIT: "5",
      APT_ETC_DIR: etc,
      APT_LISTS_DIR: lists,
      ...env,
    },
  });
  return {
    status: res.status,
    output: `${res.stdout}${res.stderr}`,
    installed: existsSync(join(dir, "installed")),
    calls: existsSync(calls) ? readFileSync(calls, "utf8") : "",
    etc,
    lists,
  };
}

describe.skipIf(process.platform === "win32")("apt-install action script (#1786)", () => {
  it("installs on the first attempt when the mirror is healthy", () => {
    const run = runScript("succeeds");
    expect(run.status, run.output).toBe(0);
    expect(run.installed).toBe(true);
    expect(run.output).not.toContain("apt via the Azure mirror stalled or failed");
  });

  it("waits for the dpkg a timed-out install left behind instead of failing every re-roll", () => {
    // On main this failed all three re-rolls in under a second on
    // "Could not get lock" while the orphaned dpkg was still configuring.
    const run = runScript("times-out-leaving-dpkg");
    expect(run.status, run.output).toBe(0);
    expect(run.installed).toBe(true);
    expect(run.output).not.toContain("Could not get lock");
  });

  it("waits for a dpkg lock already held when the job starts, on the first attempt", () => {
    // The "Could not get lock /var/lib/dpkg/lock" signature on a fresh runner,
    // where unattended-upgrades can still be running when the job begins.
    const run = runScript("succeeds", {}, { lockedAtStartSeconds: 2 });
    expect(run.status, run.output).toBe(0);
    expect(run.installed).toBe(true);
    expect(run.output).not.toContain("Could not get lock");
    expect(run.output).not.toContain("apt via the Azure mirror stalled or failed");
  });

  it("still waits through apt's lock timeout when fuser isn't installed", () => {
    const run = runScript("times-out-leaving-dpkg", {}, { noFuser: true });
    expect(run.status, run.output).toBe(0);
    expect(run.installed).toBe(true);
  });

  it("spends one lock-wait budget across all re-rolls, not one per re-roll", () => {
    // Every attempt leaves a dpkg holding the lock for 2.5s against a 4s
    // budget. bash's SECONDS ticks whole seconds, so a per-call deadline
    // allows 3-4s and never runs out; a shared one has at most 1.5s left for
    // the second wait.
    const run = runScript("every-attempt-times-out-leaving-dpkg", { DPKG_LOCK_WAIT: "4" });
    expect(run.status, run.output).toBe(1);
    expect(run.output).toContain("dpkg still holds its lock");
  });

  it("still gives up, bounded, when the dpkg holding the lock never finishes", () => {
    const run = runScript("times-out-leaving-hung-dpkg", { DPKG_LOCK_WAIT: "1" });
    expect(run.status, run.output).toBe(1);
    expect(run.installed).toBe(false);
    expect(run.output).toContain("re-roll 3/3");
  });
});

/** The warning install.sh prints when the post-swap refresh leaves no usable index (#1971). */
const NO_USABLE_INDEX = "no usable apt index after the mirror swap";

describe.skipIf(process.platform === "win32")(
  "apt-install when every index refresh fails (#1971)",
  () => {
    it("still installs when both post-swap updates time out", () => {
      // On main, set -e ended the script on the second post-swap update's 124,
      // so no install ran after the swap.
      const run = runScript("succeeds", {}, { updateExit: 124 });
      expect(run.status, run.output).toBe(0);
      expect(run.installed).toBe(true);
      expect(run.output).toContain(NO_USABLE_INDEX);
    });

    it("warns when both post-swap updates exit 0 without reaching the mirror", () => {
      // apt-get update exits 0 when it only couldn't reach a mirror (#1801),
      // so the exit code alone can't tell this apart from a good refresh.
      const run = runScript(
        "succeeds",
        {},
        { updateExitSeq: [124, 0, 0], updateUnreachableAfterFirst: true },
        (etc) => {
          writeFileSync(
            join(etc, "sources.list.d", "ubuntu.sources"),
            "# Ubuntu sources\nTypes: deb\nURIs: mirror+file:/etc/apt/apt-mirrors.txt\n",
          );
        },
      );
      expect(run.status, run.output).toBe(0);
      expect(run.installed).toBe(true);
      expect(run.output).toContain(NO_USABLE_INDEX);
    });

    it("warns when the refreshes leave an index that can't resolve the packages", () => {
      // The second refresh answered, so only the index itself says no. The
      // re-rolls would otherwise fail with no hint that downloads aren't the
      // problem.
      const run = runScript("succeeds", {}, { updateExitSeq: [0, 124, 0], indexUnready: true });
      expect(run.status, run.output).toBe(0);
      expect(run.installed).toBe(true);
      expect(run.output).toContain(NO_USABLE_INDEX);
    });

    it("exits 1 after three re-rolls, not 124, when the installs fail too", () => {
      const run = runScript(
        "times-out-leaving-hung-dpkg",
        { DPKG_LOCK_WAIT: "1" },
        { updateExit: 124 },
      );
      expect(run.status, run.output).toBe(1);
      expect(run.installed).toBe(false);
      expect(run.output).toContain("re-roll 1/3");
      expect(run.output).toContain("re-roll 3/3");
    });
  },
);

// The .deb archive cache (#1801). A stub mirror serves an index of
// `name version sha` lines; a stub .deb's "SHA256" is simply its content, so
// sha256sum is stubbed to print the file's text. apt-get takes a package from
// the archive dir when a file of the right name is there (real apt only checks
// the size), otherwise downloads it, or fails when the mirror is down.
const INDEX = [
  "qpdf 11.9.0-1 sha-qpdf-new",
  "ghostscript 10.02.1-1 sha-gs",
  // apt writes the epoch's ':' as %3a in the archive's filename.
  "libx11-6 2:1.8.7-1 sha-x11",
];
const QPDF = "qpdf_11.9.0-1_amd64.deb";
const GS = "ghostscript_10.02.1-1_amd64.deb";
const X11 = "libx11-6_2%3a1.8.7-1_amd64.deb";
const WARM = { [QPDF]: "sha-qpdf-new", [GS]: "sha-gs", [X11]: "sha-x11" };

/**
 * up: healthy. down: every Ubuntu fetch fails (the index files from before
 * stay usable, as apt keeps them). down-then-up: only the first update fails.
 * partial: the security host's index fails, everything else works.
 */
type Mirror = "up" | "down" | "down-then-up" | "partial";

function cacheStubDir(mirror: Mirror, cached: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "apt-cache-"));
  const bin = join(dir, "bin");
  const archives = join(dir, "archives");
  const calls = join(dir, "calls.log");
  const status = join(dir, "status");
  const index = join(dir, "index");
  mkdirSync(archives);
  for (const [name, content] of Object.entries(cached)) {
    writeFileSync(join(archives, name), content);
  }
  writeFileSync(index, `${INDEX.join("\n")}\n`);
  writeFileSync(status, "");
  writeFileSync(calls, "");
  writeFileSync(
    join(dir, "ubuntu.sources"),
    // GitHub's ubuntu24 runners name a mirror list rather than a host.
    "# Ubuntu sources\nTypes: deb\nURIs: mirror+file:/etc/apt/apt-mirrors.txt\n\nTypes: deb\nURIs: http://security.ubuntu.com/ubuntu/\n",
  );
  // Whether the mirror answers right now: "down-then-up" recovers once the
  // first update has been tried.
  const reachable = `{ [ "${mirror}" = up ] || [ "${mirror}" = partial ] || { [ "${mirror}" = down-then-up ] && [ "$(grep -c ' update ' "${calls}")" -gt 1 ]; }; }`;
  const stubs: Record<string, string> = {
    sudo: 'exec "$@"',
    timeout: 'shift 3; exec "$@"',
    sleep: "exec /bin/sleep 0.05",
    fuser: "exit 1",
    dpkg: `echo "dpkg $*" >> "${calls}"`,
    sha256sum: 'for f in "$@"; do printf "%s  %s\\n" "$(cat "$f")" "$f"; done',
    "dpkg-query": `cat "${status}"`,
    "apt-cache": `shift
rc=0
for n in "$@"; do
  case "$n" in -*) continue ;; esac
  if grep -q "^$n " "${index}"; then
    grep "^$n " "${index}" | while read -r p v s; do printf "Package: %s\\nVersion: %s\\nSHA256: %s\\n\\n" "$p" "$v" "$s"; done
  else
    echo "E: No packages found for $n" >&2; rc=100
  fi
done
exit $rc`,
    "apt-get": `echo "apt-get $*" >> "${calls}"
case " $* " in *" update "*)
  # Real apt: an unreachable mirror is a warning, and the exit code is 0. A
  # third-party source on the runner failing must not count against Ubuntu.
  echo "W: Failed to fetch https://packages.microsoft.com/ubuntu/24.04/prod/dists/noble/InRelease  Could not connect" >&2
  [ "${mirror}" = partial ] && echo "W: Failed to fetch http://security.ubuntu.com/ubuntu/dists/noble-security/InRelease  Could not connect" >&2
  ${reachable} && exit 0
  echo "W: Failed to fetch mirror+file:/etc/apt/apt-mirrors.txt/dists/noble/InRelease  Could not connect to azure.archive.ubuntu.com:80 (10.255.255.1), connection timed out" >&2
  echo "W: Some index files failed to download. They have been ignored, or old ones used instead." >&2
  exit 0 ;;
esac
adir=$(echo "$*" | sed -nE 's/.*Dir::Cache::Archives=([^ ]+).*/\\1/p')
offline=0; case " $* " in *" --no-download "*) offline=1 ;; esac
seen=0; pkgs=""; locals=""
for a in "$@"; do
  if [ "$seen" = 1 ]; then
    case "$a" in -*) ;; /*|./*) locals="$locals $a" ;; *) pkgs="$pkgs $a" ;; esac
  fi
  [ "$a" = install ] && seen=1
done
mkdir -p "$adir/partial"; touch "$adir/lock"
for p in $pkgs; do
  if [ "$offline" = 1 ]; then
    hit=""
    for l in $locals; do case "\${l##*/}" in "\${p}_"*) hit="$l" ;; esac; done
    if [ -z "$hit" ]; then echo "E: Can't find a source to download version of $p" >&2; exit 100; fi
    b="\${hit##*/}"; b="\${b%.deb}"; echo "$b" | sed 's/%3a/:/g' >> "${status}"
    echo "offline $p" >> "${calls}"
    continue
  fi
  line=$(grep "^$p " "${index}") || { echo "E: Unable to locate package $p" >&2; exit 100; }
  set -- $line; v=$2; s=$3
  f="$adir/\${p}_$(echo "$v" | sed 's/:/%3a/g')_amd64.deb"
  if [ -e "$f" ]; then
    echo "cached $p $(cat "$f")" >> "${calls}"
  elif ${reachable}; then
    printf "%s" "$s" > "$f"; echo "downloaded $p" >> "${calls}"
  else
    echo "E: Failed to fetch $p" >&2; exit 100
  fi
  echo "\${p}_\${v}_amd64" >> "${status}"
done`,
  };
  mkdirSync(bin);
  for (const [name, body] of Object.entries(stubs)) {
    const path = join(bin, name);
    writeFileSync(path, `#!/bin/bash\n${body}\n`);
    chmodSync(path, 0o755);
  }
  return { dir, archives, calls, ...aptDirs(dir) };
}

function runCached(mirror: Mirror, cached: Record<string, string> = {}, layout?: AptLayout) {
  const stub = cacheStubDir(mirror, cached);
  layout?.(stub.etc, stub.lists);
  const output = join(stub.dir, "github_output");
  writeFileSync(output, "");
  const res = spawnSync("bash", [SCRIPT], {
    encoding: "utf8",
    timeout: 30_000,
    env: {
      PATH: `${join(stub.dir, "bin")}:${process.env.PATH}`,
      PACKAGES: "qpdf ghostscript libx11-6",
      UPDATE_TIMEOUT: "1",
      INSTALL_TIMEOUT: "1",
      DPKG_LOCK_WAIT: "1",
      APT_ARCHIVE_DIR: stub.archives,
      GITHUB_OUTPUT: output,
      UBUNTU_SOURCES: join(stub.dir, "ubuntu.sources"),
      APT_ETC_DIR: stub.etc,
      APT_LISTS_DIR: stub.lists,
    },
  });
  const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
  return {
    status: res.status,
    output: `${res.stdout}${res.stderr}`,
    calls: read(stub.calls),
    archives: readdirSync(stub.archives).sort(),
    archive: (name: string) => read(join(stub.archives, name)),
    githubOutput: read(output),
    etc: stub.etc,
  };
}

describe.skipIf(process.platform === "win32")("apt-install .deb archive cache (#1801)", () => {
  it("on a miss, downloads into the archive dir and leaves only installed .debs to save", () => {
    const run = runCached("up");
    expect(run.status, run.output).toBe(0);
    expect(run.calls).toContain("downloaded qpdf");
    expect(run.calls).toContain("downloaded libx11-6");
    expect(run.calls).toContain("Dir::Cache::Archives=");
    // apt's own partial/ and lock must not end up in the saved cache.
    expect(run.archives).toEqual([GS, X11, QPDF]);
    expect(run.githubOutput).toBe("fresh=3\n");
  });

  it("on a hit, installs from the cache without downloading, and asks for no save", () => {
    const run = runCached("up", WARM);
    expect(run.status, run.output).toBe(0);
    expect(run.calls).not.toContain("downloaded");
    expect(run.calls).toContain("cached qpdf sha-qpdf-new");
    expect(run.calls).toContain("cached libx11-6 sha-x11");
    expect(run.output).toContain("3 of 3 cached .deb archives match the index, 0 dropped");
    expect(run.archives).toEqual([GS, X11, QPDF]);
    expect(run.githubOutput).toBe("fresh=0\n");
  });

  it("drops a cached .deb whose version the index no longer carries, fetches the new one, and saves", () => {
    const run = runCached("up", {
      "qpdf_11.8.0-1_amd64.deb": "sha-qpdf-old",
      [GS]: "sha-gs",
      [X11]: "sha-x11",
    });
    expect(run.status, run.output).toBe(0);
    expect(run.calls).toContain("downloaded qpdf");
    expect(run.calls).toContain("cached ghostscript");
    expect(run.archives).toEqual([GS, X11, QPDF]);
    expect(run.githubOutput).toBe("fresh=1\n");
  });

  it("never installs a cached .deb whose hash isn't in the signed index", () => {
    // Right filename and (for real apt) right size, wrong bytes: apt alone
    // would take it from the archive dir without checking the hash.
    const run = runCached("up", { ...WARM, [QPDF]: "sha-tampered" });
    expect(run.status, run.output).toBe(0);
    expect(run.output).toContain("2 of 3 cached .deb archives match the index, 1 dropped");
    expect(run.calls).not.toContain("sha-tampered");
    expect(run.calls).toContain("downloaded qpdf");
    expect(run.archive(QPDF)).toBe("sha-qpdf-new");
    // Same filename as the bad copy, but new to the cache: save the good one.
    expect(run.githubOutput).toBe("fresh=1\n");
  });

  it("installs from the cache with no network when the mirror is unreachable", () => {
    // apt-get update exits 0 here, as real apt does; only its warning says
    // the mirror was never reached.
    const run = runCached("down", WARM);
    expect(run.status, run.output).toBe(0);
    expect(run.output).toContain("installing the 3 cached .deb archives without the network");
    expect(run.calls).toMatch(/apt-get .*install .*--no-download/);
    expect(run.calls).toContain("offline qpdf");
    expect(run.calls).toContain("offline libx11-6");
    expect(run.output).not.toContain("apt via the Azure mirror stalled or failed");
    // Nothing that bypassed the index check is ever saved.
    expect(run.githubOutput).toBe("fresh=0\n");
    // One more bounded update, so later steps that query apt get an index if
    // the canonical archive answers; here it doesn't, which only warns.
    expect(run.calls.match(/ update -qq/g)).toHaveLength(2);
    expect(run.output).toContain("no fresh apt index after the offline install");
  });

  it("goes offline when one Ubuntu host fails and the cache can cover it", () => {
    const run = runCached("partial", WARM);
    expect(run.status, run.output).toBe(0);
    expect(run.calls).toContain("offline qpdf");
    expect(run.calls).not.toContain("downloaded");
    expect(run.githubOutput).toBe("fresh=0\n");
  });

  it("with nothing cached, installs through a partly failed update as before", () => {
    const run = runCached("partial");
    expect(run.status, run.output).toBe(0);
    expect(run.calls).toContain("downloaded qpdf");
    expect(run.output).not.toContain("apt via the Azure mirror stalled or failed");
    expect(run.githubOutput).toBe("fresh=3\n");
  });

  it("checks the cache against the index after the mirror swap too", () => {
    // The first update can't reach the mirror, the offline install fails (a
    // package isn't cached), and the swapped mirror answers. The tampered
    // qpdf archive must not ride along into that install.
    const run = runCached("down-then-up", { [QPDF]: "sha-tampered", [GS]: "sha-gs" });
    expect(run.status, run.output).toBe(0);
    expect(run.output).toContain("installing from the cached archives failed");
    expect(run.output).toContain("apt via the Azure mirror stalled or failed");
    expect(run.calls).not.toContain("sha-tampered");
    expect(run.archive(QPDF)).toBe("sha-qpdf-new");
  });

  it("checks the cache against a stale index when both post-swap refreshes find nothing", () => {
    // Every job has an archive dir (#1801), and since #1971 the re-rolls and
    // verify_cached_debs run even when the swap bought no index at all. The
    // tampered archive must still be dropped rather than installed.
    const run = runCached("down", { [QPDF]: "sha-tampered", [GS]: "sha-gs" });
    expect(run.status, run.output).toBe(1);
    expect(run.output).toContain("installing from the cached archives failed");
    expect(run.output).toContain(NO_USABLE_INDEX);
    expect(run.output).toContain("re-roll 3/3");
    expect(run.calls).not.toContain("sha-tampered");
    expect(run.archive(QPDF)).toBe("");
  });

  it("still fails, bounded, when the mirror is down and nothing is cached", () => {
    const run = runCached("down");
    expect(run.status, run.output).toBe(1);
    expect(run.output).toContain("re-roll 3/3");
    expect(run.calls).not.toContain("--no-download");
    expect(run.githubOutput).toBe("");
  });

  it("prunes cached .debs this install didn't use before the cache is saved", () => {
    // A restore from an older runner image can carry archives no longer
    // needed. The index doesn't list libfoo1, so the check leaves it alone.
    const run = runCached("up", { ...WARM, "libfoo1_1.0-1_amd64.deb": "sha-foo" });
    expect(run.status, run.output).toBe(0);
    expect(run.output).toContain("1 not in it");
    expect(run.archives).toEqual([GS, X11, QPDF]);
  });
});

// The mirror swap (#1808). GitHub's ubuntu-24.04 and ubuntu-22.04 runners
// don't name the Azure host in their sources: those say
// mirror+file:/etc/apt/apt-mirrors.txt, and that file (copied below as seen on
// a runner) lists the hosts apt tries in order. Sources that name the host
// directly, as the runners did when the swap was written (#877), leave index
// files named after it.
const AZURE = "http://azure.archive.ubuntu.com/ubuntu/";
const MIRROR_LIST = `${AZURE}\tpriority:1\nhttps://archive.ubuntu.com/ubuntu/\tpriority:2\nhttps://security.ubuntu.com/ubuntu/\tpriority:3\n`;
const UBUNTU24_SOURCES =
  "Types: deb\nURIs: mirror+file:/etc/apt/apt-mirrors.txt\nSuites: noble noble-updates\nComponents: main universe\n";
const MICROSOFT = "deb [arch=amd64] https://packages.microsoft.com/ubuntu/24.04/prod noble main\n";

const mirrorListRunner: AptLayout = (etc) => {
  writeFileSync(join(etc, "apt-mirrors.txt"), MIRROR_LIST);
  writeFileSync(join(etc, "sources.list.d", "ubuntu.sources"), UBUNTU24_SOURCES);
  writeFileSync(join(etc, "sources.list.d", "microsoft-prod.list"), MICROSOFT);
  writeFileSync(join(etc, "sources.list"), "# Ubuntu sources have moved to ubuntu.sources\n");
};

// Both source formats naming the host: classic sources.list and a deb822
// file in sources.list.d.
const DEB822_AZURE = `Types: deb\nURIs: ${AZURE}\nSuites: noble-backports\nComponents: main\n`;
const hostInSources: AptLayout = (etc, lists) => {
  writeFileSync(
    join(etc, "sources.list"),
    `deb ${AZURE} jammy main restricted\ndeb ${AZURE} jammy-updates main restricted\n`,
  );
  writeFileSync(join(etc, "sources.list.d", "backports.sources"), DEB822_AZURE);
  writeFileSync(join(etc, "sources.list.d", "microsoft-prod.list"), MICROSOFT);
  writeFileSync(join(lists, "azure.archive.ubuntu.com_ubuntu_dists_jammy_InRelease"), "index");
};

describe.skipIf(process.platform === "win32")("apt-install mirror swap (#1808)", () => {
  it("takes the Azure mirror out of apt-mirrors.txt on runners whose sources name the mirror list", () => {
    // On main the swap only edited sources files, found no Azure host there,
    // and every re-roll went back through the same mirror list.
    const run = runScript("times-out-leaving-dpkg", {}, {}, mirrorListRunner);
    expect(run.status, run.output).toBe(0);
    const mirrors = readFileSync(join(run.etc, "apt-mirrors.txt"), "utf8");
    expect(mirrors).not.toContain("azure.archive.ubuntu.com");
    // Each entry keeps its place and its metadata, so apt's order holds.
    expect(mirrors.split("\n")[0]).toBe("http://archive.ubuntu.com/ubuntu/\tpriority:1");
    expect(mirrors).toContain("https://security.ubuntu.com/ubuntu/\tpriority:3");
    expect(run.output).toContain("replaced azure.archive.ubuntu.com with archive.ubuntu.com in");
    expect(run.output).toContain("apt-mirrors.txt");
    // The sources keep naming the list, so the index files apt keyed by it stay valid.
    expect(readFileSync(join(run.etc, "sources.list.d", "ubuntu.sources"), "utf8")).toBe(
      UBUNTU24_SOURCES,
    );
    expect(readFileSync(join(run.etc, "sources.list.d", "microsoft-prod.list"), "utf8")).toBe(
      MICROSOFT,
    );
  });

  it("still repoints sources files and relabels their index files where the host is named directly", () => {
    const run = runScript("times-out-leaving-dpkg", {}, {}, (etc, lists) => {
      hostInSources(etc, lists);
      chmodSync(join(etc, "sources.list"), 0o640);
    });
    expect(run.status, run.output).toBe(0);
    const sources = readFileSync(join(run.etc, "sources.list"), "utf8");
    expect(sources).not.toContain("azure.archive.ubuntu.com");
    expect(sources).toContain(
      "deb http://archive.ubuntu.com/ubuntu/ jammy-updates main restricted",
    );
    // Rewritten in place, so the file keeps its mode.
    expect(statSync(join(run.etc, "sources.list")).mode & 0o777).toBe(0o640);
    expect(readFileSync(join(run.etc, "sources.list.d", "backports.sources"), "utf8")).toBe(
      DEB822_AZURE.replace("azure.archive.ubuntu.com", "archive.ubuntu.com"),
    );
    expect(run.output).toContain("backports.sources");
    expect(readdirSync(run.lists)).toEqual(["archive.ubuntu.com_ubuntu_dists_jammy_InRelease"]);
    expect(readFileSync(join(run.etc, "sources.list.d", "microsoft-prod.list"), "utf8")).toBe(
      MICROSOFT,
    );
  });

  // Root ignores file modes, so the unwritable file only fails the rewrite
  // for an ordinary user.
  it.skipIf(process.getuid?.() === 0)(
    "warns about a sources file it can't rewrite and leaves its index files named for it",
    () => {
      const run = runScript("times-out-leaving-dpkg", {}, {}, (etc, lists) => {
        hostInSources(etc, lists);
        chmodSync(join(etc, "sources.list"), 0o444);
        chmodSync(join(etc, "sources.list.d", "backports.sources"), 0o444);
      });
      expect(run.status, run.output).toBe(0);
      expect(run.output).toContain("could not rewrite");
      expect(run.output).toContain("no apt source or mirror list names azure.archive.ubuntu.com");
      expect(readFileSync(join(run.etc, "sources.list"), "utf8")).toContain(
        "azure.archive.ubuntu.com",
      );
      // The sources still name the Azure host, so its index files must keep its name.
      expect(readdirSync(run.lists)).toEqual([
        "azure.archive.ubuntu.com_ubuntu_dists_jammy_InRelease",
      ]);
    },
  );

  it("swaps the mirror list before the index refresh that follows an offline install", () => {
    const run = runCached("down", WARM, mirrorListRunner);
    expect(run.status, run.output).toBe(0);
    expect(run.calls).toContain("offline qpdf");
    expect(readFileSync(join(run.etc, "apt-mirrors.txt"), "utf8")).not.toContain(
      "azure.archive.ubuntu.com",
    );
    expect(run.output).toContain("replaced azure.archive.ubuntu.com with archive.ubuntu.com in");
  });

  it("says so, instead of claiming a swap, when nothing names the Azure mirror", () => {
    const run = runScript("times-out-leaving-dpkg", {}, {}, (etc) => {
      writeFileSync(
        join(etc, "sources.list"),
        "deb http://archive.ubuntu.com/ubuntu/ noble main\n",
      );
    });
    expect(run.status, run.output).toBe(0);
    expect(run.output).toContain("apt via the Azure mirror stalled or failed");
    expect(run.output).toContain("no apt source or mirror list names azure.archive.ubuntu.com");
    expect(run.output).not.toContain("replaced azure.archive.ubuntu.com");
  });

  it("leaves apt's config alone when the first install succeeds", () => {
    const run = runScript("succeeds", {}, {}, mirrorListRunner);
    expect(run.status, run.output).toBe(0);
    expect(readFileSync(join(run.etc, "apt-mirrors.txt"), "utf8")).toBe(MIRROR_LIST);
  });
});
