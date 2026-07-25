import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  resolvePlaywrightBackingState,
  teardownPlaywrightBackingState,
} from "./playwright-backing-state.mjs";

const INTERRUPT_EXIT_CODES = {
  SIGINT: 130,
  SIGTERM: 143,
};

function combineLifecycleErrors(primaryError, teardownError) {
  if (primaryError && teardownError) {
    return new AggregateError(
      [primaryError, teardownError],
      "Playwright API lifecycle and backing-state teardown both failed",
    );
  }
  return primaryError ?? teardownError;
}

export async function runPlaywrightApiLifecycle({
  createDatabase,
  signalSource = process,
  startApi,
  teardown,
}) {
  let api = null;
  let exitCode;
  let interruptedBy = null;
  let primaryError = null;
  let teardownError = null;

  const interrupt = (signal) => {
    if (interruptedBy !== null) return;
    interruptedBy = signal;
    api?.stop(signal);
  };
  const onSigint = () => interrupt("SIGINT");
  const onSigterm = () => interrupt("SIGTERM");

  signalSource.on("SIGINT", onSigint);
  signalSource.on("SIGTERM", onSigterm);

  try {
    await createDatabase();
    if (interruptedBy === null) {
      api = startApi();
      const result = await api.completion;
      exitCode =
        interruptedBy === null
          ? (result.code ?? INTERRUPT_EXIT_CODES[result.signal] ?? 1)
          : INTERRUPT_EXIT_CODES[interruptedBy];
    } else {
      exitCode = INTERRUPT_EXIT_CODES[interruptedBy];
    }
  } catch (error) {
    primaryError = error;
  } finally {
    signalSource.off("SIGINT", onSigint);
    signalSource.off("SIGTERM", onSigterm);
    try {
      await teardown();
    } catch (error) {
      teardownError = error;
    }
  }

  const lifecycleError = combineLifecycleErrors(primaryError, teardownError);
  if (lifecycleError) throw lifecycleError;
  return exitCode;
}

function waitForChild(child, label) {
  return new Promise((resolve, reject) => {
    child.once("error", (error) => {
      reject(new Error(`${label} failed to start`, { cause: error }));
    });
    child.once("exit", (code, signal) => {
      resolve({ code, signal });
    });
  });
}

async function createDatabaseWithExistingScript(state, projectRoot) {
  const creator = spawn(
    process.execPath,
    [path.join(projectRoot, "tests/e2e-pg-create-db.cjs"), state.databaseName],
    {
      env: {
        ...process.env,
        E2E_PG_BASE_URL: state.postgresBaseUrl,
      },
      stdio: "inherit",
    },
  );
  const result = await waitForChild(creator, "Playwright database creator");
  if (result.code !== 0) {
    throw new Error(
      `Playwright database creator exited with ${result.signal ?? result.code ?? "unknown status"}`,
    );
  }
}

function startApiProcess(command, args, env) {
  const child = spawn(command, args, {
    env,
    stdio: "inherit",
  });
  return {
    completion: waitForChild(child, "Playwright API server"),
    stop(signal) {
      if (child.exitCode === null && child.signalCode === null) child.kill(signal);
    },
  };
}

function parseCli(argv) {
  const separator = argv.indexOf("--");
  if (separator !== 2 || argv.length < 4) {
    throw new Error(
      "Usage: node tests/playwright-api-lifecycle.mjs <run-id> <scope> -- <api-command> [args...]",
    );
  }
  return {
    apiArgs: argv.slice(separator + 2),
    apiCommand: argv[separator + 1],
    runId: argv[0],
    scope: argv[1],
  };
}

async function main() {
  const { apiArgs, apiCommand, runId, scope } = parseCli(process.argv.slice(2));
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const state = resolvePlaywrightBackingState({
    postgresBaseUrl:
      process.env.E2E_PG_BASE_URL ?? "postgres://snapotter:snapotter@localhost:5432/snapotter",
    redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
    runId,
    scope,
  });
  const apiEnv = {
    ...process.env,
    BULLMQ_PREFIX: state.bullmqPrefix,
    DATABASE_URL: state.databaseUrl,
    E2E_PG_BASE_URL: state.postgresBaseUrl,
    REDIS_URL: state.redisUrl,
  };

  const exitCode = await runPlaywrightApiLifecycle({
    createDatabase: () => createDatabaseWithExistingScript(state, projectRoot),
    startApi: () => startApiProcess(apiCommand, apiArgs, apiEnv),
    teardown: () => teardownPlaywrightBackingState(state),
  });
  process.exitCode = exitCode;
}

const isCli =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  main().catch((error) => {
    console.error("[e2e-lifecycle] failed:", error);
    process.exitCode = 1;
  });
}
