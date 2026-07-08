/** Serialisable projection of a TemperatureAssessment. Branded ids unwrapped to string; ConfidenceScore unwrapped to its raw number. */
export interface TemperatureAssessmentDto {
  id: string;
  accountId: string;
  band: string;
  rationale: string;
  assessedAt: string;
  assessedBy: string;
  confidenceScore: number;
  nextAction?: string;
  evidenceCount: number;
}
