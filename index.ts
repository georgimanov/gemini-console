import * as path from "node:path";
import { loadPersonas } from "./src/personas/index.js";
import { loadBlocklist } from "./src/input/index.js";
import { loadProfile } from "./src/profile.js";
import { createTools } from "./src/tools/registry.js";
import { startRepl } from "./src/repl.js";

const resourcesDir = path.join(import.meta.dirname, "resources");
const reportsDir = path.join(import.meta.dirname, "reports");
const garminDataDir = path.join(resourcesDir, "data", "garmin");

const personas = await loadPersonas(resourcesDir);
const blocklist = await loadBlocklist(resourcesDir);
const profile = await loadProfile(resourcesDir);
const tools = createTools(profile, garminDataDir);

await startRepl(personas, blocklist, reportsDir, tools);
