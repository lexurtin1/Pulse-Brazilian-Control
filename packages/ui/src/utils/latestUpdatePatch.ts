import type {
  ExpansionUpdateDto,
  LastContactDto,
  NextMeetingDto,
  UpdateExpansionUpdateCommand,
} from "@pulse-brazil/application";

/** Everything the edit form always submits, whether or not the person touched it. */
export type SubmittedUpdate = Required<Omit<UpdateExpansionUpdateCommand, "unpinFields">>;

/** Dates round-trip as full ISO strings but are only ever edited as a day, so compare the day. */
function sameDay(a: string | undefined, b: string | undefined): boolean {
  return (a ?? "").slice(0, 10) === (b ?? "").slice(0, 10);
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((entry, index) => entry === b[index]);
}

function sameLastContact(next: LastContactDto | null, current: LastContactDto | undefined): boolean {
  if (!next || !current) return !next && !current;
  return (
    sameDay(next.occurredAt, current.occurredAt) &&
    sameList(next.contactNames, current.contactNames) &&
    next.discussed.trim() === current.discussed.trim()
  );
}

function sameNextMeeting(next: NextMeetingDto | null, current: NextMeetingDto | undefined): boolean {
  if (!next || !current) return !next && !current;
  return (
    sameDay(next.scheduledFor, current.scheduledFor) &&
    next.withWhom.trim() === current.withWhom.trim() &&
    next.purpose.trim() === current.purpose.trim()
  );
}

/**
 * Reduces a full form submission to only what the person actually changed.
 *
 * The edit form always posts all five fields, and the API pins exactly what
 * the body names — so sending the lot pinned the whole card on the first
 * save and froze it against every later document upload. Only a field whose
 * value moved is a hand edit worth protecting.
 *
 * With no current update there is nothing to diff against: the first save
 * writes the card whole, and pinning it is correct — a person typed it.
 */
export function changedFieldsOnly(
  submitted: SubmittedUpdate,
  current: ExpansionUpdateDto | null,
): UpdateExpansionUpdateCommand {
  if (!current) return submitted;

  const patch: UpdateExpansionUpdateCommand = {};
  if (submitted.headline.trim() !== current.headline.trim()) patch.headline = submitted.headline;
  if (!sameLastContact(submitted.lastContact, current.lastContact)) patch.lastContact = submitted.lastContact;
  if (!sameNextMeeting(submitted.nextMeeting, current.nextMeeting)) patch.nextMeeting = submitted.nextMeeting;
  if (!sameList(submitted.awaitingInternal, current.awaitingInternal)) patch.awaitingInternal = submitted.awaitingInternal;
  if (!sameList(submitted.nextActions, current.nextActions)) patch.nextActions = submitted.nextActions;
  return patch;
}
