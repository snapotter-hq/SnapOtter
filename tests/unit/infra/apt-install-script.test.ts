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
}

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
    // The mirror swap edits /etc/apt and /var/lib/apt/lists; nothing to do here.
    find: "exit 0",
    mv: "exit 0",
    sleep: "exec /bin/sleep 0.05",
    // The index knows every requested package.
    "apt-cache": "exit 0",
    // Without fuser (exit 127), recover_dpkg can't wait and apt's own lock timeout must.
    fuser: opts.noFuser ? "exit 127" : `[ -e "${lock}" ]`,
    dpkg: `echo "dpkg $*" >> "${calls}"
if [ -e "${lock}" ]; then echo "dpkg: error: dpkg database lock was locked by another process" >&2; exit 2; fi`,
    "apt-get": `echo "apt-get $*" >> "${calls}"
case " $* " in *" update "*) exit 0 ;; esac
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
  return { dir, bin, calls };
}

function runScript(first: FirstInstall, env: Record<string, string> = {}, opts: StubOpts = {}) {
  const { dir, bin, calls } = stubDir(first, opts);
  const res = spawnSync("bash", [SCRIPT], {
    encoding: "utf8",
    timeout: 30_000,
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      PACKAGES: "qpdf ghostscript",
      UPDATE_TIMEOUT: "1",
      INSTALL_TIMEOUT: "1",
      DPKG_LOCK_WAIT: "5",
      ...env,
    },
  });
  return {
    status: res.status,
    output: `${res.stdout}${res.stderr}`,
    installed: existsSync(join(dir, "installed")),
    calls: existsSync(calls) ? readFileSync(calls, "utf8") : "",
  };
}

describe.skipIf(process.platform === "win32")("apt-install action script (#1786)", () => {
  it("installs on the first attempt when the mirror is healthy", () => {
    const run = runScript("succeeds");
    expect(run.status, run.output).toBe(0);
    expect(run.installed).toBe(true);
    expect(run.output).not.toContain("swapping to archive.ubuntu.com");
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
    expect(run.output).not.toContain("swapping to archive.ubuntu.com");
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
    find: "exit 0",
    mv: "exit 0",
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
  return { dir, archives, calls };
}

function runCached(mirror: Mirror, cached: Record<string, string> = {}) {
  const stub = cacheStubDir(mirror, cached);
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
    expect(run.output).not.toContain("swapping to archive.ubuntu.com");
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
    expect(run.output).not.toContain("swapping to archive.ubuntu.com");
    expect(run.githubOutput).toBe("fresh=3\n");
  });

  it("checks the cache against the index after the mirror swap too", () => {
    // The first update can't reach the mirror, the offline install fails (a
    // package isn't cached), and the swapped mirror answers. The tampered
    // qpdf archive must not ride along into that install.
    const run = runCached("down-then-up", { [QPDF]: "sha-tampered", [GS]: "sha-gs" });
    expect(run.status, run.output).toBe(0);
    expect(run.output).toContain("installing from the cached archives failed");
    expect(run.output).toContain("swapping to archive.ubuntu.com");
    expect(run.calls).not.toContain("sha-tampered");
    expect(run.archive(QPDF)).toBe("sha-qpdf-new");
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
