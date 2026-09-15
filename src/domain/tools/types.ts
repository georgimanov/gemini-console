/** A minimal JSON Schema subset — enough to describe a tool's parameters to any provider. */
export interface ToolParameters {
  type: "object";
  properties: Record<string, { type: string; description?: string }>;
  required?: string[];
}

/**
 * A function the model can call mid-conversation to pull in data it decides it needs
 * (sleep, activities, weather, athlete profile, ...) instead of everything being
 * injected into every system instruction up front.
 */
export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameters;
  execute(args: Record<string, unknown>): Promise<string>;
}
