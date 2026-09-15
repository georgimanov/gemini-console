// CLI entry point for the Garmin sync.
// Run: npm run sync:garmin -- [days] [--force]
// Without --force, the sync is skipped when today's sleep data is already stored.
import * as path from "node:path";
import { syncGarmin } from "./sync.js";

const args = process.argv.slice(2);
const force = args.includes("--force");
const days = Number(args.find((a) => !a.startsWith("--"))) || 7;

const dataDir = path.join(import.meta.dirname, "..", "..", "resources", "data", "garmin");

syncGarmin({ days, force, dataDir })
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error("Sync failed:", err);
    process.exit(1);
  });
