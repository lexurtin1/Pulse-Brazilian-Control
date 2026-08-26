import type { AccountId, DocumentId, ExpansionUpdateDraft } from "@pulse-brazil/domain";
import { asExpansionUpdateId, ExpansionUpdate, ExpansionUpdateOrigin } from "@pulse-brazil/domain";
import type { ClaudeExpansionUpdateDraft } from "../../ports/IClaudeService.js";
import type { IExpansionUpdateRepository } from "../../ports/IExpansionUpdateRepository.js";
import type { IIdGenerator } from "../../ports/IIdGenerator.js";

export interface ApplyExtractedUpdateCommand {
  draft: ClaudeExpansionUpdateDraft;
  sourceDocumentId: DocumentId;
  /** Account ids that actually exist — a draft naming anything else has its account link dropped rather than dangling. */
  knownAccountIds: ReadonlySet<string>;
}

/** Claude returns dates as ISO strings or null; anything unparseable is dropped rather than stored as an Invalid Date. */
function parseDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * Folds a Claude-extracted draft into the current Brazil update, creating
 * the first one if none exists yet.
 *
 * Two things are deliberately not trusted from the model: an accountId that
 * isn't in `knownAccountIds` is dropped (the same defence ProcessDocumentUpload
 * applies to signals), and a pinned field is never written — that check lives
 * in ExpansionUpdate.applyDraft so it can't be bypassed from here.
 */
export class ApplyExtractedUpdate {
  constructor(
    private readonly updates: IExpansionUpdateRepository,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async execute(command: ApplyExtractedUpdateCommand): Promise<void> {
    const draft = this.toDomainDraft(command.draft, command.knownAccountIds);
    const now = new Date();

    const current = await this.updates.findCurrent();
    if (current) {
      await this.updates.save(current.applyDraft(draft, command.sourceDocumentId, now));
      return;
    }

    // Nothing to merge into yet. A first update still needs a headline, and
    // the model is not obliged to have proposed one — fall back to the
    // document itself rather than persisting an empty card.
    await this.updates.save(
      ExpansionUpdate.of({
        id: asExpansionUpdateId(this.idGenerator.newId()),
        asOf: now,
        headline: draft.headline ?? "Brazil expansion update",
        lastContact: draft.lastContact,
        nextMeeting: draft.nextMeeting,
        awaitingInternal: draft.awaitingInternal ?? [],
        nextActions: draft.nextActions ?? [],
        sourceDocumentIds: [command.sourceDocumentId],
        origin: ExpansionUpdateOrigin.MachineDerived,
        manuallyEditedFields: [],
      }),
    );
  }

  private toDomainDraft(draft: ClaudeExpansionUpdateDraft, knownAccountIds: ReadonlySet<string>): ExpansionUpdateDraft {
    const occurredAt = parseDate(draft.lastContact?.occurredAt);
    const scheduledFor = parseDate(draft.nextMeeting?.scheduledFor);

    return {
      headline: draft.headline?.trim() || undefined,
      // A contact with no usable date can't be placed on the timeline, so it
      // is dropped rather than dated "now" — a wrong date reads as fact. A
      // blank `discussed` would trip the entity’s own invariant and fail the
      // whole ingest, so an unusable one is dropped here rather than there.
      lastContact:
        draft.lastContact && occurredAt && draft.lastContact.discussed.trim()
          ? {
              occurredAt,
              accountId:
                draft.lastContact.accountId && knownAccountIds.has(draft.lastContact.accountId)
                  ? (draft.lastContact.accountId as AccountId)
                  : undefined,
              contactNames: draft.lastContact.contactNames.filter((name) => name.trim()),
              discussed: draft.lastContact.discussed,
            }
          : undefined,
      nextMeeting:
        draft.nextMeeting && scheduledFor && draft.nextMeeting.withWhom.trim()
          ? { scheduledFor, withWhom: draft.nextMeeting.withWhom, purpose: draft.nextMeeting.purpose }
          : undefined,
      awaitingInternal: draft.awaitingInternal ?? undefined,
      nextActions: draft.nextActions ?? undefined,
    };
  }
}
