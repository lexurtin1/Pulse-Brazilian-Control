/**
 * What kind of Brazil-relevant thing a LocationRecord represents. Determines
 * which optional fields are meaningful — `eventDate` for Event/Visit,
 * `isPrimary` for Office — without splitting into separate entity types.
 */
export enum LocationRecordKind {
  Office = "Office",
  Event = "Event",
  Visit = "Visit",
  SignalLocation = "SignalLocation",
  Other = "Other",
}
