import { getPool } from "../../core/db.js";

/** The athlete's profile, used to personalize dynamic context providers (e.g. weather). */
export interface AthleteProfile {
  location: string;
}

/** Loads the athlete_profiles row for this user. Missing row -> empty location. */
export async function loadProfile(userId: string): Promise<AthleteProfile> {
  const result = await getPool().query<{ location: string | null }>(
    "select location from athlete_profiles where user_id = $1",
    [userId]
  );
  return { location: result.rows[0]?.location ?? "" };
}
