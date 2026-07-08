import type { SignalDto } from "../../dto/signal/SignalDto.js";
import type { ISignalRepository } from "../../ports/ISignalRepository.js";
import { toSignalDto } from "./ListSignalsForAccount.js";

const DEFAULT_LIMIT = 50;

/** Chronological, cross-account feed — the signal feed's data source, distinct from ListSignalsForAccount's single-account scope. */
export class ListRecentSignals {
  constructor(private readonly signals: ISignalRepository) {}

  async execute(limit: number = DEFAULT_LIMIT): Promise<SignalDto[]> {
    const signals = await this.signals.findRecent(limit);
    return signals.map(toSignalDto);
  }
}
