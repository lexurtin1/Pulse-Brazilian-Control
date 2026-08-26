/**
 * The editable fields of an ExpansionUpdate, named as an enum because they
 * are data, not just property names: a field name is persisted in
 * `manuallyEditedFields` and compared against on every regeneration, so a
 * typo would silently let Claude overwrite something the user had pinned.
 */
export enum ExpansionUpdateField {
  Headline = "headline",
  LastContact = "lastContact",
  NextMeeting = "nextMeeting",
  AwaitingInternal = "awaitingInternal",
  NextActions = "nextActions",
}

export const EXPANSION_UPDATE_FIELDS: readonly ExpansionUpdateField[] = Object.values(ExpansionUpdateField);
