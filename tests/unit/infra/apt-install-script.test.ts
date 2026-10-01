// Runs .github/actions/apt-install/install.sh against stubbed sudo, timeout,
// apt-get, dpkg and fuser, so the retry logic is exercised without root or a
// network. The stubs share one lock file standing in for /var/lib/dpkg/lock.
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
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

function stubDir(first: FirstInstall, opts: { noFuser?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "apt-install-"));
  const bin = join(dir, "bin");
  const lock = join(dir, "dpkg.lock");
  const calls = join(dir, "calls.log");
  const stubs: Record<string, string> = {
    sudo: 'exec "$@"',
    // timeout -k <grace> <budget> cmd...: run cmd as-is; the stubs decide its outcome.
    timeout: 'shift 3; exec "$@"',
    // The mirror swap edits /etc/apt and /var/lib/apt/lists; nothing to do here.
    find: "exit 0",
    mv: "exit 0",
    sleep: "exec /bin/sleep 0.05",
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

function runScript(
  first: FirstInstall,
  env: Record<string, string> = {},
  opts: { noFuser?: boolean } = {},
) {
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
