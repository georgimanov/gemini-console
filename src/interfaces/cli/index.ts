import { loadCore } from "../../core/bootstrap.js";
import { createSessionStore } from "../../core/sessionStore.js";
import { Defaults } from "../../core/defaults.js";
import { loadBlocklist } from "./input/index.js";
import { startRepl } from "./repl.js";

const { resourcesDir, reportsDir, personas, makeTools } = await loadCore();

if (personas.size === 0) {
  console.log(
    "No personas found. Add a persona XML file to resources/personas before starting the console."
  );
  throw new Error("No personas available.");
}

const blocklist = await loadBlocklist(resourcesDir);
const store = createSessionStore(personas, makeTools);
const { session } = store.create(Defaults.PERSONA_ID);

await startRepl(session, personas, blocklist, reportsDir);
