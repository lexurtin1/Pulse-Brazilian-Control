import { ConnectorSource } from "@pulse-brazil/domain";
import type { SignalDto } from "../../dto/signal/SignalDto.js";
import type { ISignalRepository } from "../../ports/ISignalRepository.js";
import { toSignalDto } from "./ListSignalsForAccount.js";

const DEFAULT_LIMIT = 50;

/**
 * The live feed is the *external* news log — what happened in the Brazilian
 * market that nobody here told us. Signals extracted from documents we
 * uploaded ourselves are not news: we already knew them, they arrive in
 * bursts of five per file, and they drowned out the market signal they were
 * sitting next to. They are still kept, still linked to their account, and
 * still shown on the account dossier via ListSignalsForAccount — this
 * filter changes what the feed shows, not what is recorded.
 */
const EXTERNAL_NEWS_SOURCES: readonly ConnectorSource[] = [
  ConnectorSource.WebResearch,
  ConnectorSource.NewsFeed,
  ConnectorSource.RegulatoryFeed,
];

/** Chronological, cross-account feed — the signal feed's data source, distinct from ListSignalsForAccount's single-account scope. */
export class ListRecentSignals {
  constructor(private readonly signals: ISignalRepository) {}

  async execute(limit: number = DEFAULT_LIMIT): Promise<SignalDto[]> {
    const signals = await this.signals.findRecent(limit, EXTERNAL_NEWS_SOURCES);
    return signals.map(toSignalDto);
  }
}
