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
import { GetOpenDeals } from "./GetOpenDeals.js";

const LATEST = asDocumentId("doc-latest");
const UPLOADED_AT = new Date("2026-07-13T09:00:00Z");

function pipelineDocument(): SourceDocument {
  return SourceDocument.receive({
    id: LATEST,
    declaredType: DocumentType.PipelineDataset,
    provenance: Provenance.of({ connectorSource: ConnectorSource.DocumentUpload, uploadedAt: UPLOADED_AT }),
  });
}

function deal(id: string, amount: number, stage: DealStage = DealStage.Qualified): Deal {
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

function useCase(deals: Deal[], documents: SourceDocument[] = [pipelineDocument()]): GetOpenDeals {
  const dealRepository: IDealRepository = {
    findBySourceDocumentId: async () => deals,
    saveMany: async () => {},
  };
  const documentRepository: IDocumentRepository = {
    findById: async () => null,
    findByAccountId: async () => [],
    findByDeclaredType: async () => documents,
    findMostRecentUploadedAt: async () => null,
    save: async () => {},
  };
  return new GetOpenDeals(dealRepository, documentRepository);
}

describe("GetOpenDeals", () => {
  it("returns null when no pipeline has ever been uploaded", async () => {
    expect(await useCase([], []).execute()).toBeNull();
  });

  it("returns every open deal, not a top slice", async () => {
    // The card used to be capped at 3 server-side. It now scrolls, so a cap
    // here would silently hide deals from the only view that lists them.
    const deals = Array.from({ length: 25 }, (_, index) => deal(`deal-${index}`, (index + 1) * 1000));

    const result = await useCase(deals).execute();

    expect(result?.deals).toHaveLength(25);
    expect(result?.dealCount).toBe(25);
  });

  it("ranks by amount descending", async () => {
    const result = await useCase([deal("small", 1_000), deal("large", 900_000), deal("middle", 50_000)]).execute();

    expect(result?.deals.map((d) => d.amount)).toEqual([900_000, 50_000, 1_000]);
  });

  it("excludes closed stages and leaves them out of the totals", async () => {
    const result = await useCase([
      deal("open-one", 100, DealStage.Discovery),
      deal("won", 900_000, DealStage.Live),
      deal("lost", 500_000, DealStage.Lost),
      deal("open-two", 200, DealStage.Signed),
    ]).execute();

    expect(result?.deals.map((d) => d.id)).toEqual(["open-two", "open-one"]);
    expect(result?.dealCount).toBe(2);
    expect(result?.totalValue).toBe(300);
  });

  it("totals the value of every open deal", async () => {
    const result = await useCase([deal("a", 1_000), deal("b", 2_500), deal("c", 400)]).execute();

    expect(result?.totalValue).toBe(3_900);
  });

  it("reports an empty result rather than null when the latest upload has no open deals", async () => {
    const result = await useCase([deal("won", 900_000, DealStage.Live)]).execute();

    expect(result).not.toBeNull();
    expect(result?.deals).toEqual([]);
    expect(result?.totalValue).toBe(0);
    expect(result?.asOf).toBe(UPLOADED_AT.toISOString());
  });
});
