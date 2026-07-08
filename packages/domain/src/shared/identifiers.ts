/**
 * Branded string identifiers.
 *
 * The domain never generates identifiers itself — every entity is constructed
 * with an id supplied by the caller (application/infrastructure layer), which
 * may originate from a database sequence, a uuid, or an external system such
 * as Salesforce. Branding prevents an AccountId from being passed where a
 * SignalId is expected, without adding any runtime dependency.
 */
export type Brand<Value, Tag extends string> = Value & { readonly __brand: Tag };

export type AccountId = Brand<string, "AccountId">;
export type OfficeLocationId = Brand<string, "OfficeLocationId">;
export type TemperatureAssessmentId = Brand<string, "TemperatureAssessmentId">;
export type AccountRelationshipId = Brand<string, "AccountRelationshipId">;
export type ThemeId = Brand<string, "ThemeId">;
export type SignalId = Brand<string, "SignalId">;
export type DocumentId = Brand<string, "DocumentId">;
export type NoteId = Brand<string, "NoteId">;
export type InsightId = Brand<string, "InsightId">;
export type ContextBundleId = Brand<string, "ContextBundleId">;
export type PromptProfileId = Brand<string, "PromptProfileId">;

export function asAccountId(value: string): AccountId {
  return value as AccountId;
}
export function asOfficeLocationId(value: string): OfficeLocationId {
  return value as OfficeLocationId;
}
export function asTemperatureAssessmentId(value: string): TemperatureAssessmentId {
  return value as TemperatureAssessmentId;
}
export function asAccountRelationshipId(value: string): AccountRelationshipId {
  return value as AccountRelationshipId;
}
export function asThemeId(value: string): ThemeId {
  return value as ThemeId;
}
export function asSignalId(value: string): SignalId {
  return value as SignalId;
}
export function asDocumentId(value: string): DocumentId {
  return value as DocumentId;
}
export function asNoteId(value: string): NoteId {
  return value as NoteId;
}
export function asInsightId(value: string): InsightId {
  return value as InsightId;
}
export function asContextBundleId(value: string): ContextBundleId {
  return value as ContextBundleId;
}
export function asPromptProfileId(value: string): PromptProfileId {
  return value as PromptProfileId;
}
