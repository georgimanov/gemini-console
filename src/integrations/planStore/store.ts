// Postgres-backed storage for generated plans/reports, keyed by (user, persona, date).
// Lets a persona that builds a plan from a template (morning briefing, meal plan, ...)
// reuse the same plan for the rest of the day instead of regenerating a possibly-different
// one each time it's asked, and keeps every edit (e.g. "swap priority 2 and 3") as a new
// version rather than losing history.
import { getPool } from "../../core/db.js";
import type { PlanRecord, PlanVersion } from "./types.js";

export type { PlanRecord, PlanVersion };

/** Reads the full version history for this persona and date, or null if nothing is saved. */
export async function readPlan(userId: string, personaSlug: string, date: string): Promise<PlanRecord | null> {
  const result = await getPool().query<{ version: number; content: string; saved_at: Date }>(
    `select pv.version, pv.content, pv.saved_at
     from plan_versions pv
     join plans p on p.id = pv.plan_id
     join personas per on per.id = p.persona_id
     where per.user_id = $1 and per.slug = $2 and p.date = $3
     order by pv.version`,
    [userId, personaSlug, date]
  );
  if (result.rows.length === 0) return null;

  return {
    personaId: personaSlug,
    date,
    versions: result.rows.map((row) => ({
      version: row.version,
      content: row.content,
      savedAt: row.saved_at.toISOString(),
    })),
  };
}

/** The most recently saved version, or null if none exists. */
export function latestVersion(record: PlanRecord | null): PlanVersion | null {
  if (!record || record.versions.length === 0) return null;
  return record.versions[record.versions.length - 1];
}

/** Appends a new version (initial save or a later edit) and returns it. */
export async function appendPlanVersion(
  userId: string,
  personaSlug: string,
  date: string,
  content: string
): Promise<PlanVersion> {
  const pool = getPool();

  const personaResult = await pool.query<{ id: string }>(
    "select id from personas where user_id = $1 and slug = $2",
    [userId, personaSlug]
  );
  const personaId = personaResult.rows[0]?.id;
  if (!personaId) {
    throw new Error(`Unknown persona "${personaSlug}".`);
  }

  const planResult = await pool.query<{ id: string }>(
    `insert into plans (user_id, persona_id, date)
     values ($1, $2, $3)
     on conflict (persona_id, date) do update set persona_id = excluded.persona_id
     returning id`,
    [userId, personaId, date]
  );
  const planId = planResult.rows[0].id;

  const versionResult = await pool.query<{ version: number; content: string; saved_at: Date }>(
    `insert into plan_versions (plan_id, version, content)
     values ($1, (select coalesce(max(version), 0) + 1 from plan_versions where plan_id = $1), $2)
     returning version, content, saved_at`,
    [planId, content]
  );
  const row = versionResult.rows[0];
  return { version: row.version, content: row.content, savedAt: row.saved_at.toISOString() };
}
