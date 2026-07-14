import {
  asAccountId,
  asDocumentId,
  asNoteId,
  asSignalId,
  asTemperatureAssessmentId,
  ConfidenceScore,
  EvidenceKind,
  EvidenceReference,
  TemperatureAssessment,
  TemperatureBand,
} from "@pulse-brazil/domain";
import type { TemperatureAssessmentDto } from "../../dto/temperature/TemperatureAssessmentDto.js";
import { NotFoundError, ValidationError } from "../../errors/ApplicationError.js";
import type { IAccountRepository } from "../../ports/IAccountRepository.js";
import type { IIdGenerator } from "../../ports/IIdGenerator.js";
import type { ITemperatureAssessmentRepository } from "../../ports/ITemperatureAssessmentRepository.js";

export interface EvidenceInput {
  kind: string;
  referenceId?: string;
  excerpt?: string;
  locator?: string;
}

/**
 * Converts plain evidence input (as it arrives from a command, or from
 * Claude via GenerateInsight) into a domain EvidenceReference. `ExternalReference`
 * is intentionally not handled here — the domain's EvidenceReferenceId only
 * covers Note, SourceDocument, and Signal ids; there is no branded id type
 * for an ExternalReference to point at. Use ManualAssertion for anything else.
 */
export function toEvidenceReference(input: EvidenceInput): EvidenceReference {
  switch (input.kind) {
    case EvidenceKind.Note:
      if (!input.referenceId) throw new ValidationError("evidence.referenceId is required for Note evidence");
      return EvidenceReference.of({
        kind: EvidenceKind.Note,
        referenceId: asNoteId(input.referenceId),
        excerpt: input.excerpt,
        locator: input.locator,
      });
    case EvidenceKind.SourceDocument:
      if (!input.referenceId) throw new ValidationError("evidence.referenceId is required for SourceDocument evidence");
      return EvidenceReference.of({
        kind: EvidenceKind.SourceDocument,
        referenceId: asDocumentId(input.referenceId),
        excerpt: input.excerpt,
        locator: input.locator,
      });
    case EvidenceKind.Signal:
      if (!input.referenceId) throw new ValidationError("evidence.referenceId is required for Signal evidence");
      return EvidenceReference.of({
        kind: EvidenceKind.Signal,
        referenceId: asSignalId(input.referenceId),
        excerpt: input.excerpt,
        locator: input.locator,
      });
    case EvidenceKind.ManualAssertion:
      return EvidenceReference.of({ kind: EvidenceKind.ManualAssertion, excerpt: input.excerpt, locator: input.locator });
    default:
      throw new ValidationError(`Unsupported evidence kind: ${input.kind}`);
  }
}

export interface UpdateAccountTemperatureCommand {
  accountId: string;
  band: string;
  rationale: string;
  assessedBy: string;
  /** ISO date string. Defaults to now when omitted. */
  assessedAt?: string;
  confidenceScore: number;
  nextAction?: string;
  evidence?: EvidenceInput[];
}

function assertTemperatureBand(value: string): TemperatureBand {
  if (!Object.values(TemperatureBand).includes(value as TemperatureBand)) {
    throw new ValidationError(`band must be one of: ${Object.values(TemperatureBand).join(", ")}`);
  }
  return value as TemperatureBand;
}

/**
 * Records a new immutable temperature read for an account. The latest
 * assessment is derived from history; Account carries no mirrored snapshot.
 */
export class UpdateAccountTemperature {
  constructor(
    private readonly accounts: IAccountRepository,
    private readonly temperature: ITemperatureAssessmentRepository,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async execute(command: UpdateAccountTemperatureCommand): Promise<TemperatureAssessmentDto> {
    if (!command.accountId.trim()) {
      throw new ValidationError("accountId is required");
    }
    const accountId = asAccountId(command.accountId);

    const account = await this.accounts.findById(accountId);
    if (!account) {
      throw new NotFoundError("Account", command.accountId);
    }

    const assessment = TemperatureAssessment.of({
      id: asTemperatureAssessmentId(this.idGenerator.newId()),
      accountId,
      band: assertTemperatureBand(command.band),
      rationale: command.rationale,
      evidence: (command.evidence ?? []).map(toEvidenceReference),
      assessedAt: command.assessedAt ? new Date(command.assessedAt) : new Date(),
      assessedBy: command.assessedBy,
      confidence: ConfidenceScore.of(command.confidenceScore),
      nextAction: command.nextAction,
    });

    await this.temperature.save(assessment);

    return {
      id: assessment.id,
      accountId: assessment.accountId,
      band: assessment.band,
      rationale: assessment.rationale,
      assessedAt: assessment.assessedAt.toISOString(),
      assessedBy: assessment.assessedBy,
      confidenceScore: assessment.confidence.toNumber(),
      nextAction: assessment.nextAction,
      evidenceCount: assessment.evidence.length,
    };
  }
}
