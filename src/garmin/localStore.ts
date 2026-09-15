// JSON-per-category-per-day local storage for Garmin data:
// resources/data/garmin/{category}_{date}.json (category from categories.ts,
// e.g. sleep_2026-09-15.json, recovery_2026-09-15.json, workouts_2026-09-15.json).
// Stands in for the Postgres tables in the ai-coach-app sync until this data
// needs to be queried/joined rather than just read by a persona.
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { categoryOf, type Category } from "./categories.js";
import type { ActivityRow, MetricCategoryRecord, MetricRow, WorkoutsRecord } from "./types.js";

function filePath(dataDir: string, category: Category, date: string): string {
  return path.join(dataDir, `${category}_${date}.json`);
}

async function readJson<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readFile(file, "utf-8")) as T;
  } catch {
    return undefined;
  }
}

async function writeJson(dataDir: string, file: string, data: unknown): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

async function readMetricCategory(
  dataDir: string,
  category: Category,
  date: string
): Promise<MetricCategoryRecord> {
  const file = filePath(dataDir, category, date);
  return (await readJson<MetricCategoryRecord>(file)) ?? { date, category, metrics: {} };
}

async function readWorkouts(dataDir: string, date: string): Promise<WorkoutsRecord> {
  const file = filePath(dataDir, "workouts", date);
  return (await readJson<WorkoutsRecord>(file)) ?? { date, category: "workouts", activities: {} };
}

/** Merges metric rows into their {category}_{date}.json file (overwriting same-metric values). */
export async function upsertMetrics(dataDir: string, rows: MetricRow[]): Promise<number> {
  // Group by (date, category) since each metric belongs to exactly one category file.
  const byFile = new Map<string, { date: string; category: Category; rows: MetricRow[] }>();
  for (const row of rows) {
    const category = categoryOf(row.metric);
    if (!category) continue; // unpromoted metric with no category — skip rather than guess
    const key = `${category}_${row.date}`;
    const entry = byFile.get(key) ?? { date: row.date, category, rows: [] };
    entry.rows.push(row);
    byFile.set(key, entry);
  }

  let written = 0;
  for (const { date, category, rows: fileRows } of byFile.values()) {
    const record = await readMetricCategory(dataDir, category, date);
    for (const row of fileRows) {
      record.metrics[row.metric] = { value: row.value, unit: row.unit };
      written += 1;
    }
    await writeJson(dataDir, filePath(dataDir, category, date), record);
  }
  return written;
}

/** Merges one activity into workouts_{date}.json, keyed by activityId (overwrite on re-sync). */
export async function upsertActivity(dataDir: string, row: ActivityRow): Promise<void> {
  const record = await readWorkouts(dataDir, row.date);
  record.activities[String(row.activityId)] = row;
  await writeJson(dataDir, filePath(dataDir, "workouts", row.date), record);
}

/** True when sleep_{date}.json already has a sleep_duration entry (i.e. that day was synced). */
export async function hasSleepData(dataDir: string, date: string): Promise<boolean> {
  const record = await readMetricCategory(dataDir, "sleep", date);
  return record.metrics.sleep_duration !== undefined;
}
