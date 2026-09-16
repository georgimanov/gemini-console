// Postgres-backed storage for Garmin data: garmin_metrics (sleep/recovery/body/movement,
// one row per date+metric) and garmin_activities (workouts), both scoped by user_id.
import { getPool } from "../../core/db.js";
import { categoryOf } from "./categories.js";
import type { ActivityRow, MetricCategoryRecord, MetricRow, WorkoutsRecord } from "./types.js";

/** Merges metric rows into garmin_metrics (overwriting same date+metric values). */
export async function upsertMetrics(userId: string, rows: MetricRow[]): Promise<number> {
  const pool = getPool();
  let written = 0;

  for (const row of rows) {
    const category = categoryOf(row.metric);
    if (!category) continue; // unpromoted metric with no category — skip rather than guess

    await pool.query(
      `insert into garmin_metrics (user_id, date, category, metric, value, unit)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (user_id, date, metric) do update set
         value = excluded.value, unit = excluded.unit, category = excluded.category`,
      [userId, row.date, category, row.metric, row.value, row.unit]
    );
    written += 1;
  }

  return written;
}

/** Upserts one activity into garmin_activities, keyed by activityId (overwrite on re-sync). */
export async function upsertActivity(userId: string, row: ActivityRow): Promise<void> {
  await getPool().query(
    `insert into garmin_activities (
       user_id, activity_id, date, start_time, activity_type, activity_name,
       duration_seconds, distance_m, calories, average_hr, max_hr,
       aerobic_training_effect, anaerobic_training_effect, training_effect_label,
       activity_training_load, moderate_intensity_minutes, vigorous_intensity_minutes,
       vo2_max, raw
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     on conflict (user_id, activity_id) do update set
       date = excluded.date,
       start_time = excluded.start_time,
       activity_type = excluded.activity_type,
       activity_name = excluded.activity_name,
       duration_seconds = excluded.duration_seconds,
       distance_m = excluded.distance_m,
       calories = excluded.calories,
       average_hr = excluded.average_hr,
       max_hr = excluded.max_hr,
       aerobic_training_effect = excluded.aerobic_training_effect,
       anaerobic_training_effect = excluded.anaerobic_training_effect,
       training_effect_label = excluded.training_effect_label,
       activity_training_load = excluded.activity_training_load,
       moderate_intensity_minutes = excluded.moderate_intensity_minutes,
       vigorous_intensity_minutes = excluded.vigorous_intensity_minutes,
       vo2_max = excluded.vo2_max,
       raw = excluded.raw`,
    [
      userId,
      row.activityId,
      row.date,
      row.startTime,
      row.activityType,
      row.activityName,
      row.durationSeconds,
      row.distanceM,
      row.calories,
      row.averageHr,
      row.maxHr,
      row.aerobicTrainingEffect,
      row.anaerobicTrainingEffect,
      row.trainingEffectLabel,
      row.activityTrainingLoad,
      row.moderateIntensityMinutes,
      row.vigorousIntensityMinutes,
      row.vo2Max,
      JSON.stringify(row.raw),
    ]
  );
}

/** True when this date already has a sleep_duration row (i.e. that day was synced). */
export async function hasSleepData(userId: string, date: string): Promise<boolean> {
  const result = await getPool().query(
    "select 1 from garmin_metrics where user_id = $1 and date = $2 and metric = 'sleep_duration' limit 1",
    [userId, date]
  );
  return result.rows.length > 0;
}

/** Reads one category's records across a set of dates, dropping days with no data. */
export async function readMetricsRange(
  userId: string,
  category: string,
  dates: string[]
): Promise<MetricCategoryRecord[]> {
  if (dates.length === 0) return [];

  const result = await getPool().query<{ date: string; metric: string; value: string; unit: string | null }>(
    `select date::text as date, metric, value, unit
     from garmin_metrics
     where user_id = $1 and category = $2 and date = any($3::date[])`,
    [userId, category, dates]
  );

  const byDate = new Map<string, MetricCategoryRecord>();
  for (const row of result.rows) {
    const record = byDate.get(row.date) ?? { date: row.date, category, metrics: {} };
    record.metrics[row.metric] = { value: Number(row.value), unit: row.unit };
    byDate.set(row.date, record);
  }
  return Array.from(byDate.values());
}

/** Reads workouts across a set of dates, dropping days with no activities. */
export async function readWorkoutsRange(userId: string, dates: string[]): Promise<WorkoutsRecord[]> {
  if (dates.length === 0) return [];

  const result = await getPool().query(
    `select activity_id, date::text as date, start_time, activity_type, activity_name,
            duration_seconds, distance_m, calories, average_hr, max_hr,
            aerobic_training_effect, anaerobic_training_effect, training_effect_label,
            activity_training_load, moderate_intensity_minutes, vigorous_intensity_minutes,
            vo2_max, raw
     from garmin_activities
     where user_id = $1 and date = any($2::date[])`,
    [userId, dates]
  );

  const byDate = new Map<string, WorkoutsRecord>();
  for (const r of result.rows) {
    const record: WorkoutsRecord =
      byDate.get(r.date) ?? { date: r.date, category: "workouts", activities: {} };
    const activity: ActivityRow = {
      activityId: Number(r.activity_id),
      date: r.date,
      startTime: r.start_time instanceof Date ? r.start_time.toISOString() : r.start_time,
      activityType: r.activity_type,
      activityName: r.activity_name,
      durationSeconds: r.duration_seconds === null ? null : Number(r.duration_seconds),
      distanceM: r.distance_m === null ? null : Number(r.distance_m),
      calories: r.calories === null ? null : Number(r.calories),
      averageHr: r.average_hr === null ? null : Number(r.average_hr),
      maxHr: r.max_hr === null ? null : Number(r.max_hr),
      aerobicTrainingEffect: r.aerobic_training_effect === null ? null : Number(r.aerobic_training_effect),
      anaerobicTrainingEffect: r.anaerobic_training_effect === null ? null : Number(r.anaerobic_training_effect),
      trainingEffectLabel: r.training_effect_label,
      activityTrainingLoad: r.activity_training_load === null ? null : Number(r.activity_training_load),
      moderateIntensityMinutes:
        r.moderate_intensity_minutes === null ? null : Number(r.moderate_intensity_minutes),
      vigorousIntensityMinutes:
        r.vigorous_intensity_minutes === null ? null : Number(r.vigorous_intensity_minutes),
      vo2Max: r.vo2_max === null ? null : Number(r.vo2_max),
      raw: r.raw,
    };
    record.activities[String(activity.activityId)] = activity;
    byDate.set(r.date, record);
  }
  return Array.from(byDate.values());
}
