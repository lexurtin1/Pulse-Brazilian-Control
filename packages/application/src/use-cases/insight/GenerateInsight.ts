import {
  asAccountId,
  asDocumentId,
  asInsightId,
  asNoteId,
  asSignalId,
  asThemeId,
  ConfidenceScore,
  Insight,
  InsightOrigin,
  type PromptProfile,
  RecommendedAction,
  RelatedEntityKind,
  RelatedEntityReference,
} from "@pulse-brazil/domain";
import type { InsightDto } from "../../dto/insight/InsightDto.js";
import { UpstreamServiceError, ValidationError } from "../../errors/ApplicationError.js";
import type { ClaudeRelatedEntityResult, IClaudeService } from "../../ports/IClaudeService.js";
import type { IIdGenerator } from "../../ports/IIdGenerator.js";
import type { IInsightRepository } from "../../ports/IInsightRepository.js";
import { toEvidenceReference } from "../account/UpdateAccountTemperature.js";
import { BuildContextBundle } from "../context/BuildContextBundle.js";

/** Shared by GetAccountDetail too — one mapping from Insight to its DTO shape. */
export function toInsightDto(insight: Insight): InsightDto {
  return {
    id: insight.id,
    summary: insight.summary,
    recommendedActions: insight.recommendedAction
      ? [
          {
            description: insight.recommendedAction.description,
            dueDate: insight.recommendedAction.dueDate?.toISOString(),
          },
        ]
      : [],
    confidenceScore: insight.confidence.toNumber(),
    evidenceCount: insight.evidence.length,
    promptProfileName: insight.origin.promptProfile?.name,
    promptProfileVersion: insight.origin.promptProfile?.version,
    contextBundleId: insight.origin.contextBundleId,
    origin: insight.origin.kind,
    createdAt: insight.generatedAt.toISOString(),
  };
}

/** Shared by PostgresInsightRepository too — converts a plain {kind, id} pair into a branded RelatedEntityReference. */
export function toRelatedEntityReference(input: ClaudeRelatedEntityResult): RelatedEntityReference {
  if (!Object.values(RelatedEntityKind).includes(input.kind as RelatedEntityKind)) {
    throw new UpstreamServiceError("Claude", `unrecognized related entity kind: ${input.kind}`);
  }
  const kind = input.kind as RelatedEntityKind;
  switch (kind) {
    case RelatedEntityKind.Account:
      return RelatedEntityReference.of(kind, asAccountId(input.id));
    case RelatedEntityKind.Theme:
      return RelatedEntityReference.of(kind, asThemeId(input.id));
    case RelatedEntityKind.Signal:
      return RelatedEntityReference.of(kind, asSignalId(input.id));
    case RelatedEntityKind.SourceDocument:
      return RelatedEntityReference.of(kind, asDocumentId(input.id));
    case RelatedEntityKind.Note:
      return RelatedEntityReference.of(kind, asNoteId(input.id));
  }
}

export interface GenerateInsightCommand {
  accountId: string;
  signalIds?: string[];
  /**
   * Which versioned prompt asset to use for this call — supplied by the
   * caller, not hardcoded here. No prompt assets exist under claude/ yet;
   * this use case stays decoupled from any specific prompt id until that
   * registry exists.
   */
  promptProfile: PromptProfile;
}

/**
 * The core AI-orchestration use case: assembles bounded context, calls
 * Claude through IClaudeService, validates the structured result, and
 * constructs an Insight via Insight.of(...) — which itself enforces that
 * every insight has at least one related entity and one piece of evidence.
 * Nothing here trusts Claude's output directly; everything is converted
 * into domain types (or rejected) before Insight.of is ever called.
 */
export class GenerateInsight {
  constructor(
    private readonly insights: IInsightRepository,
    private readonly claudeService: IClaudeService,
    private readonly idGenerator: IIdGenerator,
    private readonly buildContextBundle: BuildContextBundle,
  ) {}

  async execute(command: GenerateInsightCommand): Promise<InsightDto> {
    if (!command.accountId.trim()) {
      throw new ValidationError("accountId is required");
    }
    const accountId = asAccountId(command.accountId);

    const contextBundle = await this.buildContextBundle.execute({
      accountId: command.accountId,
      signalIds: command.signalIds,
    });

    const claudeResult = await this.claudeService
      .generateInsight({ contextBundle, promptProfile: command.promptProfile })
      .catch((error: unknown) => {
        throw new UpstreamServiceError("Claude", error instanceof Error ? error.message : String(error));
      });

    if (!claudeResult.summary.trim() || !claudeResult.whyItMatters.trim()) {
      throw new UpstreamServiceError("Claude", "response is missing summary or whyItMatters");
    }

    const relatedEntities = claudeResult.relatedEntities.map(toRelatedEntityReference);
    const hasAccountReference = relatedEntities.some(
      (entity) => entity.kind === RelatedEntityKind.Account && entity.id === accountId,
    );
    if (!hasAccountReference) {
      relatedEntities.push(RelatedEntityReference.of(RelatedEntityKind.Account, accountId));
    }

    const insight = Insight.of({
      id: asInsightId(this.idGenerator.newId()),
      summary: claudeResult.summary,
      whyItMatters: claudeResult.whyItMatters,
      relatedEntities,
      evidence: claudeResult.evidence.map(toEvidenceReference),
      confidence: ConfidenceScore.of(claudeResult.confidence),
      origin: InsightOrigin.claudeGenerated({
        promptProfile: command.promptProfile,
        contextBundleId: contextBundle.id,
      }),
      generatedAt: new Date(),
      recommendedAction: claudeResult.recommendedAction
        ? RecommendedAction.of({
            description: claudeResult.recommendedAction.description,
            dueDate: claudeResult.recommendedAction.dueDate ? new Date(claudeResult.recommendedAction.dueDate) : undefined,
          })
        : undefined,
    });

    await this.insights.save(insight);
    return toInsightDto(insight);
  }
}
