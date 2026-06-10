import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "../config.js";
import * as schema from "./schema.js";

const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
});

pool.on("error", (err) => {
  console.error("Unexpected idle Postgres client error", err);
});

export const db = drizzle(pool, { schema });
export { pool, schema };

let ended = false;
export async function closeDb(): Promise<void> {
  if (ended) return;
  ended = true;
  await pool.end();
}
