import {
  BuildContextBundle,
  CreateAccount,
  CreateAccountFromLocationRecord,
  CreateNote,
  CreateSignal,
  GenerateInsight,
  GetAccountDetail,
  GetActiveAccountsSummary,
  GetPipelineSummary,
  GetTopOpenDeals,
  ImportLocationCsv,
  ImportPipelineCsv,
  ListAccounts,
  ListAccountsWithCoordinates,
  ListLocationRecordsForMap,
  ListRecentSignals,
  ListSignalsForAccount,
  ProcessDocumentUpload,
  ReconcileSalesforceAccounts,
  ResolveAccountCoordinate,
  RunMarketResearchSweep,
  SubmitDocument,
  UpdateAccountTemperature,
} from "@pulse-brazil/application";
import type { Pool } from "pg";
import { ClaudeServiceAdapter } from "../adapters/ClaudeServiceAdapter.js";
import { GeocoderAdapter } from "../adapters/GeocoderAdapter.js";
import { PerplexityMarketResearchAdapter } from "../adapters/PerplexityMarketResearchAdapter.js";
import { PostgresAccountCountSnapshotRepository } from "../adapters/PostgresAccountCountSnapshotRepository.js";
import { PostgresAccountRepository } from "../adapters/PostgresAccountRepository.js";
import { PostgresContextBundleRepository } from "../adapters/PostgresContextBundleRepository.js";
import { PostgresDealRepository } from "../adapters/PostgresDealRepository.js";
import { PostgresDocumentRepository } from "../adapters/PostgresDocumentRepository.js";
import { PostgresInsightRepository } from "../adapters/PostgresInsightRepository.js";
import { PostgresLocationRecordRepository } from "../adapters/PostgresLocationRecordRepository.js";
import { PostgresNoteRepository } from "../adapters/PostgresNoteRepository.js";
import { PostgresSignalRepository } from "../adapters/PostgresSignalRepository.js";
import { PostgresTemperatureAssessmentRepository } from "../adapters/PostgresTemperatureAssessmentRepository.js";
import { UlidIdGenerator } from "../adapters/UlidIdGenerator.js";
import { createPool } from "../db/pool.js";

export interface CompositionRootConfig {
  databaseUrl: string;
  anthropicApiKey: string;
  googleMapsApiKey: string;
  perplexityApiKey: string;
}

/**
 * The single place Pulse Brazil's application is assembled. Accepts its
 * configuration explicitly rather than reading process.env itself, so
 * wiring stays testable and the source of every credential is visible at
 * the call site. A future API/server layer imports this and calls
 * `.execute()` on whichever use case it needs, without knowing anything
 * about Postgres, the Anthropic SDK, or the geocoder.
 */
export class CompositionRoot {
  private readonly pool: Pool;

  readonly createAccount: CreateAccount;
  readonly listAccounts: ListAccounts;
  readonly getAccountDetail: GetAccountDetail;
  readonly updateAccountTemperature: UpdateAccountTemperature;
  readonly resolveAccountCoordinate: ResolveAccountCoordinate;
  readonly listAccountsWithCoordinates: ListAccountsWithCoordinates;
  readonly createSignal: CreateSignal;
  readonly listSignalsForAccount: ListSignalsForAccount;
  readonly listRecentSignals: ListRecentSignals;
  /** Exposed under this name per the requested composition-root shape; the class itself is SubmitDocument — see README. */
  readonly ingestDocument: SubmitDocument;
  readonly processDocumentUpload: ProcessDocumentUpload;
  readonly createNote: CreateNote;
  readonly generateInsight: GenerateInsight;
  readonly buildContextBundle: BuildContextBundle;
  readonly runMarketResearchSweep: RunMarketResearchSweep;
  readonly importLocationCsv: ImportLocationCsv;
  readonly listLocationRecordsForMap: ListLocationRecordsForMap;
  readonly createAccountFromLocationRecord: CreateAccountFromLocationRecord;
  readonly importPipelineCsv: ImportPipelineCsv;
  readonly getPipelineSummary: GetPipelineSummary;
  readonly getTopOpenDeals: GetTopOpenDeals;
  readonly getActiveAccountsSummary: GetActiveAccountsSummary;
  readonly reconcileSalesforceAccounts: ReconcileSalesforceAccounts;

  constructor(config: CompositionRootConfig) {
    this.pool = createPool(config.databaseUrl);

    const accounts = new PostgresAccountRepository(this.pool);
    const signals = new PostgresSignalRepository(this.pool);
    const documents = new PostgresDocumentRepository(this.pool);
    const notes = new PostgresNoteRepository(this.pool);
    const insights = new PostgresInsightRepository(this.pool);
    const contextBundles = new PostgresContextBundleRepository(this.pool);
    const temperatureAssessments = new PostgresTemperatureAssessmentRepository(this.pool);
    const locationRecords = new PostgresLocationRecordRepository(this.pool);
    const deals = new PostgresDealRepository(this.pool);
    const accountCountSnapshots = new PostgresAccountCountSnapshotRepository(this.pool);

    const idGenerator = new UlidIdGenerator();
    const geocoder = new GeocoderAdapter(config.googleMapsApiKey);
    const claudeService = new ClaudeServiceAdapter(config.anthropicApiKey);
    const marketResearch = new PerplexityMarketResearchAdapter(config.perplexityApiKey);

    this.buildContextBundle = new BuildContextBundle(notes, documents, signals, contextBundles, idGenerator);

    this.createAccount = new CreateAccount(accounts, idGenerator);
    this.listAccounts = new ListAccounts(accounts);
    this.getAccountDetail = new GetAccountDetail(accounts, signals, temperatureAssessments, insights);
    this.updateAccountTemperature = new UpdateAccountTemperature(accounts, temperatureAssessments, idGenerator);
    this.resolveAccountCoordinate = new ResolveAccountCoordinate(accounts, geocoder);
    this.listAccountsWithCoordinates = new ListAccountsWithCoordinates(accounts);
    this.createSignal = new CreateSignal(signals, accounts, idGenerator);
    this.listSignalsForAccount = new ListSignalsForAccount(signals);
    this.listRecentSignals = new ListRecentSignals(signals);
    this.ingestDocument = new SubmitDocument(documents, idGenerator);
    this.createNote = new CreateNote(notes, accounts, idGenerator);
    this.processDocumentUpload = new ProcessDocumentUpload(documents, accounts, claudeService, this.createSignal, idGenerator);
    this.generateInsight = new GenerateInsight(insights, claudeService, idGenerator, this.buildContextBundle);
    this.runMarketResearchSweep = new RunMarketResearchSweep(accounts, signals, marketResearch, idGenerator);
    this.importLocationCsv = new ImportLocationCsv(locationRecords, documents, accounts, geocoder, idGenerator, accountCountSnapshots);
    this.listLocationRecordsForMap = new ListLocationRecordsForMap(locationRecords, accounts);
    this.createAccountFromLocationRecord = new CreateAccountFromLocationRecord(locationRecords, accounts, idGenerator);
    this.importPipelineCsv = new ImportPipelineCsv(deals, documents, accounts, idGenerator);
    this.getPipelineSummary = new GetPipelineSummary(deals, documents);
    this.getTopOpenDeals = new GetTopOpenDeals(deals, documents);
    this.getActiveAccountsSummary = new GetActiveAccountsSummary(accountCountSnapshots);
    this.reconcileSalesforceAccounts = new ReconcileSalesforceAccounts(accounts, idGenerator);
  }

  /** Closes the underlying pg Pool — call on graceful shutdown. */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
