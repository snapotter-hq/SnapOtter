import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";

/**
 * Clear all MFA state for a user: TOTP secret, the enabled flag, and recovery
 * codes. Shared by the self-service disable route, the admin reset route, and
 * the offline recovery CLI so the mutation lives in exactly one place.
 */
export async function clearUserMfa(userId: string): Promise<void> {
  await db
    .update(schema.users)
    .set({
      totpSecret: null,
      totpEnabled: false,
      recoveryCodesHash: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, userId));
}
