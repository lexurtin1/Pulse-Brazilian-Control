import type { ExpansionUpdate } from "@pulse-brazil/domain";

/**
 * There is only ever one current update, so this port has no findById —
 * `findCurrent` is the only read anything needs, and `save` upserts it.
 */
export interface IExpansionUpdateRepository {
  findCurrent(): Promise<ExpansionUpdate | null>;
  save(update: ExpansionUpdate): Promise<void>;
}
