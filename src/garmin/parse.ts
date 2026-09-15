// Pure Garmin-payload -> row parsers. No I/O. Ported from the ai-coach-app
// Postgres sync (same shapes, verified against a live probe); see
// ai-coach-app/docs/adr/0007-garmin-sync-storage-model.md for field provenance.
import type { ActivityRow, MetricRow } from "./types.js";

function pushMetric(
  rows: MetricRow[],
  date: string,
  metric: string,
  value: unknown,
  unit: string | null
): void {
  // Skip nulls — no null rows.
  if (typeof value !== "number" || !Number.isFinite(value)) return;
  rows.push({ date, metric, value, unit });
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function int(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null;
}

/** Garmin sleep payload -> promoted scalar rows. */
export function parseSleep(sleep: unknown, fallbackDate: string): MetricRow[] {
  const rows: MetricRow[] = [];
  if (!sleep || typeof sleep !== "object") return rows;
  const s = sleep as Record<string, unknown>;
  const dto = (s.dailySleepDTO ?? {}) as Record<string, unknown>;
  const date = (typeof dto.calendarDate === "string" && dto.calendarDate) || fallbackDate;

  const scores = (dto.sleepScores ?? {}) as Record<string, unknown>;
  const overall = (scores.overall ?? {}) as Record<string, unknown>;

  pushMetric(rows, date, "sleep_score", overall.value, null);
  pushMetric(rows, date, "sleep_duration", dto.sleepTimeSeconds, "seconds");
  pushMetric(rows, date, "deep_sleep", dto.deepSleepSeconds, "seconds");
  pushMetric(rows, date, "light_sleep", dto.lightSleepSeconds, "seconds");
  pushMetric(rows, date, "rem_sleep", dto.remSleepSeconds, "seconds");
  pushMetric(rows, date, "awake_time", dto.awakeSleepSeconds, "seconds");
  pushMetric(rows, date, "hrv", s.avgOvernightHrv, "ms");
  pushMetric(rows, date, "resting_hr", s.restingHeartRate, "bpm");
  pushMetric(rows, date, "avg_respiration", dto.averageRespirationValue, "brpm");
  pushMetric(rows, date, "avg_spo2", dto.averageSpO2Value, "percent");

  return rows;
}

/** Garmin getDailyWeightData payload -> weight/body-fat rows. */
export function parseWeight(weight: unknown, date: string): MetricRow[] {
  const rows: MetricRow[] = [];
  if (!weight || typeof weight !== "object") return rows;
  const w = weight as Record<string, unknown>;
  const avg = (w.totalAverage ?? {}) as Record<string, unknown>;

  const grams = avg.weight;
  if (typeof grams === "number" && Number.isFinite(grams)) {
    pushMetric(rows, date, "weight", grams / 1000, "kg");
  }
  pushMetric(rows, date, "body_fat_pct", avg.bodyFat, "percent");

  return rows;
}

/** Garmin getSteps() scalar -> steps row. */
export function parseSteps(steps: unknown, date: string): MetricRow[] {
  const rows: MetricRow[] = [];
  pushMetric(rows, date, "steps", steps, "count");
  return rows;
}

// Local "YYYY-MM-DD HH:mm:ss" (Garmin startTimeLocal) -> calendar date string.
function localDate(startTimeLocal: unknown): string | null {
  if (typeof startTimeLocal !== "string") return null;
  const m = startTimeLocal.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/** One Garmin activity object -> ActivityRow, or null if unusable. */
export function parseActivity(activity: unknown): ActivityRow | null {
  if (!activity || typeof activity !== "object") return null;
  const a = activity as Record<string, unknown>;

  const activityId = a.activityId;
  if (typeof activityId !== "number") return null;

  const date = localDate(a.startTimeLocal);
  const startTimeGmt = a.startTimeGMT;
  if (!date || typeof startTimeGmt !== "string") return null;

  const type = (a.activityType ?? {}) as Record<string, unknown>;
  const typeKey = typeof type.typeKey === "string" ? type.typeKey : "unknown";

  // Garmin GMT timestamps are "YYYY-MM-DD HH:mm:ss" (UTC, no zone marker).
  const startTime = new Date(startTimeGmt.replace(" ", "T") + "Z").toISOString();

  return {
    activityId,
    date,
    startTime,
    activityType: typeKey,
    activityName: typeof a.activityName === "string" ? a.activityName : null,
    durationSeconds: num(a.duration),
    distanceM: num(a.distance),
    calories: num(a.calories),
    averageHr: num(a.averageHR),
    maxHr: num(a.maxHR),
    aerobicTrainingEffect: num(a.aerobicTrainingEffect),
    anaerobicTrainingEffect: num(a.anaerobicTrainingEffect),
    trainingEffectLabel: typeof a.trainingEffectLabel === "string" ? a.trainingEffectLabel : null,
    activityTrainingLoad: num(a.activityTrainingLoad),
    moderateIntensityMinutes: int(a.moderateIntensityMinutes),
    vigorousIntensityMinutes: int(a.vigorousIntensityMinutes),
    vo2Max: num(a.vO2MaxValue),
    raw: activity,
  };
}
