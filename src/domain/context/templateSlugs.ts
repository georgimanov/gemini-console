/**
 * Maps the old resources/templates/*.md filenames to the user_templates.slug they were
 * migrated under (see migrateData.ts) — shared with dbContextProvider.ts, which resolves
 * a persona's <referencedDocuments><document>templates/...</document> entries back to
 * the same slug to read from Postgres instead.
 */
export const TEMPLATE_SLUG_BY_FILENAME: Record<string, string> = {
  "morning_task_template.md": "morning_briefing",
  "meal_plan_template.md": "meal_plan",
};
