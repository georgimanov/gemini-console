import * as path from "node:path";
import { loadPersonas } from "./src/personas.js";
import { startRepl } from "./src/repl.js";

const personasDir = path.join(import.meta.dirname, "resources", "personas");
const personas = await loadPersonas(personasDir);

await startRepl(personas);
