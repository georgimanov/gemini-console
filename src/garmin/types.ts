/** A single per-day scalar metric (sleep score, HRV, weight, steps, ...). */
export interface MetricRow {
  date: string;
  metric: string;
  value: number;
  unit: string | null;
}

/** A single Garmin activity (run, ride, ...), hybrid promoted fields + raw payload. */
export interface ActivityRow {
  activityId: number;
  date: string;
  startTime: string;
  activityType: string;
  activityName: string | null;
  durationSeconds: number | null;
  distanceM: number | null;
  calories: number | null;
  averageHr: number | null;
  maxHr: number | null;
  aerobicTrainingEffect: number | null;
  anaerobicTrainingEffect: number | null;
  trainingEffectLabel: string | null;
  activityTrainingLoad: number | null;
  moderateIntensityMinutes: number | null;
  vigorousIntensityMinutes: number | null;
  vo2Max: number | null;
  raw: unknown;
}

/** One category's scalar metrics for one date, stored as resources/data/garmin/{category}_{date}.json. */
export interface MetricCategoryRecord {
  date: string;
  category: string;
  metrics: Record<string, { value: number; unit: string | null }>;
}

/** The "workouts" category for one date, stored as resources/data/garmin/workouts_{date}.json. */
export interface WorkoutsRecord {
  date: string;
  category: "workouts";
  activities: Record<string, ActivityRow>;
}
