import { describe, expect, it } from "vitest";
import {
  asDealId,
  asDocumentId,
  ConnectorSource,
  Deal,
  DealStage,
  DocumentType,
  Provenance,
  SourceDocument,
} from "@pulse-brazil/domain";
import type { IDealRepository } from "../../ports/IDealRepository.js";
import type { IDocumentRepository } from "../../ports/IDocumentRepository.js";
import { GetPipelineSummary } from "./GetPipelineSummary.js";

const LATEST = asDocumentId("doc-latest");

function pipelineDocument(): SourceDocument {
  return SourceDocument.receive({
    id: LATEST,
    declaredType: DocumentType.PipelineDataset,
    provenance: Provenance.of({
      connectorSource: ConnectorSource.DocumentUpload,
      uploadedAt: new Date("2026-07-13T09:00:00Z"),
    }),
  });
}

function deal(id: string, amount: number, stage: DealStage): Deal {
  return Deal.receive({
    id: asDealId(id),
    sourceDocumentId: LATEST,
    sourceRowNumber: 1,
    accountNameRaw: `Account ${id}`,
    opportunityName: `Opportunity ${id}`,
    stage,
    fiscalPeriod: "Q3-2026",
    amount,
    expectedRevenue: amount / 2,
    probabilityPercent: 50,
  });
}

function useCase(deals: Deal[]): GetPipelineSummary {
  const dealRepository: IDealRepository = {
    findBySourceDocumentId: async () => deals,
    saveMany: async () => {},
  };
  const documentRepository: IDocumentRepository = {
    findById: async () => null,
    findByAccountId: async () => [],
    findByDeclaredType: async () => [pipelineDocument()],
    findMostRecentUploadedAt: async () => null,
    save: async () => {},
  };
  return new GetPipelineSummary(dealRepository, documentRepository);
}

describe("GetPipelineSummary stage breakdown", () => {
  it("reports every open stage in funnel order, not the order deals arrived in", async () => {
    const summary = await useCase([
      deal("a", 100, DealStage.Signed),
      deal("b", 200, DealStage.Prospect),
      deal("c", 300, DealStage.Qualified),
      deal("d", 400, DealStage.Discovery),
    ]).execute();

    expect(summary!.stages.map((slice) => slice.stage)).toEqual(["Prospect", "Discovery", "Qualified", "Signed"]);
  });

  it("sums value and deal count per stage", async () => {
    const summary = await useCase([
      deal("a", 100, DealStage.Qualified),
      deal("b", 250, DealStage.Qualified),
      deal("c", 400, DealStage.Discovery),
    ]).execute();

    expect(summary!.stages).toEqual([
      { stage: "Prospect", value: 0, dealCount: 0 },
      { stage: "Discovery", value: 400, dealCount: 1 },
      { stage: "Qualified", value: 350, dealCount: 2 },
      { stage: "Signed", value: 0, dealCount: 0 },
    ]);
  });

  // The card draws the bar as the full width of unweightedValue, so anything
  // that made these disagree would render a bar that doesn't fill its track.
  it("sums to the unweighted headline figure", async () => {
    const summary = await useCase([
      deal("a", 100, DealStage.Prospect),
      deal("b", 250, DealStage.Qualified),
      deal("c", 400, DealStage.Discovery),
      deal("closed-won", 9_000, DealStage.Live),
      deal("closed-lost", 5_000, DealStage.Lost),
    ]).execute();

    const total = summary!.stages.reduce((sum, slice) => sum + slice.value, 0);
    expect(total).toBe(summary!.unweightedValue);
    expect(total).toBe(750);
  });

  // An emptied stage has to stay on the card — a legend whose row count moved
  // with the data would resize the tile on every upload.
  it("keeps a stage that holds nothing", async () => {
    const summary = await useCase([deal("a", 100, DealStage.Prospect)]).execute();

    expect(summary!.stages).toHaveLength(4);
    expect(summary!.stages.filter((slice) => slice.value === 0)).toHaveLength(3);
  });
});
