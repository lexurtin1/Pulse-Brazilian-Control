import { DocumentType } from "@pulse-brazil/domain";
import type { DashboardFreshnessDto, SourceFreshnessDto, SourceFreshnessStatus, OverallFreshnessStatus } from "../../dto/dashboard/DashboardFreshnessDto.js";
import type { IDocumentRepository } from "../../ports/IDocumentRepository.js";
import type { IMarketResearchLogRepository } from "../../ports/IMarketResearchLogRepository.js";

const UPLOAD_FRESH_HOURS = 48;
const UPLOAD_STALE_DAYS = 7;

/** Shared by both upload-driven sources — a pipeline export and a call note age at the same rate, because what ages is our picture of Brazil, not the file format. */
function uploadStatus(asOf: Date | null, now: Date): SourceFreshnessStatus {
  if (!asOf) return "never";
  const hoursSince = (now.getTime() - asOf.getTime()) / (1000 * 60 * 60);
  if (hoursSince <= UPLOAD_FRESH_HOURS) return "fresh";
  if (hoursSince <= UPLOAD_STALE_DAYS * 24) return "aging";
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

/** "never" ranks with "stale": for the ring's purposes a source that has never run and one that stopped running are equally useless. */
const STATUS_SEVERITY: Record<SourceFreshnessStatus, number> = { fresh: 0, aging: 1, stale: 2, never: 2 };

/**
 * Best-of, not worst-of. The ring answers "is anything here current?", and
 * under worst-of it answered "is everything current?" — which meant one
 * source nobody had touched in six weeks pinned it red no matter how much
 * fresh material arrived, so it stopped carrying information. A stale
 * source is still visible: every source keeps its own dot in the tooltip,
 * and that is where a lapsed pipeline export is meant to be read.
 */
function bestOf(...statuses: readonly SourceFreshnessStatus[]): OverallFreshnessStatus {
  const best = Math.min(...statuses.map((status) => STATUS_SEVERITY[status]));
  if (best === 0) return "fresh";
  if (best === 1) return "aging";
  return "stale";
}

/**
 * Aggregate freshness for the header ring: the best-of three independently
 * tracked sources.
 *
 * Pipeline freshness comes from the latest uploaded PipelineDataset
 * document (same source GetPipelineSummary reads). Sweep freshness comes
 * from market_research_log, not from Signals — a quiet news week produces
 * no Signal at all (see RunMarketResearchSweep), so Signals can't
 * distinguish "sweep is broken" from "nothing happened."
 *
 * The third source is every other upload. Documents that go through
 * ProcessDocumentUpload keep declaredType Other and let Claude infer the
 * real type, so a call note or a set of meeting minutes matched neither of
 * the first two sources and could not move the ring at all — you could
 * upload a fortnight of contact notes and watch it stay red. That is what
 * findMostRecentUploadedAt fixes: it asks when anything was last uploaded,
 * without caring what it was.
 */
export class GetDashboardFreshness {
  constructor(
    private readonly documents: IDocumentRepository,
    private readonly marketResearchLog: IMarketResearchLogRepository,
  ) {}

  async execute(): Promise<DashboardFreshnessDto> {
    const now = new Date();
    const [pipelineDocs, sweepAsOf, documentAsOf] = await Promise.all([
      this.documents.findByDeclaredType(DocumentType.PipelineDataset),
      this.marketResearchLog.findMostRecentMarketWide(),
      this.documents.findMostRecentUploadedAt(),
    ]);
    const pipelineAsOf = pipelineDocs[0]?.provenance.uploadedAt ?? null;

    const pipeline: SourceFreshnessDto = {
      label: "Salesforce pipeline",
      status: uploadStatus(pipelineAsOf, now),
      asOf: pipelineAsOf?.toISOString(),
    };
    const marketSweep: SourceFreshnessDto = {
      label: "Market research sweep",
      status: sweepStatus(sweepAsOf, now),
      asOf: sweepAsOf?.toISOString(),
    };
    const documents: SourceFreshnessDto = {
      label: "Documents & updates",
      status: uploadStatus(documentAsOf, now),
      asOf: documentAsOf?.toISOString(),
    };

    return {
      overallStatus: bestOf(pipeline.status, marketSweep.status, documents.status),
      pipeline,
      marketSweep,
      documents,
    };
  }
}
