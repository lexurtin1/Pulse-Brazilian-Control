import { DocumentType } from "@pulse-brazil/domain";
import type { DashboardFreshnessDto, SourceFreshnessDto, SourceFreshnessStatus, OverallFreshnessStatus } from "../../dto/dashboard/DashboardFreshnessDto.js";
import type { IDocumentRepository } from "../../ports/IDocumentRepository.js";
import type { IMarketResearchLogRepository } from "../../ports/IMarketResearchLogRepository.js";

const PIPELINE_FRESH_HOURS = 48;
const PIPELINE_STALE_DAYS = 7;

function pipelineStatus(asOf: Date | null, now: Date): SourceFreshnessStatus {
  if (!asOf) return "never";
  const hoursSince = (now.getTime() - asOf.getTime()) / (1000 * 60 * 60);
  if (hoursSince <= PIPELINE_FRESH_HOURS) return "fresh";
  if (hoursSince <= PIPELINE_STALE_DAYS * 24) return "aging";
  return "stale";
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Weekdays (Mon-Fri) strictly between asOf's calendar date and now's, exclusive of both — the sweep only runs weekdays (vercel.json cron "0 10 * * 1-5"), so weekend gaps are never "missed" runs. */
function missedWeekdaysSince(asOf: Date, now: Date): number {
  let missed = 0;
  const cursor = startOfUtcDay(asOf);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  const today = startOfUtcDay(now);
  while (cursor.getTime() < today.getTime()) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) missed += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return missed;
}

function sweepStatus(asOf: Date | null, now: Date): SourceFreshnessStatus {
  if (!asOf) return "never";
  const missed = missedWeekdaysSince(asOf, now);
  if (missed === 0) return "fresh";
  if (missed === 1) return "aging";
  return "stale";
}

/** "never" is at least as urgent as "stale" for the combined ring — a source that's never produced data shouldn't be masked by the other source being fresh. */
const STATUS_SEVERITY: Record<SourceFreshnessStatus, number> = { fresh: 0, aging: 1, stale: 2, never: 2 };

function worstOf(a: SourceFreshnessStatus, b: SourceFreshnessStatus): OverallFreshnessStatus {
  const worst = Math.max(STATUS_SEVERITY[a], STATUS_SEVERITY[b]);
  if (worst === 0) return "fresh";
  if (worst === 1) return "aging";
  return "stale";
}

/**
 * Aggregate freshness for the header ring: the worst-of two independently
 * tracked sources. Pipeline freshness comes from the latest uploaded
 * PipelineDataset document (same source GetPipelineSummary reads). Sweep
 * freshness comes from market_research_log, not from Signals — a quiet
 * news week produces no Signal at all (see RunMarketResearchSweep), so
 * Signals can't distinguish "sweep is broken" from "nothing happened."
 */
export class GetDashboardFreshness {
  constructor(
    private readonly documents: IDocumentRepository,
    private readonly marketResearchLog: IMarketResearchLogRepository,
  ) {}

  async execute(): Promise<DashboardFreshnessDto> {
    const now = new Date();
    const [pipelineDocs, sweepAsOf] = await Promise.all([
      this.documents.findByDeclaredType(DocumentType.PipelineDataset),
      this.marketResearchLog.findMostRecentMarketWide(),
    ]);
    const pipelineAsOf = pipelineDocs[0]?.provenance.uploadedAt ?? null;

    const pipeline: SourceFreshnessDto = {
      label: "Salesforce pipeline",
      status: pipelineStatus(pipelineAsOf, now),
      asOf: pipelineAsOf?.toISOString(),
    };
    const marketSweep: SourceFreshnessDto = {
      label: "Market research sweep",
      status: sweepStatus(sweepAsOf, now),
      asOf: sweepAsOf?.toISOString(),
    };

    return {
      overallStatus: worstOf(pipeline.status, marketSweep.status),
      pipeline,
      marketSweep,
    };
  }
}
