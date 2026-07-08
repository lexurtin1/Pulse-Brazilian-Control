import {
  BuildContextBundle,
  CreateAccount,
  CreateNote,
  CreateSignal,
  GenerateInsight,
  GetAccountDetail,
  ListAccounts,
  ListAccountsWithCoordinates,
  ListSignalsForAccount,
  ResolveAccountCoordinate,
  RunMarketResearchSweep,
  type ScheduledJobHandle,
  type IScheduler,
  SubmitDocument,
  TransitionDocumentState,
  UpdateAccountTemperature,
} from "@pulse-brazil/application";
import type { Pool } from "pg";
import { ClaudeServiceAdapter } from "../adapters/ClaudeServiceAdapter.js";
import { GeocoderAdapter } from "../adapters/GeocoderAdapter.js";
import { NodeCronScheduler } from "../adapters/NodeCronScheduler.js";
import { PerplexityMarketResearchAdapter } from "../adapters/PerplexityMarketResearchAdapter.js";
import { PostgresAccountRepository } from "../adapters/PostgresAccountRepository.js";
import { PostgresContextBundleRepository } from "../adapters/PostgresContextBundleRepository.js";
import { PostgresDocumentRepository } from "../adapters/PostgresDocumentRepository.js";
import { PostgresInsightRepository } from "../adapters/PostgresInsightRepository.js";
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
  /** Exposed under this name per the requested composition-root shape; the class itself is SubmitDocument — see README. */
  readonly ingestDocument: SubmitDocument;
  readonly transitionDocumentState: TransitionDocumentState;
  readonly createNote: CreateNote;
  readonly generateInsight: GenerateInsight;
  readonly buildContextBundle: BuildContextBundle;
  readonly runMarketResearchSweep: RunMarketResearchSweep;
  readonly scheduler: IScheduler;

  constructor(config: CompositionRootConfig) {
    this.pool = createPool(config.databaseUrl);

    const accounts = new PostgresAccountRepository(this.pool);
    const signals = new PostgresSignalRepository(this.pool);
    const documents = new PostgresDocumentRepository(this.pool);
    const notes = new PostgresNoteRepository(this.pool);
    const insights = new PostgresInsightRepository(this.pool);
    const contextBundles = new PostgresContextBundleRepository(this.pool);
    const temperatureAssessments = new PostgresTemperatureAssessmentRepository(this.pool);

    const idGenerator = new UlidIdGenerator();
    const geocoder = new GeocoderAdapter(config.googleMapsApiKey);
    const claudeService = new ClaudeServiceAdapter(config.anthropicApiKey);
    const marketResearch = new PerplexityMarketResearchAdapter(config.perplexityApiKey);
    const scheduler = new NodeCronScheduler();
    this.scheduler = scheduler;

    this.buildContextBundle = new BuildContextBundle(notes, documents, signals, contextBundles, idGenerator);

    this.createAccount = new CreateAccount(accounts, idGenerator);
    this.listAccounts = new ListAccounts(accounts);
    this.getAccountDetail = new GetAccountDetail(accounts, signals, temperatureAssessments, insights);
    this.updateAccountTemperature = new UpdateAccountTemperature(accounts, temperatureAssessments, idGenerator);
    this.resolveAccountCoordinate = new ResolveAccountCoordinate(accounts, geocoder);
    this.listAccountsWithCoordinates = new ListAccountsWithCoordinates(accounts);
    this.createSignal = new CreateSignal(signals, accounts, idGenerator);
    this.listSignalsForAccount = new ListSignalsForAccount(signals);
    this.ingestDocument = new SubmitDocument(documents, idGenerator);
    this.transitionDocumentState = new TransitionDocumentState(documents);
    this.createNote = new CreateNote(notes, accounts, idGenerator);
    this.generateInsight = new GenerateInsight(insights, claudeService, idGenerator, this.buildContextBundle);
    this.runMarketResearchSweep = new RunMarketResearchSweep(accounts, signals, marketResearch, idGenerator);
  }

  /**
   * Registers the daily market research sweep on a cron schedule.
   * Runs at 07:00 São Paulo time every weekday morning.
   * Returns the handle so the caller can cancel on shutdown if needed.
   */
  scheduleMarketResearchSweep(): ScheduledJobHandle {
    return this.scheduler.schedule("0 7 * * 1-5", "America/Sao_Paulo", async () => {
      const result = await this.runMarketResearchSweep.execute({});
      console.info(
        `[MarketResearchSweep] Completed — accounts: ${result.accountsProcessed}, signals: ${result.signalsCreated}, errors: ${result.errors.length}`,
      );
      if (result.errors.length > 0) {
        console.warn("[MarketResearchSweep] Per-account errors:", result.errors);
      }
    });
  }

  /** Closes the underlying pg Pool — call on graceful shutdown. */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
