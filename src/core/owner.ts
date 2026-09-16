import type { Pool } from "pg";

/**
 * There's no Google login wired up yet, so every DB-scoped read/write acts on this one
 * seeded user (see migrateData.ts, which creates it with a placeholder google_sub).
 * Swap this for the authenticated user's id once OAuth lands.
 */
export const OWNER_EMAIL = "georgimanov@gmail.com";

/** Looks up the owner user's id by email. Throws if migrateData.ts hasn't been run yet. */
export async function resolveOwnerUserId(pool: Pool): Promise<string> {
  const result = await pool.query<{ id: string }>("select id from users where email = $1", [OWNER_EMAIL]);
  const row = result.rows[0];
  if (!row) {
    throw new Error(`No user found for "${OWNER_EMAIL}". Run "npm run db:migrate-data" first.`);
  }
  return row.id;
}
