export interface PlanVersion {
  version: number;
  content: string;
  savedAt: string;
}

export interface PlanRecord {
  personaId: string;
  date: string;
  versions: PlanVersion[];
}
