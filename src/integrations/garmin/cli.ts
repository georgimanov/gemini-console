// CLI entry point for the Garmin sync.
// Run: npm run sync:garmin -- [days] [--force]
// Without --force, the sync is skipped when today's sleep data is already stored.
import { getPool } from "../../core/db.js";
import { resolveOwnerUserId } from "../../core/owner.js";
import { syncGarmin } from "./sync.js";

const args = process.argv.slice(2);
const force = args.includes("--force");
const days = Number(args.find((a) => !a.startsWith("--"))) || 7;

const pool = getPool();
const userId = await resolveOwnerUserId(pool);

syncGarmin({ days, force, userId })
  .then(async (result) => {
    console.log(JSON.stringify(result, null, 2));
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("Sync failed:", err);
    await pool.end();
    process.exit(1);
  });
