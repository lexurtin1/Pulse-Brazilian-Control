import { describe, expect, it } from "vitest";
import { asDocumentId, asExpansionUpdateId, ExpansionUpdate, ExpansionUpdateField, ExpansionUpdateOrigin } from "@pulse-brazil/domain";
import type { ClaudeExpansionUpdateDraft } from "../../ports/IClaudeService.js";
import type { IExpansionUpdateRepository } from "../../ports/IExpansionUpdateRepository.js";
import { ApplyExtractedUpdate } from "./ApplyExtractedUpdate.js";

const EXISTING_DOC = asDocumentId("doc-1");
const NEW_DOC = asDocumentId("doc-2");
const KNOWN_ACCOUNTS = new Set(["account-itau"]);

function repository(current: ExpansionUpdate | null) {
  const saved: ExpansionUpdate[] = [];
  const repo: IExpansionUpdateRepository = {
    findCurrent: async () => current,
    save: async (update) => {
      saved.push(update);
    },
  };
  return { repo, saved };
}

const idGenerator = { newId: () => "generated-id" };

function existingUpdate(overrides: Partial<Parameters<typeof ExpansionUpdate.of>[0]> = {}): ExpansionUpdate {
  return ExpansionUpdate.of({
    id: asExpansionUpdateId("update-1"),
    asOf: new Date("2026-08-01T00:00:00Z"),
    headline: "Scoping under way",
    awaitingInternal: ["Legal sign-off on the Brazil addendum"],
    nextActions: ["Send revised pricing"],
    sourceDocumentIds: [EXISTING_DOC],
    origin: ExpansionUpdateOrigin.MachineDerived,
    manuallyEditedFields: [],
    ...overrides,
  });
}

function draft(overrides: Partial<ClaudeExpansionUpdateDraft> = {}): ClaudeExpansionUpdateDraft {
  return {
    headline: "Pilot agreed",
    lastContact: null,
    nextMeeting: null,
    awaitingInternal: [],
    nextActions: [],
    ...overrides,
  };
}

async function applyReturning(current: ExpansionUpdate | null, extracted: ClaudeExpansionUpdateDraft) {
  const { repo, saved } = repository(current);
  const result = await new ApplyExtractedUpdate(repo, idGenerator).execute({
    draft: extracted,
    sourceDocumentId: NEW_DOC,
    knownAccountIds: KNOWN_ACCOUNTS,
  });
  return { saved: saved[0]!, result };
}

async function apply(current: ExpansionUpdate | null, extracted: ClaudeExpansionUpdateDraft) {
  return (await applyReturning(current, extracted)).saved;
}

describe("ApplyExtractedUpdate", () => {
  it("creates the first update when none exists yet", async () => {
    const saved = await apply(null, draft({ nextActions: ["Book kickoff"] }));

    expect(saved.headline).toBe("Pilot agreed");
    expect(saved.nextActions).toEqual(["Book kickoff"]);
    expect(saved.sourceDocumentIds).toEqual([NEW_DOC]);
  });

  it("falls back to a placeholder headline rather than persisting an empty card", async () => {
    const saved = await apply(null, draft({ headline: null }));

    expect(saved.headline).toBe("Brazil expansion update");
  });

  it("keeps an existing list when the document mentions none", async () => {
    // A call note about pricing shouldn't wipe an outstanding legal sign-off
    // just by failing to mention it — the card is a running state, not a
    // per-document snapshot.
    const saved = await apply(existingUpdate(), draft({ awaitingInternal: [], nextActions: [] }));

    expect(saved.awaitingInternal).toEqual(["Legal sign-off on the Brazil addendum"]);
    expect(saved.nextActions).toEqual(["Send revised pricing"]);
  });

  it("replaces a list the document does speak to", async () => {
    const saved = await apply(existingUpdate(), draft({ awaitingInternal: ["Pricing approval"] }));

    expect(saved.awaitingInternal).toEqual(["Pricing approval"]);
  });

  it("never overwrites a field the user has pinned", async () => {
    const pinned = existingUpdate({ manuallyEditedFields: [ExpansionUpdateField.Headline] });

    const saved = await apply(pinned, draft({ headline: "Claude's version" }));

    expect(saved.headline).toBe("Scoping under way");
  });

  it("drops an account link Claude invented", async () => {
    const saved = await apply(
      null,
      draft({
        lastContact: {
          occurredAt: "2026-08-20",
          accountId: "account-that-does-not-exist",
          contactNames: ["Ana"],
          discussed: "Timeline",
        },
      }),
    );

    expect(saved.lastContact?.accountId).toBeUndefined();
    expect(saved.lastContact?.discussed).toBe("Timeline");
  });

  it("keeps an account link that matches a known account", async () => {
    const saved = await apply(
      null,
      draft({
        lastContact: { occurredAt: "2026-08-20", accountId: "account-itau", contactNames: ["Ana"], discussed: "Timeline" },
      }),
    );

    expect(saved.lastContact?.accountId).toBe("account-itau");
  });

  it("drops a contact with no usable date rather than dating it now", async () => {
    const saved = await apply(
      null,
      draft({ lastContact: { occurredAt: null, accountId: null, contactNames: ["Ana"], discussed: "Timeline" } }),
    );

    expect(saved.lastContact).toBeUndefined();
  });

  it("drops an unparseable date rather than storing an invalid one", async () => {
    const saved = await apply(
      null,
      draft({ lastContact: { occurredAt: "last Thursday", accountId: null, contactNames: ["Ana"], discussed: "Timeline" } }),
    );

    expect(saved.lastContact).toBeUndefined();
  });

  it("drops a contact whose summary is blank, rather than failing the ingest", async () => {
    const saved = await apply(
      null,
      draft({ lastContact: { occurredAt: "2026-08-20", accountId: null, contactNames: [], discussed: "  " } }),
    );

    expect(saved.lastContact).toBeUndefined();
  });

  it("drops a meeting with no date or no counterparty", async () => {
    const noDate = await apply(null, draft({ nextMeeting: { scheduledFor: null, withWhom: "Itaú", purpose: "Pilot" } }));
    const noParty = await apply(null, draft({ nextMeeting: { scheduledFor: "2026-09-02", withWhom: "", purpose: "Pilot" } }));

    expect(noDate.nextMeeting).toBeUndefined();
    expect(noParty.nextMeeting).toBeUndefined();
  });

  it("accumulates the source documents it has read", async () => {
    const saved = await apply(existingUpdate(), draft());

    expect(saved.sourceDocumentIds).toEqual([EXISTING_DOC, NEW_DOC]);
  });

  // The card sat unchanged for a week while every upload reported success,
  // because a pinned field is skipped silently. It is no longer silent.
  it("reports the fields a pin refused", async () => {
    const { result } = await applyReturning(
      existingUpdate({ manuallyEditedFields: [ExpansionUpdateField.Headline] }),
      draft({ headline: "Pilot agreed", nextActions: ["Book kickoff"] }),
    );

    expect(result.blockedFields).toEqual([ExpansionUpdateField.Headline]);
  });

  it("reports nothing blocked when every proposal lands", async () => {
    const { result } = await applyReturning(existingUpdate(), draft({ nextActions: ["Book kickoff"] }));

    expect(result.blockedFields).toEqual([]);
  });

  it("reports nothing blocked on the very first update", async () => {
    const { result } = await applyReturning(null, draft());

    expect(result.blockedFields).toEqual([]);
  });
});
