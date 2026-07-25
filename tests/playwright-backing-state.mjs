import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";

const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const SCOPE_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
const DATABASE_NAME_PATTERN = /^snapotter_e2e_[a-z0-9_]+_[a-f0-9]{24}$/;
const REDIS_DELETE_BATCH_SIZE = 500;

export const PLAYWRIGHT_BACKING_STATE_POOLS = ["image", "media", "ai", "docs", "system"];

const projectRoot = process.cwd();
const apiRequire = createRequire(path.join(projectRoot, "apps/api/package.json"));

function parseServiceUrl(value, label, protocols) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (!protocols.includes(url.protocol)) {
    throw new Error(`${label} must use ${protocols.join(" or ")}`);
  }
  return url;
}

function expectedDatabaseName(runId, scope) {
  const scopePart = scope.replaceAll("-", "_");
  const digest = createHash("sha256").update(`${scope}\0${runId}`).digest("hex").slice(0, 24);
  return `snapotter_e2e_${scopePart}_${digest}`;
}

export function resolvePlaywrightBackingState({ postgresBaseUrl, redisUrl, runId, scope }) {
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error(
      "Playwright run id must be 1-64 letters, digits, underscores, or hyphens and start with a letter or digit",
    );
  }
  if (!SCOPE_PATTERN.test(scope)) {
    throw new Error(
      "Playwright backing-state scope must be 1-32 lowercase letters, digits, or hyphens",
    );
  }

  const postgresUrl = parseServiceUrl(postgresBaseUrl, "E2E_PG_BASE_URL", [
    "postgres:",
    "postgresql:",
  ]);
  parseServiceUrl(redisUrl, "REDIS_URL", ["redis:", "rediss:"]);

  const databaseName = expectedDatabaseName(runId, scope);
  if (!DATABASE_NAME_PATTERN.test(databaseName) || Buffer.byteLength(databaseName, "utf8") > 63) {
    throw new Error("Derived Playwright database name is unsafe");
  }
  if (decodeURIComponent(postgresUrl.pathname.slice(1)) === databaseName) {
    throw new Error("E2E_PG_BASE_URL must not connect to the run-owned database");
  }

  const databaseUrl = new URL(postgresUrl);
  databaseUrl.pathname = `/${databaseName}`;

  return Object.freeze({
    bullmqPrefix: databaseName,
    databaseName,
    databaseUrl: databaseUrl.toString(),
    postgresBaseUrl: postgresUrl.toString(),
    redisUrl,
    runId,
    scope,
  });
}

function assertPlaywrightBackingState(state) {
  const expected = resolvePlaywrightBackingState({
    postgresBaseUrl: state.postgresBaseUrl,
    redisUrl: state.redisUrl,
    runId: state.runId,
    scope: state.scope,
  });
  for (const field of ["databaseName", "databaseUrl", "bullmqPrefix"]) {
    if (state[field] !== expected[field]) {
      throw new Error(
        `Playwright backing-state ${field} does not match the validated run identity`,
      );
    }
  }
  return expected;
}

function ownsValidatedPlaywrightRedisKey(state, key) {
  if (key.startsWith(`${state.bullmqPrefix}:`)) return true;
  return PLAYWRIGHT_BACKING_STATE_POOLS.some((pool) =>
    key.startsWith(`bull:${state.bullmqPrefix}-${pool}:`),
  );
}

export function ownsPlaywrightRedisKey(state, key) {
  const validated = assertPlaywrightBackingState(state);
  return ownsValidatedPlaywrightRedisKey(validated, key);
}

async function dropExactDatabase(state) {
  const pg = apiRequire("pg");
  const client = new pg.Client({ connectionString: state.postgresBaseUrl });
  await client.connect();
  try {
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [state.databaseName],
    );
    await client.query(`DROP DATABASE IF EXISTS "${state.databaseName}"`);
  } finally {
    await client.end();
  }
}

async function deleteExactRedisKeys(state, ownsKey) {
  const RedisModule = apiRequire("ioredis");
  const Redis = RedisModule.default ?? RedisModule;
  const redis = new Redis(state.redisUrl, {
    enableReadyCheck: true,
    maxRetriesPerRequest: 1,
  });
  const ownedKeys = new Set();
  try {
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(cursor, "COUNT", 500);
      cursor = nextCursor;
      for (const key of keys) {
        if (ownsKey(key)) ownedKeys.add(key);
      }
    } while (cursor !== "0");

    const keys = [...ownedKeys];
    for (let offset = 0; offset < keys.length; offset += REDIS_DELETE_BATCH_SIZE) {
      await redis.unlink(...keys.slice(offset, offset + REDIS_DELETE_BATCH_SIZE));
    }
    return keys.length;
  } finally {
    try {
      await redis.quit();
    } catch {
      redis.disconnect();
    }
  }
}

const systemDriver = {
  deleteRedisKeys: deleteExactRedisKeys,
  dropDatabase: dropExactDatabase,
};

export async function teardownPlaywrightBackingState(state, driver = systemDriver) {
  const validated = assertPlaywrightBackingState(state);
  const ownsKey = (key) => ownsValidatedPlaywrightRedisKey(validated, key);
  const [databaseResult, redisResult] = await Promise.allSettled([
    driver.dropDatabase(validated),
    driver.deleteRedisKeys(validated, ownsKey),
  ]);

  const errors = [databaseResult, redisResult]
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason);
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    throw new AggregateError(errors, "Playwright backing-state teardown failed");
  }

  return { deletedRedisKeys: redisResult.value };
}
