import { describe, expect, it } from "vitest";
import type { ExpansionUpdateDto } from "@pulse-brazil/application";
import { changedFieldsOnly, type SubmittedUpdate } from "./latestUpdatePatch";

function current(overrides: Partial<ExpansionUpdateDto> = {}): ExpansionUpdateDto {
  return {
    id: "update-1",
    asOf: "2026-08-27T09:24:32.000Z",
    headline: "Scoping under way",
    lastContact: {
      occurredAt: "2026-08-19T00:00:00.000Z",
      contactNames: ["Rodrigo"],
      discussed: "XP contract status",
    },
    nextMeeting: { scheduledFor: "2026-09-03T00:00:00.000Z", withWhom: "BNY", purpose: "Re-introduce order routing" },
    awaitingInternal: ["Legal sign-off"],
    nextActions: ["Send revised pricing"],
    sourceDocumentIds: ["doc-1"],
    origin: "MachineDerived",
    manuallyEditedFields: [],
    ...overrides,
  };
}

/** What the form posts when the person opened it and typed nothing. */
function unchanged(from: ExpansionUpdateDto): SubmittedUpdate {
  return {
    headline: from.headline,
    lastContact: from.lastContact ?? null,
    nextMeeting: from.nextMeeting ?? null,
    awaitingInternal: [...from.awaitingInternal],
    nextActions: [...from.nextActions],
  };
}

describe("changedFieldsOnly", () => {
  // The bug: the form posts all five fields, the API pins every field the
  // body names, so one headline fix pinned the whole card and every later
  // document upload was refused in silence.
  it("names nothing when the person changed nothing", () => {
    const update = current();

    expect(changedFieldsOnly(unchanged(update), update)).toEqual({});
  });

  it("names only the field that moved", () => {
    const update = current();

    const patch = changedFieldsOnly({ ...unchanged(update), headline: "Pilot agreed" }, update);

    expect(patch).toEqual({ headline: "Pilot agreed" });
  });

  it("ignores the time of day the form drops from a date", () => {
    const update = current();
    const submitted = unchanged(update);

    // The date input round-trips 2026-09-03T00:00:00.000Z as "2026-09-03",
    // which new Date().toISOString() turns back into UTC midnight.
    submitted.nextMeeting = { ...submitted.nextMeeting!, scheduledFor: "2026-09-03T00:00:00.000Z" };

    expect(changedFieldsOnly(submitted, update)).toEqual({});
  });

  it("names a cleared composite, so 'there is none' is still recorded and pinned", () => {
    const update = current();

    expect(changedFieldsOnly({ ...unchanged(update), nextMeeting: null }, update)).toEqual({ nextMeeting: null });
  });

  it("names a composite that is being set for the first time", () => {
    const update = current({ nextMeeting: undefined });
    const meeting = { scheduledFor: "2026-09-10T00:00:00.000Z", withWhom: "S3", purpose: "SWIFT capability" };

    expect(changedFieldsOnly({ ...unchanged(update), nextMeeting: meeting }, update)).toEqual({ nextMeeting: meeting });
  });

  it("notices a reordered or extended list", () => {
    const update = current();

    const patch = changedFieldsOnly(
      { ...unchanged(update), nextActions: ["Send revised pricing", "Book kickoff"] },
      update,
    );

    expect(patch).toEqual({ nextActions: ["Send revised pricing", "Book kickoff"] });
  });

  it("notices an edited contact summary", () => {
    const update = current();
    const submitted = unchanged(update);
    submitted.lastContact = { ...submitted.lastContact!, discussed: "XP still has not signed" };

    expect(changedFieldsOnly(submitted, update)).toEqual({ lastContact: submitted.lastContact });
  });

  it("sends everything when there is no card yet — a person typed all of it", () => {
    const submitted = unchanged(current());

    expect(changedFieldsOnly(submitted, null)).toEqual(submitted);
  });
});
