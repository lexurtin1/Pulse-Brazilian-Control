import type { ExpansionUpdate, LastContact, NextMeeting } from "@pulse-brazil/domain";
import { asAccountId } from "@pulse-brazil/domain";
import type { ExpansionUpdateDto, LastContactDto, NextMeetingDto } from "../../dto/update/ExpansionUpdateDto.js";
import { ValidationError } from "../../errors/ApplicationError.js";

/** Shared by every read path so one update always serialises the same way. */
export function toExpansionUpdateDto(update: ExpansionUpdate): ExpansionUpdateDto {
  return {
    id: update.id,
    asOf: update.asOf.toISOString(),
    headline: update.headline,
    lastContact: update.lastContact
      ? {
          occurredAt: update.lastContact.occurredAt.toISOString(),
          accountId: update.lastContact.accountId,
          contactNames: [...update.lastContact.contactNames],
          discussed: update.lastContact.discussed,
        }
      : undefined,
    nextMeeting: update.nextMeeting
      ? {
          scheduledFor: update.nextMeeting.scheduledFor.toISOString(),
          withWhom: update.nextMeeting.withWhom,
          purpose: update.nextMeeting.purpose,
        }
      : undefined,
    awaitingInternal: [...update.awaitingInternal],
    nextActions: [...update.nextActions],
    sourceDocumentIds: [...update.sourceDocumentIds],
    origin: update.origin,
    manuallyEditedFields: [...update.manuallyEditedFields],
  };
}

/** Rejects an unparseable date rather than persisting an Invalid Date that only surfaces as "NaN" in the UI much later. */
function parseDate(value: string, field: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`${field} must be a valid ISO date`);
  }
  return parsed;
}

export function toLastContact(dto: LastContactDto): LastContact {
  return {
    occurredAt: parseDate(dto.occurredAt, "lastContact.occurredAt"),
    accountId: dto.accountId ? asAccountId(dto.accountId) : undefined,
    contactNames: dto.contactNames.filter((name) => name.trim()).map((name) => name.trim()),
    discussed: dto.discussed,
  };
}

export function toNextMeeting(dto: NextMeetingDto): NextMeeting {
  return {
    scheduledFor: parseDate(dto.scheduledFor, "nextMeeting.scheduledFor"),
    withWhom: dto.withWhom,
    purpose: dto.purpose,
  };
}
