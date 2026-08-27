import { describe, expect, it } from "vitest";
import { asDocumentId, asExpansionUpdateId } from "../shared/identifiers.js";
import { ExpansionUpdate, ExpansionUpdateOrigin } from "./ExpansionUpdate.js";
import { ExpansionUpdateField } from "./ExpansionUpdateField.js";

const DOC = asDocumentId("doc-1");
const LATER_DOC = asDocumentId("doc-2");
const AS_OF = new Date("2026-08-01T00:00:00Z");
const LATER = new Date("2026-08-20T00:00:00Z");

function anUpdate(overrides: Partial<Parameters<typeof ExpansionUpdate.of>[0]> = {}) {
  return ExpansionUpdate.of({
    id: asExpansionUpdateId("update-1"),
    asOf: AS_OF,
    headline: "Itaú integration scoping under way",
    nextMeeting: { scheduledFor: new Date("2026-09-02T13:00:00Z"), withWhom: "Itaú ops", purpose: "Scope the pilot" },
    awaitingInternal: ["Legal sign-off on the Brazil addendum"],
    nextActions: ["Send revised pricing"],
    sourceDocumentIds: [DOC],
    origin: ExpansionUpdateOrigin.MachineDerived,
    manuallyEditedFields: [],
    ...overrides,
  });
}

describe("ExpansionUpdate invariants", () => {
  it("rejects an empty headline", () => {
    expect(() => anUpdate({ headline: "   " })).toThrow(/headline must not be empty/);
  });

  it("rejects a machine-derived update that cites no source document", () => {
    expect(() => anUpdate({ sourceDocumentIds: [] })).toThrow(/must cite at least one source document/);
  });

  it("allows a manual update with no source document", () => {
    const update = anUpdate({ sourceDocumentIds: [], origin: ExpansionUpdateOrigin.HumanDerived });
    expect(update.sourceDocumentIds).toEqual([]);
  });

  it("drops blank list entries", () => {
    const update = anUpdate({ nextActions: ["Send revised pricing", "   ", ""] });
    expect(update.nextActions).toEqual(["Send revised pricing"]);
  });
});

describe("ExpansionUpdate.applyDraft", () => {
  it("takes every field the draft proposes when nothing is pinned", () => {
    const revised = anUpdate().applyDraft({ headline: "Pilot agreed", nextActions: ["Book kickoff"] }, LATER_DOC, LATER);

    expect(revised.headline).toBe("Pilot agreed");
    expect(revised.nextActions).toEqual(["Book kickoff"]);
    expect(revised.asOf).toEqual(LATER);
  });

  it("leaves a pinned field untouched however confident the draft is", () => {
    const pinned = anUpdate({ manuallyEditedFields: [ExpansionUpdateField.Headline] });

    const revised = pinned.applyDraft({ headline: "Something Claude inferred", nextActions: ["Book kickoff"] }, LATER_DOC, LATER);

    expect(revised.headline).toBe("Itaú integration scoping under way");
    expect(revised.nextActions).toEqual(["Book kickoff"]);
  });

  it("leaves fields the draft omits untouched", () => {
    const revised = anUpdate().applyDraft({ headline: "Pilot agreed" }, LATER_DOC, LATER);

    expect(revised.nextActions).toEqual(["Send revised pricing"]);
    expect(revised.nextMeeting?.withWhom).toBe("Itaú ops");
  });

  it("accumulates source documents rather than replacing them", () => {
    const revised = anUpdate().applyDraft({ headline: "Pilot agreed" }, LATER_DOC, LATER);

    expect(revised.sourceDocumentIds).toEqual([DOC, LATER_DOC]);
  });

  it("does not re-cite a document it already cites", () => {
    const revised = anUpdate().applyDraft({ headline: "Pilot agreed" }, DOC, LATER);

    expect(revised.sourceDocumentIds).toEqual([DOC]);
  });
});

describe("ExpansionUpdate.applyManualEdit", () => {
  it("pins every field the edit names", () => {
    const edited = anUpdate().applyManualEdit({ headline: "Corrected by hand" }, [ExpansionUpdateField.Headline], LATER);

    expect(edited.headline).toBe("Corrected by hand");
    expect(edited.isPinned(ExpansionUpdateField.Headline)).toBe(true);
    expect(edited.isPinned(ExpansionUpdateField.NextActions)).toBe(false);
  });

  it("treats clearing nextMeeting as a deliberate value a later draft must respect", () => {
    const cleared = anUpdate().applyManualEdit({ nextMeeting: undefined }, [ExpansionUpdateField.NextMeeting], LATER);
    expect(cleared.nextMeeting).toBeUndefined();

    const afterIngest = cleared.applyDraft(
      { nextMeeting: { scheduledFor: LATER, withWhom: "Itaú ops", purpose: "Re-proposed by Claude" } },
      LATER_DOC,
      LATER,
    );
    expect(afterIngest.nextMeeting).toBeUndefined();
  });

  it("keeps the current value when an edited field carries nothing to set", () => {
    const edited = anUpdate().applyManualEdit({}, [ExpansionUpdateField.Headline], LATER);

    expect(edited.headline).toBe("Itaú integration scoping under way");
  });

  it("does not duplicate a field pinned twice", () => {
    const once = anUpdate().applyManualEdit({ headline: "First" }, [ExpansionUpdateField.Headline], LATER);
    const twice = once.applyManualEdit({ headline: "Second" }, [ExpansionUpdateField.Headline], LATER);

    expect(twice.manuallyEditedFields).toEqual([ExpansionUpdateField.Headline]);
  });
});
