import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  mergeCommandEvents,
  projectCommandEvidence,
  runCampaignCommand,
} from "../../../scripts/test-coverage/campaign-runner.mjs";

function makeCampaign() {
  const root = mkdtempSync(join(tmpdir(), "snapotter-campaign-runner-"));
  const registry = join(root, "campaign");
  mkdirSync(join(registry, "runs"), { recursive: true });
  writeFileSync(join(registry, "commands.jsonl"), "");
  return { lockPath: join(root, "snapotter-host-lock"), registry, root };
}

function mutationGuardPath(lockPath) {
  return `${lockPath}.mutation`;
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    if (error?.code === "EPERM") return true;
    throw error;
  }
}

function processGroupExists(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    if (error?.code === "EPERM") return true;
    throw error;
  }
}

function killTarget(target) {
  try {
    process.kill(target, "SIGKILL");
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

async function waitForAbsence(predicate, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return !predicate();
}

function writeForeignMutationGuard(lockPath, operation) {
  const guardPath = mutationGuardPath(lockPath);
  mkdirSync(guardPath);
  writeFileSync(
    join(guardPath, "owner.json"),
    `${JSON.stringify({
      operation,
      ownerPid: 4242,
      token: "foreign-guard-token-secret",
    })}\n`,
  );
  return guardPath;
}

async function expectMutationGuardBlock(operation) {
  const campaign = makeCampaign();
  const runId = `runner-guard-${operation}-001`;
  let snapshots = 0;
  try {
    let guardPath;
    if (operation === "acquire") {
      guardPath = writeForeignMutationGuard(campaign.lockPath, operation);
    }
    let mutationError;
    await assert.rejects(
      runCampaignCommand({
        args: ["-e", "process.exit(0)"],
        beforeResourceAudit: () => {
          if (operation !== "acquire") {
            guardPath = writeForeignMutationGuard(campaign.lockPath, operation);
          }
        },
        command: process.execPath,
        cwd: process.cwd(),
        inspectDocker: operation === "update",
        lockPath: campaign.lockPath,
        registry: campaign.registry,
        resourceSnapshot: () => {
          snapshots += 1;
          return snapshots === 1
            ? { containers: [], networks: [], volumes: [] }
            : { containers: ["new-container"], networks: [], volumes: [] };
        },
        runId,
        timeoutMs: 5_000,
      }),
      (error) => {
        mutationError = error;
        return /host lock mutation guard already exists/.test(error.message);
      },
    );

    assert.doesNotMatch(mutationError.message, /foreign-guard-token-secret/);
    assert.match(mutationError.message, /tokenSha256/);
    assert.equal(existsSync(guardPath), true);
    assert.equal(
      JSON.parse(readFileSync(join(guardPath, "owner.json"), "utf8")).token,
      "foreign-guard-token-secret",
    );
    if (operation === "acquire") {
      assert.equal(existsSync(campaign.lockPath), false);
      assert.equal(existsSync(join(campaign.registry, "runs", runId)), false);
    } else {
      assert.equal(existsSync(campaign.lockPath), true);
    }
  } finally {
    rmSync(campaign.root, { force: true, recursive: true });
  }
}

test("records paired evidence and releases its owner-token lock", async () => {
  const campaign = makeCampaign();
  try {
    const result = await runCampaignCommand({
      args: ["-e", 'process.stdout.write("runner-ok\\n")'],
      command: process.execPath,
      cwd: process.cwd(),
      lockPath: campaign.lockPath,
      registry: campaign.registry,
      runId: "runner-success-001",
      timeoutMs: 5_000,
    });

    assert.equal(result.classification, "success");
    assert.equal(result.exitCode, 0);
    assert.equal(existsSync(campaign.lockPath), false);
    assert.equal(existsSync(mutationGuardPath(campaign.lockPath)), false);
    assert.equal(
      readFileSync(join(campaign.registry, "runs", "runner-success-001", "stdout.log"), "utf8"),
      "runner-ok\n",
    );
    assert.equal(
      existsSync(join(campaign.registry, "runs", "runner-success-001", "command-started.json")),
      true,
    );
    assert.equal(
      existsSync(join(campaign.registry, "runs", "runner-success-001", "command-finished.json")),
      true,
    );
    mergeCommandEvents(campaign.registry);
    const events = readFileSync(join(campaign.registry, "commands.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.deepEqual(
      events.map(({ event }) => event),
      ["command_started", "command_finished"],
    );
    assert.equal(events[0].processGroup, events[0].pid);
    assert.equal(events[1].stdout.truncated, false);
    assert.match(events[1].stdout.sha256, /^[a-f0-9]{64}$/);
  } finally {
    rmSync(campaign.root, { force: true, recursive: true });
  }
});

test("refuses an existing run directory and a foreign lock", async () => {
  const campaign = makeCampaign();
  try {
    mkdirSync(join(campaign.registry, "runs", "already-used"));
    await assert.rejects(
      runCampaignCommand({
        args: ["-e", "process.exit(0)"],
        command: process.execPath,
        cwd: process.cwd(),
        lockPath: campaign.lockPath,
        registry: campaign.registry,
        runId: "already-used",
        timeoutMs: 5_000,
      }),
      /run directory already exists/,
    );
    assert.equal(existsSync(join(campaign.registry, "runs", "already-used")), true);

    mkdirSync(campaign.lockPath);
    writeFileSync(
      join(campaign.lockPath, "owner.json"),
      `${JSON.stringify({
        campaignId: "foreign-campaign",
        command: ["node", "--token", "foreign-command-secret"],
        deadline: "2026-07-23T00:00:00.000Z",
        ownerPid: 4242,
        token: "foreign-owner-token-secret",
        worktree: "/safe/worktree",
      })}\n`,
    );
    let foreignLockError;
    await assert.rejects(
      runCampaignCommand({
        args: ["-e", "process.exit(0)"],
        command: process.execPath,
        cwd: process.cwd(),
        lockPath: campaign.lockPath,
        registry: campaign.registry,
        runId: "foreign-lock-001",
        timeoutMs: 5_000,
      }),
      (error) => {
        foreignLockError = error;
        return /host lock already exists/.test(error.message);
      },
    );
    assert.match(foreignLockError.message, /foreign-campaign/);
    assert.doesNotMatch(
      foreignLockError.message,
      /foreign-owner-token-secret|foreign-command-secret|--token/,
    );
    assert.equal(existsSync(join(campaign.registry, "runs", "foreign-lock-001")), false);
    assert.equal(existsSync(mutationGuardPath(campaign.lockPath)), false);
  } finally {
    rmSync(campaign.root, { force: true, recursive: true });
  }
});

test("never persists raw argv while preserving exact in-memory dispatch", async () => {
  const campaign = makeCampaign();
  const cases = [
    { args: ["--token", "separate-token-secret"], secrets: ["separate-token-secret"] },
    { args: ["--password", "separate-password-secret"], secrets: ["separate-password-secret"] },
    { args: ["--client-secret", "separate-client-secret"], secrets: ["separate-client-secret"] },
    {
      args: ["--client_secret", "separate-client-underscore-secret"],
      secrets: ["separate-client-underscore-secret"],
    },
    {
      args: ["--access-token", "separate-access-token-secret"],
      secrets: ["separate-access-token-secret"],
    },
    {
      args: ["--access_token", "separate-access-underscore-token-secret"],
      secrets: ["separate-access-underscore-token-secret"],
    },
    { args: ["--bearer", "separate-bearer-secret"], secrets: ["separate-bearer-secret"] },
    {
      args: ["-H", "Authorization: Bearer authorization-header-secret"],
      secrets: ["authorization-header-secret"],
    },
    {
      args: ["-HAuthorization: Bearer attached-short-header-secret"],
      secrets: ["attached-short-header-secret"],
    },
    {
      args: ["--header=Authorization: Bearer attached-long-header-secret"],
      secrets: ["attached-long-header-secret"],
    },
    {
      args: ["--header=Proxy-Authorization: Basic proxy-authorization-header-secret"],
      secrets: ["proxy-authorization-header-secret"],
    },
    {
      args: ["https://url-user:url-password-secret@example.invalid/path"],
      secrets: ["url-user", "url-password-secret"],
    },
    { args: ["SERVICE_TOKEN=assignment-secret"], secrets: ["assignment-secret"] },
    {
      args: ["--refresh-token", "refresh-token-option-secret"],
      secrets: ["refresh-token-option-secret"],
    },
    {
      args: ["--refresh-token=refresh-token-equals-secret"],
      secrets: ["refresh-token-equals-secret"],
    },
    {
      args: ["--db-password", "db-password-option-secret"],
      secrets: ["db-password-option-secret"],
    },
    {
      args: ["--db-password=db-password-equals-secret"],
      secrets: ["db-password-equals-secret"],
    },
    {
      args: ["--aws-secret-access-key", "aws-secret-access-key-option-secret"],
      secrets: ["aws-secret-access-key-option-secret"],
    },
    {
      args: ["--aws-secret-access-key=aws-secret-access-key-equals-secret"],
      secrets: ["aws-secret-access-key-equals-secret"],
    },
    {
      args: ["-H", "X-API-Key: api-key-header-secret"],
      secrets: ["api-key-header-secret"],
    },
    {
      args: ["-HX-Api-Key: attached-api-key-header-secret"],
      secrets: ["attached-api-key-header-secret"],
    },
    {
      args: ["--header=Cookie: session=cookie-header-secret"],
      secrets: ["cookie-header-secret"],
    },
    {
      args: ["-HCookie: session=attached-cookie-header-secret"],
      secrets: ["attached-cookie-header-secret"],
    },
    {
      args: ["-u", "basic-user:short-basic-auth-secret"],
      secrets: ["short-basic-auth-secret"],
    },
    {
      args: ["-uattached-user:attached-basic-auth-secret"],
      secrets: ["attached-basic-auth-secret"],
    },
    {
      args: ["--user=long-user:long-basic-auth-secret"],
      secrets: ["long-basic-auth-secret"],
    },
    {
      args: ["--user", "long-separate-user:long-separate-basic-auth-secret"],
      secrets: ["long-separate-basic-auth-secret"],
    },
    {
      args: ['{"token":"json-token-secret"}'],
      secrets: ["json-token-secret"],
    },
    {
      args: ["--data", '{"db_password":"json-password-secret"}'],
      secrets: ["json-password-secret"],
    },
    {
      args: ['--json={"config":{"awsSecretAccessKey":"json-aws-secret"}}'],
      secrets: ["json-aws-secret"],
    },
    {
      args: ["AWS_SECRET_ACCESS_KEY=environment-aws-secret"],
      secrets: ["environment-aws-secret"],
    },
    {
      args: ["https://example.invalid/file?token=query-token-secret"],
      secrets: ["query-token-secret"],
    },
    {
      args: ["https://example.invalid/file?mode=read&password=query-password-secret"],
      secrets: ["query-password-secret"],
    },
    {
      args: ["redis://:password-only-dsn-secret@cache.invalid/0"],
      secrets: ["password-only-dsn-secret"],
    },
    {
      args: ["--cookie", "session=long-cookie-option-secret"],
      secrets: ["long-cookie-option-secret"],
    },
    {
      args: ["--cookie=session=long-cookie-equals-secret"],
      secrets: ["long-cookie-equals-secret"],
    },
    {
      args: ["-b", "session=short-cookie-option-secret"],
      secrets: ["short-cookie-option-secret"],
    },
    {
      args: ["-bsession=attached-cookie-option-secret"],
      secrets: ["attached-cookie-option-secret"],
    },
    {
      args: ["--proxy-user", "proxy-user:proxy-user-option-secret"],
      secrets: ["proxy-user-option-secret"],
    },
    {
      args: ["--proxy-user=proxy-user:proxy-user-equals-secret"],
      secrets: ["proxy-user-equals-secret"],
    },
    {
      args: ["AWS_ACCESS_KEY_ID=aws-access-key-id-secret"],
      secrets: ["aws-access-key-id-secret"],
    },
    {
      args: ["--access-key", "access-key-option-secret"],
      secrets: ["access-key-option-secret"],
    },
    {
      args: ["--credential", "credential-option-secret"],
      secrets: ["credential-option-secret"],
    },
    {
      args: ["--credential=credential-equals-secret"],
      secrets: ["credential-equals-secret"],
    },
    {
      args: ["--private-key", "private-key-option-secret"],
      secrets: ["private-key-option-secret"],
    },
    {
      args: ["--private-key=private-key-equals-secret"],
      secrets: ["private-key-equals-secret"],
    },
  ];
  try {
    for (const [index, { args, secrets }] of cases.entries()) {
      const projection = projectCommandEvidence(process.execPath, args);
      assert.equal(projection.argumentCount, args.length, `case ${index + 1}`);
      const serialized = JSON.stringify(projection);
      for (const secret of secrets) assert.doesNotMatch(serialized, new RegExp(secret));
    }

    const nestedSecret = "nested-shell-authorization-secret";
    const parentArgvPath = join(campaign.root, "gated-child-argv.txt");
    let retainedOwnerEvidence;
    const secretRunId = "runner-secret-projection-001";
    const secretResult = await runCampaignCommand({
      args: [
        "-e",
        [
          'const { spawnSync } = require("node:child_process");',
          'const { writeFileSync } = require("node:fs");',
          `if (process.argv[1] !== ${JSON.stringify(nestedSecret)}) process.exit(9);`,
          `writeFileSync(${JSON.stringify(parentArgvPath)}, spawnSync("ps", ["-o", "command=", "-p", String(process.ppid)], { encoding: "utf8" }).stdout);`,
        ].join(" "),
        nestedSecret,
      ],
      beforeResourceAudit: () => {
        retainedOwnerEvidence = readFileSync(join(campaign.lockPath, "owner.json"), "utf8");
      },
      command: process.execPath,
      cwd: process.cwd(),
      lockPath: campaign.lockPath,
      registry: campaign.registry,
      runId: secretRunId,
      timeoutMs: 5_000,
    });
    assert.equal(secretResult.classification, "success");
    const secretRunDirectory = join(campaign.registry, "runs", secretRunId);
    const secretStarted = JSON.parse(
      readFileSync(join(secretRunDirectory, "command-started.json"), "utf8"),
    );
    assert.deepEqual(secretStarted.outputPolicy, {
      commandMustNotEmitSecrets: true,
      mode: "verbatim-bounded",
    });
    for (const filename of readdirSync(secretRunDirectory)) {
      assert.doesNotMatch(
        readFileSync(join(secretRunDirectory, filename), "utf8"),
        new RegExp(nestedSecret),
      );
    }
    assert.doesNotMatch(retainedOwnerEvidence, new RegExp(nestedSecret));
    const gatedChildArgv = readFileSync(parentArgvPath, "utf8").trim();
    assert.match(gatedChildArgv, /campaign-runner\.mjs --gated-child$/);
    assert.doesNotMatch(gatedChildArgv, new RegExp(nestedSecret));

    const sparseArgs = [];
    sparseArgs.length = 1;
    assert.throws(
      () => projectCommandEvidence(process.execPath, sparseArgs),
      /campaign arguments must be a dense array/,
    );

    const originalDispatchValue = "dispatch-original-value";
    const mutableArgs = [
      "-e",
      `if (process.argv[1] !== ${JSON.stringify(originalDispatchValue)}) process.exit(9);`,
      originalDispatchValue,
    ];
    let snapshotCount = 0;
    const mutationRunId = "runner-argv-mutation-001";
    const mutationResult = await runCampaignCommand({
      args: mutableArgs,
      command: process.execPath,
      cwd: process.cwd(),
      inspectDocker: true,
      lockPath: campaign.lockPath,
      registry: campaign.registry,
      resourceSnapshot: () => {
        snapshotCount += 1;
        if (snapshotCount === 1) {
          mutableArgs[2] = "dispatch-mutated-value";
          mutableArgs.push("dispatch-extra-value");
        }
        return { containers: [], networks: [], volumes: [] };
      },
      runId: mutationRunId,
      timeoutMs: 5_000,
    });
    assert.equal(mutationResult.classification, "success");
    assert.equal(snapshotCount, 2);
    const mutationStarted = JSON.parse(
      readFileSync(join(campaign.registry, "runs", mutationRunId, "command-started.json"), "utf8"),
    );
    assert.equal(mutationStarted.command.argumentCount, 3);
    assert.deepEqual(mutationStarted.command.argumentShape, [
      "short-option",
      "positional",
      "positional",
    ]);
    assert.doesNotMatch(
      JSON.stringify(mutationStarted),
      /dispatch-original-value|dispatch-mutated-value|dispatch-extra-value/,
    );

    const harmlessArgs = [
      "-e",
      "process.exit(0)",
      "--",
      "--password-stdin",
      "--private-key",
      "tests/unit/token-parser.test.ts",
      "fixtures/password-policy.json",
      "fixtures/private-key-policy.json",
    ];
    const harmlessRunId = "runner-harmless-secret-paths-001";
    const harmlessResult = await runCampaignCommand({
      args: harmlessArgs,
      command: process.execPath,
      cwd: process.cwd(),
      lockPath: campaign.lockPath,
      registry: campaign.registry,
      runId: harmlessRunId,
      timeoutMs: 5_000,
    });
    assert.equal(harmlessResult.classification, "success");
    const harmlessStarted = JSON.parse(
      readFileSync(join(campaign.registry, "runs", harmlessRunId, "command-started.json"), "utf8"),
    );
    assert.deepEqual(
      harmlessStarted.command,
      projectCommandEvidence(process.execPath, harmlessArgs),
    );
    assert.doesNotMatch(
      JSON.stringify(harmlessStarted),
      /password-policy|private-key-policy|token-parser/,
    );
    assert.equal(existsSync(campaign.lockPath), false);
    assert.equal(existsSync(mutationGuardPath(campaign.lockPath)), false);
  } finally {
    rmSync(campaign.root, { force: true, recursive: true });
  }
});

test("handles an interruption before acquiring resources or dispatching", async () => {
  const campaign = makeCampaign();
  const dispatchedPath = join(campaign.root, "command-dispatched");
  const signalEmitter = new EventEmitter();
  try {
    queueMicrotask(() => signalEmitter.emit("SIGTERM"));
    await assert.rejects(
      runCampaignCommand({
        args: [
          "-e",
          `require("node:fs").writeFileSync(${JSON.stringify(dispatchedPath)}, "dispatched")`,
        ],
        command: process.execPath,
        cwd: process.cwd(),
        lockPath: campaign.lockPath,
        registry: campaign.registry,
        runId: "runner-early-signal-001",
        signalEmitter,
        timeoutMs: 5_000,
      }),
      /campaign interrupted by SIGTERM before command dispatch/,
    );

    assert.equal(signalEmitter.listenerCount("SIGINT"), 0);
    assert.equal(signalEmitter.listenerCount("SIGTERM"), 0);
    assert.equal(existsSync(dispatchedPath), false);
    assert.equal(existsSync(campaign.lockPath), false);
    assert.equal(existsSync(join(campaign.registry, "runs", "runner-early-signal-001")), false);
  } finally {
    rmSync(campaign.root, { force: true, recursive: true });
  }
});

test("cleans partial log setup without removing a pre-existing run", async () => {
  const campaign = makeCampaign();
  const existingRun = join(campaign.registry, "runs", "pre-existing-run");
  const partialRun = join(campaign.registry, "runs", "runner-partial-log-001");
  let stdoutFile;
  let cleanupError;
  try {
    mkdirSync(existingRun);
    writeFileSync(join(existingRun, "keep.txt"), "keep\n");
    await assert.rejects(
      runCampaignCommand({
        args: ["-e", "process.exit(0)"],
        command: process.execPath,
        cwd: process.cwd(),
        lockPath: campaign.lockPath,
        openFile: (path, flags, mode) => {
          if (path.endsWith("stderr.log")) throw new Error("forced stderr open failure");
          stdoutFile = openSync(path, flags, mode);
          return stdoutFile;
        },
        registry: campaign.registry,
        runId: "runner-partial-log-001",
        timeoutMs: 5_000,
      }),
      /forced stderr open failure/,
    );

    assert.equal(existsSync(partialRun), false);
    assert.equal(readFileSync(join(existingRun, "keep.txt"), "utf8"), "keep\n");
    assert.throws(
      () => closeSync(stdoutFile),
      (error) => error?.code === "EBADF",
      "the first log descriptor must be closed after the second open fails",
    );
  } finally {
    if (stdoutFile !== undefined) {
      try {
        closeSync(stdoutFile);
      } catch (error) {
        if (error?.code !== "EBADF") cleanupError = error;
      }
    }
    rmSync(campaign.root, { force: true, recursive: true });
  }
  if (cleanupError) throw cleanupError;
});

test("fails closed when lock acquisition finds an adjacent mutation guard", async () => {
  await expectMutationGuardBlock("acquire");
});

test("fails closed when lock update finds an adjacent mutation guard", async () => {
  await expectMutationGuardBlock("update");
});

test("fails closed when lock release finds an adjacent mutation guard", async () => {
  await expectMutationGuardBlock("release");
});

test("terminates the owned process group on deadline and releases the lock", async () => {
  const campaign = makeCampaign();
  const childPidPath = join(campaign.root, "term-resistant-child.pid");
  let childPid;
  let processGroup;
  try {
    const result = await runCampaignCommand({
      args: [
        "-e",
        [
          'const { closeSync, writeFileSync } = require("node:fs");',
          'process.on("SIGTERM", () => {});',
          `writeFileSync(${JSON.stringify(childPidPath)}, String(process.pid));`,
          "closeSync(1);",
          "closeSync(2);",
          "setInterval(() => {}, 1_000);",
        ].join(" "),
      ],
      command: process.execPath,
      cwd: process.cwd(),
      lockPath: campaign.lockPath,
      registry: campaign.registry,
      runId: "runner-timeout-001",
      timeoutMs: 500,
    });

    childPid = Number(readFileSync(childPidPath, "utf8"));
    processGroup = JSON.parse(
      readFileSync(
        join(campaign.registry, "runs", "runner-timeout-001", "command-started.json"),
        "utf8",
      ),
    ).processGroup;
    assert.equal(result.classification, "timeout");
    assert.equal(processExists(childPid), false);
    assert.equal(processGroupExists(processGroup), false);
    assert.equal(existsSync(campaign.lockPath), false);
  } finally {
    if (processGroup && processGroupExists(processGroup)) killTarget(-processGroup);
    if (childPid && processExists(childPid)) killTarget(childPid);
    if (processGroup) {
      assert.equal(
        await waitForAbsence(() => processGroupExists(processGroup)),
        true,
        "targeted test cleanup must remove the process group",
      );
    }
    if (childPid) {
      assert.equal(
        await waitForAbsence(() => processExists(childPid)),
        true,
        "targeted test cleanup must remove the TERM-resistant child",
      );
    }
    rmSync(campaign.root, { force: true, recursive: true });
  }
});

test("retains the lock and names Docker resources created by a command", async () => {
  const campaign = makeCampaign();
  let snapshots = 0;
  try {
    const result = await runCampaignCommand({
      args: ["-e", "process.exit(0)"],
      command: process.execPath,
      cwd: process.cwd(),
      inspectDocker: true,
      lockPath: campaign.lockPath,
      registry: campaign.registry,
      resourceSnapshot: () => {
        snapshots += 1;
        return snapshots === 1
          ? { containers: ["existing"], networks: ["bridge"], volumes: [] }
          : { containers: ["existing", "leaked-container"], networks: ["bridge"], volumes: [] };
      },
      runId: "runner-leak-001",
      timeoutMs: 5_000,
    });

    assert.equal(result.classification, "infrastructure_failure");
    assert.equal(existsSync(campaign.lockPath), true);
    assert.deepEqual(
      JSON.parse(readFileSync(join(campaign.lockPath, "owner.json"), "utf8")).resourceLeaks,
      { containers: ["leaked-container"], networks: [], volumes: [] },
    );
  } finally {
    rmSync(campaign.root, { force: true, recursive: true });
  }
});

test("merges concurrent lock-free runs without losing either event pair", async () => {
  const campaign = makeCampaign();
  try {
    await Promise.all(
      ["parallel-a-001", "parallel-b-001"].map((runId) =>
        runCampaignCommand({
          args: ["-e", "setTimeout(() => process.exit(0), 25)"],
          command: process.execPath,
          cwd: process.cwd(),
          lockPath: null,
          registry: campaign.registry,
          runId,
          timeoutMs: 5_000,
        }),
      ),
    );

    const events = mergeCommandEvents(campaign.registry);
    assert.equal(events.length, 4);
    for (const runId of ["parallel-a-001", "parallel-b-001"]) {
      assert.deepEqual(
        events.filter((event) => event.runId === runId).map((event) => event.event),
        ["command_started", "command_finished"],
      );
    }
  } finally {
    rmSync(campaign.root, { force: true, recursive: true });
  }
});

test("contains output-write failures, terminates the child, and completes the resource audit", async () => {
  const campaign = makeCampaign();
  try {
    const result = await runCampaignCommand({
      args: ["-e", 'process.stdout.write("trigger\\n"); setInterval(() => {}, 1_000)'],
      command: process.execPath,
      cwd: process.cwd(),
      inspectDocker: true,
      lockPath: campaign.lockPath,
      outputWriter: () => {
        throw new Error("forced output failure");
      },
      registry: campaign.registry,
      resourceSnapshot: () => ({ containers: [], networks: [], volumes: [] }),
      runId: "runner-output-failure-001",
      timeoutMs: 5_000,
    });

    assert.equal(result.classification, "infrastructure_failure");
    assert.equal(existsSync(campaign.lockPath), false);
    const finished = JSON.parse(
      readFileSync(
        join(campaign.registry, "runs", "runner-output-failure-001", "command-finished.json"),
        "utf8",
      ),
    );
    assert.match(finished.captureError, /forced output failure/);
  } finally {
    rmSync(campaign.root, { force: true, recursive: true });
  }
});

test("retains owner state when control throws after dispatch but before resource audit", async () => {
  const campaign = makeCampaign();
  const falsyCampaign = makeCampaign();
  try {
    await assert.rejects(
      runCampaignCommand({
        args: ["-e", "process.exit(0)"],
        beforeResourceAudit: () => {
          throw new Error("forced pre-audit failure");
        },
        command: process.execPath,
        cwd: process.cwd(),
        inspectDocker: true,
        lockPath: campaign.lockPath,
        registry: campaign.registry,
        resourceSnapshot: () => ({ containers: [], networks: [], volumes: [] }),
        runId: "runner-incomplete-audit-001",
        timeoutMs: 5_000,
      }),
      /forced pre-audit failure/,
    );

    const owner = JSON.parse(readFileSync(join(campaign.lockPath, "owner.json"), "utf8"));
    assert.equal(owner.status, "resource-audit-incomplete");
    assert.match(owner.resourceInspectionError, /forced pre-audit failure/);

    let falsyRejected = false;
    let falsyReason = Symbol("not-rejected");
    try {
      await runCampaignCommand({
        args: ["-e", "process.exit(0)"],
        beforeResourceAudit: () => {
          throw undefined;
        },
        command: process.execPath,
        cwd: process.cwd(),
        inspectDocker: true,
        lockPath: falsyCampaign.lockPath,
        registry: falsyCampaign.registry,
        resourceSnapshot: () => ({ containers: [], networks: [], volumes: [] }),
        runId: "runner-falsy-pre-audit-001",
        timeoutMs: 5_000,
      });
    } catch (error) {
      falsyRejected = true;
      falsyReason = error;
    }
    assert.equal(falsyRejected, true);
    assert.equal(falsyReason, undefined);
    const falsyOwner = JSON.parse(readFileSync(join(falsyCampaign.lockPath, "owner.json"), "utf8"));
    assert.equal(falsyOwner.status, "resource-audit-incomplete");
    assert.equal(falsyOwner.resourceInspectionError, "undefined");
  } finally {
    rmSync(campaign.root, { force: true, recursive: true });
    rmSync(falsyCampaign.root, { force: true, recursive: true });
  }
});
