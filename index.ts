import * as path from "node:path";
import { loadPersonas } from "./src/domain/personas/index.js";
import { loadBlocklist } from "./src/app/input/index.js";
import { loadProfile } from "./src/domain/profile/index.js";
import { createTools } from "./src/domain/tools/registry.js";
import { startRepl } from "./src/app/repl.js";

const resourcesDir = path.join(import.meta.dirname, "resources");
const reportsDir = path.join(import.meta.dirname, "reports");
const garminDataDir = path.join(resourcesDir, "data", "garmin");

const personas = await loadPersonas(resourcesDir);
const blocklist = await loadBlocklist(resourcesDir);
const profile = await loadProfile(resourcesDir);
const tools = createTools(profile, garminDataDir);

await startRepl(personas, blocklist, reportsDir, tools);
