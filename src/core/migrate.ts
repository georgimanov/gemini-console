import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getPool } from "./db.js";

/** Runs every migrations/*.sql file in filename order against DB_CONNECTION_STRING. */
async function main() {
  const migrationsDir = path.join(import.meta.dirname, "..", "..", "migrations");
  const files = (await fs.readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();

  const pool = getPool();
  for (const file of files) {
    const sql = await fs.readFile(path.join(migrationsDir, file), "utf-8");
    console.log(`Applying ${file}...`);
    await pool.query(sql);
  }
  console.log(`Applied ${files.length} migration(s).`);
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
