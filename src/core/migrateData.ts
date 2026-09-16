import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parseStringPromise } from "xml2js";
import { getPool } from "./db.js";
import { OWNER_EMAIL } from "./owner.js";
import { TEMPLATE_SLUG_BY_FILENAME } from "../domain/context/templateSlugs.js";
import type { MetricCategoryRecord, WorkoutsRecord } from "../integrations/garmin/types.js";
import type { PlanRecord } from "../integrations/planStore/types.js";

/** profile.xml has just <location> today; loaded directly here rather than through
 * domain/profile/index.ts, since that module now reads from athlete_profiles itself. */
async function readProfileXml(resourcesDir: string): Promise<{ location: string }> {
  const filePath = path.join(resourcesDir, "profile.xml");
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch {
    return { location: "" };
  }
  const parsed = await parseStringPromise(content);
  const location = parsed.profile?.location?.[0];
  return { location: typeof location === "string" ? location : location?._ ?? "" };
}

/**
 * One-off migration: loads the existing file-based resources/ data (profile, personas,
 * Garmin sync, plans) into the Neon tables from migrations/0001_init.sql. There's no
 * Google login wired up yet, so this seeds a single owner user by email and gives it a
 * placeholder google_sub — swap that for the real `sub` claim once OAuth lands.
 */

const GARMIN_FILE_RE = /^(sleep|recovery|body|movement)_(\d{4}-\d{2}-\d{2})\.json$/;
const WORKOUTS_FILE_RE = /^workouts_(\d{4}-\d{2}-\d{2})\.json$/;

const MONTHS: Record<string, string> = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12",
};

/** Extracts the leading number from strings like "22g", "460mg", "26.7" (bare kcal). */
function parseNum(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const match = String(value).match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

async function upsertGarminMetric(
  pool: import("pg").Pool,
  userId: string,
  date: string,
  category: string,
  metric: string,
  value: number,
  unit: string | null
): Promise<void> {
  await pool.query(
    `insert into garmin_metrics (user_id, date, category, metric, value, unit)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (user_id, date, metric) do update set
       value = excluded.value, unit = excluded.unit, category = excluded.category`,
    [userId, date, category, metric, value, unit]
  );
}

async function upsertOwner(pool: import("pg").Pool): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `insert into users (google_sub, email, display_name)
     values ($1, $2, $3)
     on conflict (email) do update set email = excluded.email
     returning id`,
    [`pending:${OWNER_EMAIL}`, OWNER_EMAIL, "Georgi Manov"]
  );
  return result.rows[0].id;
}

async function migrateProfile(pool: import("pg").Pool, userId: string, resourcesDir: string): Promise<void> {
  const profile = await readProfileXml(resourcesDir);
  await pool.query(
    `insert into athlete_profiles (user_id, location)
     values ($1, $2)
     on conflict (user_id) do update set location = excluded.location, updated_at = now()`,
    [userId, profile.location || null]
  );
  console.log(`  athlete_profiles: location="${profile.location}"`);
}

async function migratePersonas(
  pool: import("pg").Pool,
  userId: string,
  resourcesDir: string
): Promise<Map<string, string>> {
  const personasDir = path.join(resourcesDir, "personas");
  const files = (await fs.readdir(personasDir)).filter((f) => f.endsWith(".xml"));
  const idBySlug = new Map<string, string>();

  for (const file of files) {
    const content = await fs.readFile(path.join(personasDir, file), "utf-8");
    const parsed = await parseStringPromise(content);
    const persona = parsed.persona;
    const slug: string = persona.$.id;
    const title: string = persona.$.title;
    const mission: string | null = persona.mission?.[0]
      ? typeof persona.mission[0] === "string"
        ? persona.mission[0]
        : persona.mission[0]._ ?? null
      : null;
    const referencedDocuments: string[] = (persona.referencedDocuments?.[0]?.document ?? []).map((d: any) =>
      typeof d === "string" ? d : d._ ?? ""
    );

    const { $: _attrs, referencedDocuments: _refs, ...definition } = persona;

    const result = await pool.query<{ id: string }>(
      `insert into personas (user_id, slug, title, mission, definition, referenced_documents)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (user_id, slug) do update set
         title = excluded.title,
         mission = excluded.mission,
         definition = excluded.definition,
         referenced_documents = excluded.referenced_documents,
         updated_at = now()
       returning id`,
      [userId, slug, title, mission, JSON.stringify(definition), referencedDocuments]
    );
    idBySlug.set(slug, result.rows[0].id);
    console.log(`  personas: ${slug} -> ${result.rows[0].id}`);
  }

  return idBySlug;
}

async function migrateGarmin(pool: import("pg").Pool, userId: string, resourcesDir: string): Promise<void> {
  const garminDir = path.join(resourcesDir, "data", "garmin");
  const files = await fs.readdir(garminDir);

  let metricCount = 0;
  let activityCount = 0;

  for (const file of files) {
    const metricMatch = file.match(GARMIN_FILE_RE);
    if (metricMatch) {
      const [, category, date] = metricMatch;
      const record: MetricCategoryRecord = JSON.parse(await fs.readFile(path.join(garminDir, file), "utf-8"));
      for (const [metric, { value, unit }] of Object.entries(record.metrics)) {
        await upsertGarminMetric(pool, userId, date, category, metric, value, unit);
        metricCount += 1;
      }
      continue;
    }

    const workoutsMatch = file.match(WORKOUTS_FILE_RE);
    if (workoutsMatch) {
      const record: WorkoutsRecord = JSON.parse(await fs.readFile(path.join(garminDir, file), "utf-8"));
      for (const activity of Object.values(record.activities)) {
        await pool.query(
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
            activity.activityId,
            activity.date,
            activity.startTime,
            activity.activityType,
            activity.activityName,
            activity.durationSeconds,
            activity.distanceM,
            activity.calories,
            activity.averageHr,
            activity.maxHr,
            activity.aerobicTrainingEffect,
            activity.anaerobicTrainingEffect,
            activity.trainingEffectLabel,
            activity.activityTrainingLoad,
            activity.moderateIntensityMinutes,
            activity.vigorousIntensityMinutes,
            activity.vo2Max,
            JSON.stringify(activity.raw),
          ]
        );
        activityCount += 1;
      }
    }
  }

  console.log(`  garmin_metrics: ${metricCount} rows, garmin_activities: ${activityCount} rows`);
}

async function migratePlans(
  pool: import("pg").Pool,
  userId: string,
  resourcesDir: string,
  personaIdBySlug: Map<string, string>
): Promise<void> {
  const plansDir = path.join(resourcesDir, "data", "plans");
  let files: string[];
  try {
    files = (await fs.readdir(plansDir)).filter((f) => f.endsWith(".json"));
  } catch {
    console.log("  plans: no plans directory, skipping");
    return;
  }

  let planCount = 0;
  let versionCount = 0;

  for (const file of files) {
    const record: PlanRecord = JSON.parse(await fs.readFile(path.join(plansDir, file), "utf-8"));
    const personaId = personaIdBySlug.get(record.personaId);
    if (!personaId) {
      console.warn(`  plans: skipping "${file}", unknown persona "${record.personaId}"`);
      continue;
    }

    const planResult = await pool.query<{ id: string }>(
      `insert into plans (user_id, persona_id, date)
       values ($1, $2, $3)
       on conflict (persona_id, date) do update set persona_id = excluded.persona_id
       returning id`,
      [userId, personaId, record.date]
    );
    const planId = planResult.rows[0].id;
    planCount += 1;

    for (const version of record.versions) {
      await pool.query(
        `insert into plan_versions (plan_id, version, content, saved_at)
         values ($1, $2, $3, $4)
         on conflict (plan_id, version) do update set
           content = excluded.content, saved_at = excluded.saved_at`,
        [planId, version.version, version.content, version.savedAt]
      );
      versionCount += 1;
    }
  }

  console.log(`  plans: ${planCount} rows, plan_versions: ${versionCount} rows`);
}

/** Weight scale export (resources/data/weight.csv), folded into garmin_metrics like any
 * other observed body metric — it's dynamic, per-person data, same as the Garmin sync. */
async function migrateWeightCsv(pool: import("pg").Pool, userId: string, resourcesDir: string): Promise<void> {
  const filePath = path.join(resourcesDir, "data", "weight.csv");
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch {
    console.log("  weight.csv: not found, skipping");
    return;
  }

  const lines = content
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(1); // drop header row

  const dateLineRe = /^"?\s*(\d{4})\s+([A-Za-z]{3})\s+(\d{1,2})\s*"?,?$/;
  let currentDate: string | null = null;
  let count = 0;

  for (const line of lines) {
    const dateMatch = line.match(dateLineRe);
    if (dateMatch) {
      const [, year, monStr, day] = dateMatch;
      const month = MONTHS[monStr];
      if (month) currentDate = `${year}-${month}-${day.padStart(2, "0")}`;
      continue;
    }
    if (!currentDate) continue;

    const fields = line.split(",");
    const weightKg = parseNum(fields[1]);
    const bmi = parseNum(fields[3]);

    if (weightKg !== null) {
      await upsertGarminMetric(pool, userId, currentDate, "body", "weight", weightKg, "kg");
      count += 1;
    }
    if (bmi !== null) {
      await upsertGarminMetric(pool, userId, currentDate, "body", "bmi", bmi, null);
      count += 1;
    }
  }

  console.log(`  weight.csv -> garmin_metrics: ${count} rows`);
}

/** Per-user template copies (resources/templates/*.md), previously shared static files. */
async function migrateTemplates(pool: import("pg").Pool, userId: string, resourcesDir: string): Promise<void> {
  const templatesDir = path.join(resourcesDir, "templates");
  let count = 0;

  for (const [file, slug] of Object.entries(TEMPLATE_SLUG_BY_FILENAME)) {
    let content: string;
    try {
      content = await fs.readFile(path.join(templatesDir, file), "utf-8");
    } catch {
      continue;
    }
    await pool.query(
      `insert into user_templates (user_id, slug, content)
       values ($1, $2, $3)
       on conflict (user_id, slug) do update set content = excluded.content, updated_at = now()`,
      [userId, slug, content]
    );
    count += 1;
  }

  console.log(`  user_templates: ${count} rows`);
}

/** Food/nutrition catalog (resources/data/food-list.xml) as per-user preference data. */
async function migrateFoodList(pool: import("pg").Pool, userId: string, resourcesDir: string): Promise<void> {
  const filePath = path.join(resourcesDir, "data", "food-list.xml");
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch {
    console.log("  food_items: no food-list.xml, skipping");
    return;
  }

  const parsed = await parseStringPromise(content);
  const categories = parsed.food_list?.category ?? [];
  let count = 0;

  for (const category of categories) {
    const categoryName: string = category.$.name;
    for (const item of category.item ?? []) {
      const itemName: string = item.$.name;
      const nutrition = item.nutrition_per_100g?.[0]?.$ ?? {};
      const { kcal, protein, carbs, carbohydrates, fat, ...rest } = nutrition;

      await pool.query(
        `insert into food_items (user_id, category, name, kcal_per_100g, protein_g, carbs_g, fat_g, nutrients)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (user_id, name) do update set
           category = excluded.category,
           kcal_per_100g = excluded.kcal_per_100g,
           protein_g = excluded.protein_g,
           carbs_g = excluded.carbs_g,
           fat_g = excluded.fat_g,
           nutrients = excluded.nutrients`,
        [
          userId,
          categoryName,
          itemName,
          parseNum(kcal),
          parseNum(protein),
          parseNum(carbs ?? carbohydrates),
          parseNum(fat),
          JSON.stringify(rest),
        ]
      );
      count += 1;
    }
  }

  console.log(`  food_items: ${count} rows`);
}

/** Normalizes one xml2js supplement/vitamin/amino-acid node into {name, brand, servingInfo, nutrition}. */
function normalizeSupplementNode(node: unknown): {
  name: string;
  brand: string | null;
  servingInfo: Record<string, unknown>;
  nutrition: Record<string, unknown>;
} {
  if (typeof node === "string") {
    return { name: node.trim(), brand: null, servingInfo: {}, nutrition: {} };
  }
  const { $: attrs = {}, _: text, ...children } = node as Record<string, any>;
  const name: string = attrs.name ?? attrs.product ?? (text ? String(text).trim() : "Unnamed");
  const brand: string | null = attrs.brand ?? null;
  const { name: _n, product: _p, brand: _b, ...servingInfo } = attrs;
  return { name, brand, servingInfo, nutrition: children };
}

/** Supplement/vitamin catalog (resources/data/supplements-and-vitamins.xml) as per-user data. */
async function migrateSupplements(pool: import("pg").Pool, userId: string, resourcesDir: string): Promise<void> {
  const filePath = path.join(resourcesDir, "data", "supplements-and-vitamins.xml");
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch {
    console.log("  supplements: no supplements-and-vitamins.xml, skipping");
    return;
  }

  const parsed = await parseStringPromise(content);
  const stack = parsed.health_stack ?? {};
  const groups: Array<[string, unknown[]]> = [
    ["supplement", stack.supplements?.[0]?.supplement ?? []],
    ["amino_acid", stack.amino_acids?.[0]?.product ?? []],
    ["vitamin", stack.vitamins?.[0]?.vitamin ?? []],
  ];

  let count = 0;
  for (const [kind, nodes] of groups) {
    for (const node of nodes) {
      const { name, brand, servingInfo, nutrition } = normalizeSupplementNode(node);
      await pool.query(
        `insert into supplements (user_id, kind, name, brand, serving_info, nutrition)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (user_id, name) do update set
           kind = excluded.kind, brand = excluded.brand,
           serving_info = excluded.serving_info, nutrition = excluded.nutrition`,
        [userId, kind, name, brand, JSON.stringify(servingInfo), JSON.stringify(nutrition)]
      );
      count += 1;
    }
  }

  console.log(`  supplements: ${count} rows`);
}

async function main() {
  const resourcesDir = path.join(import.meta.dirname, "..", "..", "resources");
  const pool = getPool();

  console.log("Seeding owner user...");
  const userId = await upsertOwner(pool);
  console.log(`  users: ${OWNER_EMAIL} -> ${userId}`);

  console.log("Migrating athlete profile...");
  await migrateProfile(pool, userId, resourcesDir);

  console.log("Migrating personas...");
  const personaIdBySlug = await migratePersonas(pool, userId, resourcesDir);

  console.log("Migrating weight.csv...");
  await migrateWeightCsv(pool, userId, resourcesDir);

  console.log("Migrating Garmin data...");
  await migrateGarmin(pool, userId, resourcesDir);

  console.log("Migrating plans...");
  await migratePlans(pool, userId, resourcesDir, personaIdBySlug);

  console.log("Migrating templates...");
  await migrateTemplates(pool, userId, resourcesDir);

  console.log("Migrating food list...");
  await migrateFoodList(pool, userId, resourcesDir);

  console.log("Migrating supplements...");
  await migrateSupplements(pool, userId, resourcesDir);

  await pool.end();
  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
