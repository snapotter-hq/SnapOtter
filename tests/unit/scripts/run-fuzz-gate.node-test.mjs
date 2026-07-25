import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  acquireFuzzLock,
  buildFuzzEnvironment,
  fuzzLockPath,
  parseFuzzArguments,
} from "../../../scripts/run-fuzz-gate.mjs";

test("parses canonical fuzz runner arguments", () => {
  assert.deepEqual(parseFuzzArguments(["--runs", "50", "--seed=1234"]), {
    help: false,
    runs: 50,
    seed: 1234,
  });
  assert.deepEqual(parseFuzzArguments(["--help"]), {
    help: true,
    runs: undefined,
    seed: undefined,
  });
  assert.deepEqual(parseFuzzArguments(["--", "--runs", "25"]), {
    help: false,
    runs: 25,
    seed: undefined,
  });
  assert.throws(() => parseFuzzArguments(["--runs", "0"]), /--runs.*between 1 and 10000/i);
  assert.throws(() => parseFuzzArguments(["--seed", "NaN"]), /--seed.*integer/i);
  assert.throws(() => parseFuzzArguments(["--unknown"]), /unknown argument/i);
});

test("forces the canonical single-fork fuzz environment", () => {
  assert.deepEqual(
    buildFuzzEnvironment(
      {
        FC_SEED: "5678",
        FUZZ: "0",
        FUZZ_RUNS: "10",
        FUZZ_SEED: "8765",
        VITEST_MAX_FORKS: "8",
      },
      { help: false, runs: 50, seed: 1234 },
    ),
    {
      FUZZ: "1",
      FUZZ_RUNS: "50",
      FUZZ_SEED: "1234",
      VITEST_MAX_FORKS: "1",
    },
  );

  assert.deepEqual(buildFuzzEnvironment({ FC_SEED: "5678" }, { help: false }), {
    FC_SEED: "5678",
    FUZZ: "1",
    VITEST_MAX_FORKS: "1",
  });
});

test("derives a stable repo-scoped lock path", () => {
  const firstRepo = mkdtempSync(join(tmpdir(), "snapotter-fuzz-repo-a-"));
  const secondRepo = mkdtempSync(join(tmpdir(), "snapotter-fuzz-repo-b-"));
  const nested = join(firstRepo, "nested");
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: firstRepo });
    execFileSync("git", ["init", "--quiet"], { cwd: secondRepo });
    mkdirSync(nested);

    assert.equal(fuzzLockPath(firstRepo), fuzzLockPath(nested));
    assert.notEqual(fuzzLockPath(firstRepo), fuzzLockPath(secondRepo));
    assert.match(fuzzLockPath(firstRepo), /snapotter-fuzz-[a-f0-9]{64}\.lock$/);
  } finally {
    rmSync(firstRepo, { force: true, recursive: true });
    rmSync(secondRepo, { force: true, recursive: true });
  }
});

test("refuses a second fuzz campaign and only releases its own lock", () => {
  const root = mkdtempSync(join(tmpdir(), "snapotter-fuzz-lock-test-"));
  const lockPath = join(root, "fuzz.lock");

  try {
    const first = acquireFuzzLock(lockPath, {
      pid: process.pid,
      startedAt: "2026-07-25T00:00:00.000Z",
      token: "first-owner",
    });
    assert.equal(existsSync(lockPath), true);
    assert.throws(
      () =>
        acquireFuzzLock(lockPath, {
          pid: process.pid,
          startedAt: "2026-07-25T00:00:01.000Z",
          token: "second-owner",
        }),
      /another fuzz campaign is already running/i,
    );
    assert.equal(existsSync(lockPath), true);

    first.release();
    assert.equal(existsSync(lockPath), false);

    const next = acquireFuzzLock(lockPath, {
      pid: process.pid,
      startedAt: "2026-07-25T00:00:02.000Z",
      token: "next-owner",
    });
    next.release();
    assert.equal(existsSync(lockPath), false);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
