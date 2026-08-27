/** All timestamps are ISO strings — the API boundary never ships Date objects. */
export interface LastContactDto {
  occurredAt: string;
  accountId?: string;
  contactNames: string[];
  discussed: string;
}

export interface NextMeetingDto {
  scheduledFor: string;
  withWhom: string;
  purpose: string;
}

export interface ExpansionUpdateDto {
  id: string;
  asOf: string;
  headline: string;
  lastContact?: LastContactDto;
  nextMeeting?: NextMeetingDto;
  awaitingInternal: string[];
  nextActions: string[];
  sourceDocumentIds: string[];
  origin: string;
  /** Field names the user has edited by hand — the card marks these so it's clear a document ingest won't overwrite them. */
  manuallyEditedFields: string[];
}

/**
 * A partial edit from the card. A key present with `null` clears that field;
 * a key absent leaves it alone — which is why lastContact/nextMeeting are
 * `T | null | undefined` rather than optional alone.
 */
export interface UpdateExpansionUpdateCommand {
  headline?: string;
  lastContact?: LastContactDto | null;
  nextMeeting?: NextMeetingDto | null;
  awaitingInternal?: string[];
  nextActions?: string[];
}
