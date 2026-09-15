// JSON-per-persona-per-day local storage for generated plans/reports:
// resources/data/plans/{personaId}_{date}.json. Lets a persona that builds a plan from
// a template (morning briefing, meal plan, ...) reuse the same plan for the rest of the
// day instead of regenerating a possibly-different one each time it's asked, and keeps
// every edit (e.g. "swap priority 2 and 3") as a new version rather than losing history.
import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface PlanVersion {
  version: number;
  content: string;
  savedAt: string;
}

export interface PlanRecord {
  personaId: string;
  date: string;
  versions: PlanVersion[];
}

function filePath(dataDir: string, personaId: string, date: string): string {
  return path.join(dataDir, `${personaId}_${date}.json`);
}

/** Reads the full version history for this persona and date, or null if nothing is saved. */
export async function readPlan(
  dataDir: string,
  personaId: string,
  date: string
): Promise<PlanRecord | null> {
  try {
    const raw = await fs.readFile(filePath(dataDir, personaId, date), "utf-8");
    return JSON.parse(raw) as PlanRecord;
  } catch {
    return null;
  }
}

/** The most recently saved version, or null if none exists. */
export function latestVersion(record: PlanRecord | null): PlanVersion | null {
  if (!record || record.versions.length === 0) return null;
  return record.versions[record.versions.length - 1];
}

/** Appends a new version (initial save or a later edit) and returns it. */
export async function appendPlanVersion(
  dataDir: string,
  personaId: string,
  date: string,
  content: string
): Promise<PlanVersion> {
  const existing = await readPlan(dataDir, personaId, date);
  const version: PlanVersion = {
    version: (existing?.versions.length ?? 0) + 1,
    content,
    savedAt: new Date().toISOString(),
  };
  const record: PlanRecord = {
    personaId,
    date,
    versions: [...(existing?.versions ?? []), version],
  };

  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(filePath(dataDir, personaId, date), JSON.stringify(record, null, 2) + "\n", "utf-8");
  return version;
}
