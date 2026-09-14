import * as path from "node:path";
import { loadPersonas } from "./src/personas.js";
import { startRepl } from "./src/repl.js";

const resourcesDir = path.join(import.meta.dirname, "resources");
const personas = await loadPersonas(resourcesDir);

await startRepl(personas);
