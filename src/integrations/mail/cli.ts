// CLI entry point for sending mail.
// Run: npm run send:mail -- --to <email> --subject <subject> [--body <text> | --file <path>] [--html]
// Without --html, a --file ending in .md is rendered as markdown; anything else is sent as plain text.
import * as fs from "node:fs";
import * as path from "node:path";
import { sendMail } from "./send.js";
import type { MailFormat } from "./types.js";

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value !== undefined && !value.startsWith("--")) {
      args[key] = value;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const to = typeof args.to === "string" ? args.to : undefined;
const subject = typeof args.subject === "string" ? args.subject : undefined;
const file = typeof args.file === "string" ? args.file : undefined;
let body = typeof args.body === "string" ? args.body : undefined;
const forceHtml = args.html === true;

if (!to || !subject) {
  console.error(
    "Usage: npm run send:mail -- --to <email> --subject <subject> [--body <text> | --file <path>] [--html]"
  );
  process.exit(1);
}

let format: MailFormat = "text";
if (file) {
  const absolutePath = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
  body = fs.readFileSync(absolutePath, "utf8");
  format = file.toLowerCase().endsWith(".md") ? "markdown" : "text";
}
if (forceHtml) format = "html";

if (!body) {
  console.error("Provide either --body <text> or --file <path> containing the email body.");
  process.exit(1);
}

sendMail({ to, subject, body, format })
  .then((result) => {
    console.log(`Email sent. Message ID: ${result.messageId}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Send failed:", err);
    process.exit(1);
  });
