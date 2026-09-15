export type Command =
  | { type: "empty" }
  | { type: "quit" }
  | { type: "help" }
  | { type: "switchPersona"; personaId: string }
  | { type: "report"; prompt: string }
  | { type: "mail"; to: string; prompt: string }
  | { type: "message"; text: string }
  | { type: "rejected"; reason: string };

export const KNOWN_COMMANDS = ["/quit", "/help", "/report", "/mail"] as const;
