import type { ActiveAccountsSummaryDto } from "../../dto/account/ActiveAccountsSummaryDto.js";
import type { IAccountCountSnapshotRepository } from "../../ports/IAccountCountSnapshotRepository.js";

/**
 * Reads the two most recent AccountCountSnapshots and reports the latest
 * count plus a delta against the previous one. Delta is omitted entirely
 * (never fabricated as "vs. 0") when there is no previous snapshot — same
 * rule as GetPipelineSummary (see claude/INTEGRATION_PLAN.md Feature 2).
 */
export class GetActiveAccountsSummary {
  constructor(private readonly snapshots: IAccountCountSnapshotRepository) {}

  async execute(): Promise<ActiveAccountsSummaryDto | null> {
    const [latest, previous] = await this.snapshots.findRecent(2);
    if (!latest) return null;

    return {
      count: latest.count,
      asOf: latest.asOf.toISOString(),
      delta: previous
        ? { count: latest.count - previous.count, previousAsOf: previous.asOf.toISOString() }
        : undefined,
    };
  }
}
