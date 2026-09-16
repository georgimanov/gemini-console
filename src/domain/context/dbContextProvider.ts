import { getPool } from "../../core/db.js";
import { TEMPLATE_SLUG_BY_FILENAME } from "./templateSlugs.js";
import { readResourceFile } from "./fileContextProvider.js";
import { buildPersonaContext } from "../personas/render.js";
import type { ContextProvider } from "./types.js";

/**
 * Resolves a persona's <referencedDocuments> entries into their content, now that most of
 * what they used to point at (weight, food list, supplements, templates, other personas)
 * lives in Postgres rather than resources/. Anything not recognized here (e.g.
 * data/atlas-sprint-log.xml, which stayed file-based) falls back to reading the file.
 */
export function createDbContextProvider(
  userId: string,
  documentPaths: string[],
  resourcesDir: string
): ContextProvider {
  return {
    id: "referencedDocuments",
    load: () => loadDbReferencedContext(userId, documentPaths, resourcesDir),
  };
}

async function loadDbReferencedContext(
  userId: string,
  documentPaths: string[],
  resourcesDir: string
): Promise<string> {
  const contents = await Promise.all(documentPaths.map((docPath) => resolveDocument(userId, docPath, resourcesDir)));
  const sections = documentPaths
    .map((docPath, i) => [docPath, contents[i]] as const)
    .filter((entry): entry is [string, string] => entry[1] !== null && entry[1].trim() !== "")
    .map(([docPath, content]) => `--- ${docPath} ---\n${content.trim()}`);
  return sections.join("\n\n");
}

async function resolveDocument(userId: string, docPath: string, resourcesDir: string): Promise<string | null> {
  if (docPath === "data/weight.csv") return formatWeightHistory(userId);
  if (docPath === "data/food-list.xml") return formatFoodList(userId);
  if (docPath === "data/supplements-and-vitamins.xml") return formatSupplements(userId);

  const templateSlug = TEMPLATE_SLUG_BY_FILENAME[docPath.split("/").pop() ?? ""];
  if (docPath.startsWith("templates/") && templateSlug) return fetchTemplate(userId, templateSlug);

  const personaMatch = docPath.match(/^personas\/(.+)\.xml$/);
  if (personaMatch) return fetchPersonaContext(userId, personaMatch[1]);

  // Not a DB-backed resource (e.g. data/atlas-sprint-log.xml) — fall back to the file.
  return readResourceFile(resourcesDir, docPath);
}

async function formatWeightHistory(userId: string): Promise<string | null> {
  const result = await getPool().query<{ date: string; metric: string; value: string }>(
    `select date::text as date, metric, value
     from garmin_metrics
     where user_id = $1 and category = 'body' and metric in ('weight', 'bmi')
     order by date desc`,
    [userId]
  );
  if (result.rows.length === 0) return null;

  const byDate = new Map<string, { weight?: string; bmi?: string }>();
  for (const row of result.rows) {
    const entry = byDate.get(row.date) ?? {};
    entry[row.metric as "weight" | "bmi"] = row.value;
    byDate.set(row.date, entry);
  }

  return Array.from(byDate.entries())
    .map(([date, { weight, bmi }]) => {
      const parts = [];
      if (weight) parts.push(`${weight}kg`);
      if (bmi) parts.push(`BMI ${bmi}`);
      return `${date}: ${parts.join(", ")}`;
    })
    .join("\n");
}

async function formatFoodList(userId: string): Promise<string | null> {
  const result = await getPool().query<{
    category: string;
    name: string;
    kcal_per_100g: string | null;
    protein_g: string | null;
    carbs_g: string | null;
    fat_g: string | null;
    nutrients: Record<string, unknown>;
  }>(
    `select category, name, kcal_per_100g, protein_g, carbs_g, fat_g, nutrients
     from food_items where user_id = $1 order by category, name`,
    [userId]
  );
  if (result.rows.length === 0) return null;

  const byCategory = new Map<string, string[]>();
  for (const row of result.rows) {
    const macros = [
      row.kcal_per_100g ? `${row.kcal_per_100g}kcal` : null,
      row.protein_g ? `protein ${row.protein_g}g` : null,
      row.carbs_g ? `carbs ${row.carbs_g}g` : null,
      row.fat_g ? `fat ${row.fat_g}g` : null,
    ].filter(Boolean);
    const extra = Object.keys(row.nutrients).length > 0 ? ` (${JSON.stringify(row.nutrients)})` : "";
    const line = `  - ${row.name}: ${macros.join(", ")}${extra}`;
    (byCategory.get(row.category) ?? byCategory.set(row.category, []).get(row.category)!).push(line);
  }

  return Array.from(byCategory.entries())
    .map(([category, lines]) => `${category}:\n${lines.join("\n")}`)
    .join("\n\n");
}

async function formatSupplements(userId: string): Promise<string | null> {
  const result = await getPool().query<{
    kind: string;
    name: string;
    brand: string | null;
    serving_info: Record<string, unknown>;
    nutrition: Record<string, unknown>;
  }>(`select kind, name, brand, serving_info, nutrition from supplements where user_id = $1 order by kind, name`, [
    userId,
  ]);
  if (result.rows.length === 0) return null;

  const byKind = new Map<string, string[]>();
  for (const row of result.rows) {
    const label = row.brand ? `${row.name} (${row.brand})` : row.name;
    const details = [
      Object.keys(row.serving_info).length > 0 ? JSON.stringify(row.serving_info) : null,
      Object.keys(row.nutrition).length > 0 ? JSON.stringify(row.nutrition) : null,
    ]
      .filter(Boolean)
      .join(" | ");
    const line = `  - ${label}${details ? `: ${details}` : ""}`;
    (byKind.get(row.kind) ?? byKind.set(row.kind, []).get(row.kind)!).push(line);
  }

  return Array.from(byKind.entries())
    .map(([kind, lines]) => `${kind}:\n${lines.join("\n")}`)
    .join("\n\n");
}

async function fetchTemplate(userId: string, slug: string): Promise<string | null> {
  const result = await getPool().query<{ content: string }>(
    "select content from user_templates where user_id = $1 and slug = $2",
    [userId, slug]
  );
  return result.rows[0]?.content ?? null;
}

async function fetchPersonaContext(userId: string, slug: string): Promise<string | null> {
  const result = await getPool().query<{ title: string; definition: unknown }>(
    "select title, definition from personas where user_id = $1 and slug = $2",
    [userId, slug]
  );
  const row = result.rows[0];
  if (!row) return null;
  return buildPersonaContext(row.definition, row.title);
}
