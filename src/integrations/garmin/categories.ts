// Taxonomy of the data types Garmin sync collects. Doesn't change storage
// shape yet (localStore.ts still writes a flat metrics map + activities) —
// this is the vocabulary used to group them when reading, and to decide
// where a new metric belongs as more Garmin fields get promoted.
export const CATEGORIES = ["sleep", "recovery", "body", "movement", "workouts"] as const;
export type Category = (typeof CATEGORIES)[number];

/** Maps each promoted scalar metric (metrics map key) to its category. */
export const METRIC_CATEGORY: Record<string, Category> = {
  // sleep — parseSleep(), stages + score
  sleep_score: "sleep",
  sleep_duration: "sleep",
  deep_sleep: "sleep",
  light_sleep: "sleep",
  rem_sleep: "sleep",
  awake_time: "sleep",

  // recovery — parseSleep(), overnight vitals
  hrv: "recovery",
  resting_hr: "recovery",
  avg_respiration: "recovery",
  avg_spo2: "recovery",

  // body — parseWeight()
  weight: "body",
  body_fat_pct: "body",

  // movement — parseSteps()
  steps: "movement",
};

/** Category for a metric key; "workouts" is not in METRIC_CATEGORY since activities are keyed separately. */
export function categoryOf(metric: string): Category | undefined {
  return METRIC_CATEGORY[metric];
}

/** Groups a day's flat metrics map by category, for callers that want to read by category. */
export function groupMetricsByCategory(
  metrics: Record<string, { value: number; unit: string | null }>
): Partial<Record<Category, Record<string, { value: number; unit: string | null }>>> {
  const grouped: Partial<Record<Category, Record<string, { value: number; unit: string | null }>>> = {};
  for (const [metric, data] of Object.entries(metrics)) {
    const category = categoryOf(metric);
    if (!category) continue;
    (grouped[category] ??= {})[metric] = data;
  }
  return grouped;
}
