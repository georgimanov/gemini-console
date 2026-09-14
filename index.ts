import * as path from "node:path";
import { loadPersonas } from "./src/personas.js";
import { loadBlocklist } from "./src/input/index.js";
import { startRepl } from "./src/repl.js";

const resourcesDir = path.join(import.meta.dirname, "resources");
const reportsDir = path.join(import.meta.dirname, "reports");
const personas = await loadPersonas(resourcesDir);
const blocklist = await loadBlocklist(resourcesDir);

await startRepl(personas, blocklist, reportsDir);
