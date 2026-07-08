export interface RecommendedActionDto {
  description: string;
  dueDate?: string;
}

/**
 * Serialisable projection of an Insight. `recommendedActions` is plural
 * here even though the domain's `Insight.recommendedAction` is singular and
 * optional — mapped to a 0-or-1-element array so presentation always deals
 * with a list, not a special-cased optional field. `promptProfileName`,
 * `promptProfileVersion`, and `contextBundleId` are only present when the
 * insight's origin actually involved Claude.
 */
export interface InsightDto {
  id: string;
  summary: string;
  recommendedActions: RecommendedActionDto[];
  confidenceScore: number;
  evidenceCount: number;
  promptProfileName?: string;
  promptProfileVersion?: string;
  contextBundleId?: string;
  origin: string;
  createdAt: string;
}
