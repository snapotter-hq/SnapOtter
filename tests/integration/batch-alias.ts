import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "../../apps/api/src/db/index.js";
import { BATCH_ALIAS_TYPE, batchAliasTarget } from "../../apps/api/src/jobs/batch-alias.js";

/**
 * Batch and pipeline-batch parents never take the client's clientJobId: it
 * would name their public download path. The client id is an alias row
 * pointing at the server-generated parent. These helpers let tests written
 * in terms of the client id find the real parent.
 */

/** The server parent id behind `clientJobId`, or `clientJobId` when it is no alias. */
export async function resolveBatchJobId(clientJobId: string): Promise<string> {
  const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, clientJobId));
  return (row ? batchAliasTarget(row) : null) ?? clientJobId;
}

/** The server parent id behind `clientJobId`; throws when there is no alias. */
export async function batchJobIdFor(clientJobId: string): Promise<string> {
  const target = await resolveBatchJobId(clientJobId);
  if (target === clientJobId) throw new Error(`No batch alias row for ${clientJobId}`);
  return target;
}

const clientIdCache = new Map<string, string>();

/** The client id whose alias points at `batchJobId`, or null. */
export async function clientJobIdForBatch(batchJobId: string): Promise<string | null> {
  const cached = clientIdCache.get(batchJobId);
  if (cached) return cached;
  const [row] = await db
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.type, BATCH_ALIAS_TYPE),
        sql`${schema.jobs.settings}->>'batchJobId' = ${batchJobId}`,
      ),
    )
    .limit(1);
  if (row) clientIdCache.set(batchJobId, row.id);
  return row?.id ?? null;
}

const SERVER_KEY =
  /^(uploads|outputs)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(.*)$/;

/**
 * Rewrite a storage key under a server batch id back into client-id terms
 * (`outputs/<server>-f0/a.png` -> `outputs/<client>-f0/a.png`), so storage
 * fault injection keyed by the client id still matches.
 */
export async function toClientKey(key: string): Promise<string> {
  const match = SERVER_KEY.exec(key);
  if (!match) return key;
  const clientJobId = await clientJobIdForBatch(match[2]);
  return clientJobId ? `${match[1]}/${clientJobId}${match[3]}` : key;
}
