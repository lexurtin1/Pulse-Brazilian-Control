import { toEvidenceReference } from "@pulse-brazil/application";
import {
  Account,
  AccountStatus,
  AccountType,
  asAccountId,
  asOfficeLocationId,
  asSignalId,
  asTemperatureAssessmentId,
  ConfidenceScore,
  ConnectorSource,
  Coordinate,
  EvidenceKind,
  GeographicScope,
  OfficeLocation,
  Signal,
  SignalOrigin,
  SignalType,
  TemperatureAssessment,
  TemperatureBand,
} from "@pulse-brazil/domain";
import { PostgresAccountRepository } from "../adapters/PostgresAccountRepository.js";
import { PostgresSignalRepository } from "../adapters/PostgresSignalRepository.js";
import { PostgresTemperatureAssessmentRepository } from "../adapters/PostgresTemperatureAssessmentRepository.js";
import { createPool } from "./pool.js";

/**
 * Demo data ported 1:1 from packages/ui/src/mocks/{accounts,signals,temperature}.ts
 * (same ids, same story) so the live app matches the Phase 1 static demo.
 */
interface AccountSeed {
  id: string;
  name: string;
  type: AccountType;
  status: AccountStatus;
  band: TemperatureBand;
  city: string;
  latitude: number;
  longitude: number;
  verified: boolean;
  assessedAt: string;
  assessedBy: string;
  confidence: number;
  rationale: string;
  nextAction?: string;
  evidenceCount: number;
}

const ACCOUNT_SEEDS: AccountSeed[] = [
  {
    id: "acct-vertice-sp",
    name: "Vértice Asset Management",
    type: AccountType.AssetManager,
    status: AccountStatus.Active,
    band: TemperatureBand.Hot,
    city: "São Paulo",
    latitude: -23.5505,
    longitude: -46.6333,
    verified: true,
    assessedAt: "2026-07-06T14:00:00.000Z",
    assessedBy: "analyst.ferreira",
    confidence: 0.87,
    rationale: "New cross-border ETF desk and tokenised share-class filing indicate accelerating engagement.",
    nextAction: "Schedule follow-up on tokenised share-class timeline.",
    evidenceCount: 3,
  },
  {
    id: "acct-atlantico-rj",
    name: "Banco Atlântico",
    type: AccountType.Bank,
    status: AccountStatus.Active,
    band: TemperatureBand.Warm,
    city: "Rio de Janeiro",
    latitude: -22.9068,
    longitude: -43.1729,
    verified: true,
    assessedAt: "2026-07-04T11:30:00.000Z",
    assessedBy: "analyst.costa",
    confidence: 0.71,
    rationale: "Steady ETF inflow participation offset by rate-sensitivity flagged in Q2 investor letter.",
    nextAction: "Monitor Q3 investor communications for rate-sensitivity follow-through.",
    evidenceCount: 2,
  },
  {
    id: "acct-autoridade-bsb",
    name: "Autoridade de Mercados Brasília",
    type: AccountType.RegulatoryBody,
    status: AccountStatus.Active,
    band: TemperatureBand.Cool,
    city: "Brasília",
    latitude: -15.7939,
    longitude: -47.8828,
    verified: true,
    assessedAt: "2026-06-29T09:15:00.000Z",
    assessedBy: "analyst.lima",
    confidence: 0.6,
    rationale: "Regulatory-body relationship remains procedural; no commercial signal beyond disclosure proposal.",
    evidenceCount: 1,
  },
  {
    id: "acct-norte-mao",
    name: "Corretora Norte",
    type: AccountType.Broker,
    status: AccountStatus.Prospect,
    band: TemperatureBand.Cold,
    city: "Manaus",
    latitude: -3.119,
    longitude: -60.0217,
    verified: false,
    assessedAt: "2026-06-18T16:45:00.000Z",
    assessedBy: "analyst.souza",
    confidence: 0.45,
    rationale: "Prospect stage with limited activity; capital-requirement change may affect near-term budget.",
    nextAction: "Re-engage once capital-requirement transition period clarifies.",
    evidenceCount: 2,
  },
  {
    id: "acct-bahia-ssa",
    name: "Bahia Energia Corporativa S.A.",
    type: AccountType.Corporate,
    status: AccountStatus.Active,
    band: TemperatureBand.Warm,
    city: "Salvador",
    latitude: -12.9777,
    longitude: -38.5016,
    verified: true,
    assessedAt: "2026-07-01T13:20:00.000Z",
    assessedBy: "analyst.ferreira",
    confidence: 0.68,
    rationale: "Cross-border financing MOU signals expansion, tempered by pending leadership transition.",
    nextAction: "Confirm CFO transition timeline before next outreach.",
    evidenceCount: 2,
  },
  {
    id: "acct-bolsa-rec",
    name: "Bolsa do Nordeste",
    type: AccountType.ExchangeOrVenue,
    status: AccountStatus.Dormant,
    band: TemperatureBand.Cool,
    city: "Recife",
    latitude: -8.0476,
    longitude: -34.877,
    verified: false,
    assessedAt: "2026-06-10T10:00:00.000Z",
    assessedBy: "analyst.lima",
    confidence: 0.4,
    rationale: "Dormant status; early-stage consolidation talks are not yet actionable.",
    evidenceCount: 1,
  },
  {
    id: "acct-custodia-poa",
    name: "Custódia Sul Serviços Financeiros",
    type: AccountType.Custodian,
    status: AccountStatus.Active,
    band: TemperatureBand.Hot,
    city: "Porto Alegre",
    latitude: -30.0346,
    longitude: -51.2177,
    verified: true,
    assessedAt: "2026-07-07T08:50:00.000Z",
    assessedBy: "analyst.costa",
    confidence: 0.9,
    rationale: "Active custody-expansion conversation plus direct exposure to new tokenised custody guidance.",
    nextAction: "Brief account on tokenised custody guidance comment period.",
    evidenceCount: 4,
  },
];

interface SignalSeed {
  id: string;
  source: ConnectorSource;
  type: SignalType;
  title: string;
  summary: string;
  linkedAccountIds: string[];
  region?: string;
  city?: string;
  dateObserved: string;
  confidence: number;
  origin: SignalOrigin;
  evidenceCount: number;
}

const SIGNAL_SEEDS: SignalSeed[] = [
  {
    id: "sig-013",
    source: ConnectorSource.RegulatoryFeed,
    type: SignalType.RegulatoryChange,
    title: "CVM opens comment period on tokenised fund custody rules",
    summary: "CVM published draft guidance extending custody requirements to tokenised fund shares.",
    linkedAccountIds: ["acct-custodia-poa"],
    region: "Rio Grande do Sul",
    city: "Porto Alegre",
    dateObserved: "2026-07-07T09:10:00.000Z",
    confidence: 0.82,
    origin: SignalOrigin.MachineDerived,
    evidenceCount: 3,
  },
  {
    id: "sig-012",
    source: ConnectorSource.NewsFeed,
    type: SignalType.CompetitiveIntelligence,
    title: "Vértice Asset Management launches new cross-border ETF desk",
    summary: "Vértice announced a dedicated desk for cross-border ETF flows into B3-listed products.",
    linkedAccountIds: ["acct-vertice-sp"],
    region: "São Paulo",
    city: "São Paulo",
    dateObserved: "2026-07-06T14:05:00.000Z",
    confidence: 0.91,
    origin: SignalOrigin.MachineDerived,
    evidenceCount: 4,
  },
  {
    id: "sig-011",
    source: ConnectorSource.ManualEntry,
    type: SignalType.AccountSpecific,
    title: "Relationship manager call notes: Custódia Sul expansion plans",
    summary: "Custódia Sul indicated intent to expand custody coverage to include private credit vehicles.",
    linkedAccountIds: ["acct-custodia-poa"],
    dateObserved: "2026-07-05T17:30:00.000Z",
    confidence: 0.7,
    origin: SignalOrigin.HumanDerived,
    evidenceCount: 1,
  },
  {
    id: "sig-010",
    source: ConnectorSource.NewsFeed,
    type: SignalType.MarketStructure,
    title: "B3 shortens settlement cycle for order routing pilot",
    summary: "B3 confirmed a T+1 settlement pilot for select order routing participants beginning Q3.",
    linkedAccountIds: ["acct-atlantico-rj", "acct-bolsa-rec"],
    region: "Rio de Janeiro",
    dateObserved: "2026-07-04T11:40:00.000Z",
    confidence: 0.88,
    origin: SignalOrigin.MachineDerived,
    evidenceCount: 5,
  },
  {
    id: "sig-009",
    source: ConnectorSource.RegulatoryFeed,
    type: SignalType.RegulatoryChange,
    title: "Autoridade de Mercados Brasília proposes ETF disclosure update",
    summary: "Draft instruction would require standardized cross-border ETF flow disclosures from local venues.",
    linkedAccountIds: ["acct-autoridade-bsb"],
    region: "Distrito Federal",
    city: "Brasília",
    dateObserved: "2026-07-02T08:20:00.000Z",
    confidence: 0.85,
    origin: SignalOrigin.MachineDerived,
    evidenceCount: 2,
  },
  {
    id: "sig-008",
    source: ConnectorSource.WebResearch,
    type: SignalType.CrossBorder,
    title: "Bahia Energia Corporativa signs cross-border financing MOU",
    summary: "Bahia Energia disclosed a memorandum of understanding with a European infrastructure fund.",
    linkedAccountIds: ["acct-bahia-ssa"],
    region: "Bahia",
    city: "Salvador",
    dateObserved: "2026-07-01T13:25:00.000Z",
    confidence: 0.76,
    origin: SignalOrigin.MachineDerived,
    evidenceCount: 2,
  },
  {
    id: "sig-007",
    source: ConnectorSource.DocumentUpload,
    type: SignalType.AccountSpecific,
    title: "Banco Atlântico Q2 investor letter flags rate-sensitivity",
    summary: "Uploaded investor letter cites rate-sensitivity as a watch item for the coming quarter.",
    linkedAccountIds: ["acct-atlantico-rj"],
    dateObserved: "2026-06-30T10:00:00.000Z",
    confidence: 0.68,
    origin: SignalOrigin.HumanDerived,
    evidenceCount: 1,
  },
  {
    id: "sig-006",
    source: ConnectorSource.RegulatoryFeed,
    type: SignalType.RegulatoryChange,
    title: "CVM Instrução amendment on broker capital requirements",
    summary: "Amendment raises minimum regulatory capital thresholds for Broker-classified entities.",
    linkedAccountIds: ["acct-norte-mao"],
    region: "Amazonas",
    city: "Manaus",
    dateObserved: "2026-06-27T09:50:00.000Z",
    confidence: 0.8,
    origin: SignalOrigin.MachineDerived,
    evidenceCount: 3,
  },
  {
    id: "sig-005",
    source: ConnectorSource.NewsFeed,
    type: SignalType.MarketStructure,
    title: "Bolsa do Nordeste evaluates venue consolidation talks",
    summary: "Reports indicate early-stage discussions around regional venue consolidation.",
    linkedAccountIds: ["acct-bolsa-rec"],
    region: "Pernambuco",
    city: "Recife",
    dateObserved: "2026-06-24T15:10:00.000Z",
    confidence: 0.55,
    origin: SignalOrigin.MachineDerived,
    evidenceCount: 2,
  },
  {
    id: "sig-004",
    source: ConnectorSource.WebResearch,
    type: SignalType.Tokenisation,
    title: "Vértice files for tokenised fixed-income share class",
    summary: "Regulatory filing indicates Vértice is pursuing a tokenised share class for a fixed-income fund.",
    linkedAccountIds: ["acct-vertice-sp"],
    region: "São Paulo",
    city: "São Paulo",
    dateObserved: "2026-06-21T12:00:00.000Z",
    confidence: 0.73,
    origin: SignalOrigin.MachineDerived,
    evidenceCount: 3,
  },
  {
    id: "sig-003",
    source: ConnectorSource.SalesforceSync,
    type: SignalType.AccountSpecific,
    title: "Corretora Norte opportunity stage moved to qualification",
    summary: "CRM sync shows the Corretora Norte opportunity advanced to qualification stage.",
    linkedAccountIds: ["acct-norte-mao"],
    dateObserved: "2026-06-18T16:50:00.000Z",
    confidence: 0.6,
    origin: SignalOrigin.MachineDerived,
    evidenceCount: 1,
  },
  {
    id: "sig-002",
    source: ConnectorSource.NewsFeed,
    type: SignalType.ETF,
    title: "Cross-border ETF inflows into B3-listed products rise",
    summary: "Aggregate cross-border ETF inflows into B3-listed products rose for a third consecutive month.",
    linkedAccountIds: ["acct-atlantico-rj", "acct-vertice-sp"],
    dateObserved: "2026-06-15T07:30:00.000Z",
    confidence: 0.79,
    origin: SignalOrigin.MachineDerived,
    evidenceCount: 4,
  },
  {
    id: "sig-001",
    source: ConnectorSource.ManualEntry,
    type: SignalType.MarketResearch,
    title: "Field note: Bahia Energia leadership transition",
    summary: "Field research flags an upcoming CFO transition at Bahia Energia Corporativa.",
    linkedAccountIds: ["acct-bahia-ssa"],
    dateObserved: "2026-06-10T10:05:00.000Z",
    confidence: 0.5,
    origin: SignalOrigin.HumanDerived,
    evidenceCount: 1,
  },
];

function manualAssertions(count: number, excerpt: string) {
  return Array.from({ length: count }, () => toEvidenceReference({ kind: EvidenceKind.ManualAssertion, excerpt }));
}

function accountSlug(accountId: string): string {
  return accountId.replace(/^acct-/, "");
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required to run the seed script");
  }

  const pool = createPool(connectionString);
  const accounts = new PostgresAccountRepository(pool);
  const signals = new PostgresSignalRepository(pool);
  const temperatureAssessments = new PostgresTemperatureAssessmentRepository(pool);

  try {
    await pool.query("TRUNCATE accounts, signals, temperature_assessments RESTART IDENTITY CASCADE");

    for (const seed of ACCOUNT_SEEDS) {
      const assessment = TemperatureAssessment.of({
        id: asTemperatureAssessmentId(`temp-${accountSlug(seed.id)}`),
        accountId: asAccountId(seed.id),
        band: seed.band,
        rationale: seed.rationale,
        evidence: manualAssertions(seed.evidenceCount, seed.rationale),
        assessedAt: new Date(seed.assessedAt),
        assessedBy: seed.assessedBy,
        confidence: ConfidenceScore.of(seed.confidence),
        nextAction: seed.nextAction,
      });

      const coordinate = Coordinate.of(seed.latitude, seed.longitude);
      let office = OfficeLocation.fromRawAddress({
        id: asOfficeLocationId(`office-${accountSlug(seed.id)}`),
        rawAddress: `${seed.city}, Brazil`,
        isPrimary: true,
      }).withGeocodedCoordinate(coordinate);
      if (seed.verified) {
        office = office.verify(coordinate);
      }

      const account = Account.create({
        id: asAccountId(seed.id),
        name: seed.name,
        accountType: seed.type,
        status: seed.status,
        geographicScope: GeographicScope.of({ countryCode: "BR", city: seed.city }),
        officeLocations: [office],
      });

      await accounts.save(account);
      await temperatureAssessments.save(assessment);
      console.log(`seeded account ${seed.id}`);
    }

    for (const seed of SIGNAL_SEEDS) {
      const signal = Signal.of({
        id: asSignalId(seed.id),
        source: seed.source,
        type: seed.type,
        title: seed.title,
        summary: seed.summary,
        linkedAccountIds: seed.linkedAccountIds.map(asAccountId),
        geographicScope:
          seed.region || seed.city
            ? GeographicScope.of({ countryCode: "BR", region: seed.region, city: seed.city })
            : undefined,
        dateObserved: new Date(seed.dateObserved),
        evidence: manualAssertions(seed.evidenceCount, seed.summary),
        confidence: ConfidenceScore.of(seed.confidence),
        origin: seed.origin,
      });

      await signals.save(signal);
      console.log(`seeded signal ${seed.id}`);
    }

    console.log(`Seed complete: ${ACCOUNT_SEEDS.length} accounts, ${SIGNAL_SEEDS.length} signals.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
