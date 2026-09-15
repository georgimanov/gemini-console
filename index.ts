import * as path from "node:path";
import { loadPersonas } from "./src/domain/personas/index.js";
import { loadBlocklist } from "./src/app/input/index.js";
import { loadProfile } from "./src/domain/profile/index.js";
import { createTools } from "./src/domain/tools/registry.js";
import { startRepl } from "./src/app/repl.js";

const resourcesDir = path.join(import.meta.dirname, "resources");
const reportsDir = path.join(import.meta.dirname, "reports");
const garminDataDir = path.join(resourcesDir, "data", "garmin");
const plansDataDir = path.join(resourcesDir, "data", "plans");

const personas = await loadPersonas(resourcesDir);
const blocklist = await loadBlocklist(resourcesDir);
const profile = await loadProfile(resourcesDir);
const personaState = { id: null as string | null };
const tools = createTools(profile, garminDataDir, plansDataDir, personaState);

await startRepl(personas, blocklist, reportsDir, tools, personaState);
