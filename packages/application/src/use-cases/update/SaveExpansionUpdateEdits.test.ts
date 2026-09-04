import { describe, expect, it } from "vitest";
import { asDocumentId, asExpansionUpdateId, ExpansionUpdate, ExpansionUpdateField, ExpansionUpdateOrigin } from "@pulse-brazil/domain";
import type { IExpansionUpdateRepository } from "../../ports/IExpansionUpdateRepository.js";
import type { UpdateExpansionUpdateCommand } from "../../dto/update/ExpansionUpdateDto.js";
import { ValidationError } from "../../errors/ApplicationError.js";
import { SaveExpansionUpdateEdits } from "./SaveExpansionUpdateEdits.js";

const idGenerator = { newId: () => "generated-id" };

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

function existingUpdate(): ExpansionUpdate {
  return ExpansionUpdate.of({
    id: asExpansionUpdateId("update-1"),
    asOf: new Date("2026-08-01T00:00:00Z"),
    headline: "Scoping under way",
    lastContact: {
      occurredAt: new Date("2026-07-30T00:00:00Z"),
      contactNames: ["Rodrigo"],
      discussed: "Contract status",
    },
    awaitingInternal: ["Legal sign-off"],
    nextActions: ["Send revised pricing"],
    sourceDocumentIds: [asDocumentId("doc-1")],
    origin: ExpansionUpdateOrigin.MachineDerived,
    manuallyEditedFields: [],
  });
}

async function save(current: ExpansionUpdate | null, command: UpdateExpansionUpdateCommand) {
  const { repo, saved } = repository(current);
  const dto = await new SaveExpansionUpdateEdits(repo, idGenerator).execute(command);
  return { dto, saved: saved[0]! };
}

describe("SaveExpansionUpdateEdits", () => {
  it("pins only the fields the command names", async () => {
    const { saved } = await save(existingUpdate(), { headline: "Pilot agreed" });

    expect(saved.headline).toBe("Pilot agreed");
    expect(saved.manuallyEditedFields).toEqual([ExpansionUpdateField.Headline]);
    // Untouched fields keep their values rather than being cleared.
    expect(saved.awaitingInternal).toEqual(["Legal sign-off"]);
    expect(saved.lastContact?.discussed).toBe("Contract status");
  });

  it("treats an explicit null as 'there is none', and pins that too", async () => {
    const { saved } = await save(existingUpdate(), { lastContact: null });

    expect(saved.lastContact).toBeUndefined();
    expect(saved.manuallyEditedFields).toEqual([ExpansionUpdateField.LastContact]);
  });

  it("edits last contact, which the card had no way to reach before", async () => {
    const { saved } = await save(existingUpdate(), {
      lastContact: {
        occurredAt: "2026-08-19T00:00:00.000Z",
        contactNames: ["Rodrigo", " Simon "],
        discussed: "XP contract delayed by legal availability",
      },
    });

    expect(saved.lastContact?.occurredAt.toISOString()).toBe("2026-08-19T00:00:00.000Z");
    expect(saved.lastContact?.contactNames).toEqual(["Rodrigo", "Simon"]);
  });

  // Writing the card by hand before anything has been ingested used to 404,
  // which is what "editing doesn't save to the database" looked like.
  it("creates the first update when none exists yet", async () => {
    const { saved } = await save(null, { headline: "Brazil travel cancelled", nextActions: ["Build the BNY deck"] });

    expect(saved.id).toBe("generated-id");
    expect(saved.headline).toBe("Brazil travel cancelled");
    expect(saved.origin).toBe(ExpansionUpdateOrigin.HumanDerived);
    expect(saved.sourceDocumentIds).toEqual([]);
    expect(saved.manuallyEditedFields).toEqual([ExpansionUpdateField.Headline, ExpansionUpdateField.NextActions]);
  });

  it("refuses to create the first update without a headline", async () => {
    await expect(save(null, { nextActions: ["Build the BNY deck"] })).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses an empty command", async () => {
    await expect(save(existingUpdate(), {})).rejects.toBeInstanceOf(ValidationError);
  });

  // Without this, one hand edit froze that field against every future upload
  // — which is exactly how the whole card ended up static.
  it("releases a pin so document ingest can refresh the field again", async () => {
    const pinned = existingUpdate().applyManualEdit(
      { headline: "Set by hand" },
      [ExpansionUpdateField.Headline],
      new Date("2026-08-02T00:00:00Z"),
    );

    const { saved } = await save(pinned, { unpinFields: ["headline"] });

    expect(saved.manuallyEditedFields).toEqual([]);
    // Releasing frees the field; it does not revert what was written.
    expect(saved.headline).toBe("Set by hand");
  });

  it("keeps an edit's own pin when the same request releases a different field", async () => {
    const pinned = existingUpdate().applyManualEdit(
      { nextActions: ["Set by hand"] },
      [ExpansionUpdateField.NextActions],
      new Date("2026-08-02T00:00:00Z"),
    );

    const { saved } = await save(pinned, { headline: "Pilot agreed", unpinFields: ["nextActions"] });

    expect(saved.manuallyEditedFields).toEqual([ExpansionUpdateField.Headline]);
  });

  it("rejects a field name that is not editable", async () => {
    await expect(save(existingUpdate(), { unpinFields: ["origin"] })).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses to release anything before the first update exists", async () => {
    await expect(save(null, { unpinFields: ["headline"] })).rejects.toBeInstanceOf(ValidationError);
  });
});
