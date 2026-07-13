import type { AccountCountSnapshot } from "@pulse-brazil/domain";

export interface IAccountCountSnapshotRepository {
  /** Newest first (by asOf) — used to find "the latest" and "the previous" snapshot. */
  findRecent(limit: number): Promise<AccountCountSnapshot[]>;
  save(snapshot: AccountCountSnapshot): Promise<void>;
}
