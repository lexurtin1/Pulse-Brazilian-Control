import type { ISignalRepository } from "../../ports/ISignalRepository.js";

/**
 * Backs the live feed's "Clear feed" button — a real, permanent, irreversible
 * delete of every signal in the database (not scoped to source), per the
 * operator's explicit request. Also empties every account's "Recent signals"
 * section in the dossier, since both read from the same signals table.
 */
export class DeleteAllSignals {
  constructor(private readonly signals: ISignalRepository) {}

  async execute(): Promise<void> {
    await this.signals.deleteAll();
  }
}
