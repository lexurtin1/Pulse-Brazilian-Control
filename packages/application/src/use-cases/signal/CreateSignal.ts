import {
  type AccountId,
  asAccountId,
  asSignalId,
  asThemeId,
  ConfidenceScore,
  ConnectorSource,
  GeographicScope,
  Signal,
  SignalOrigin,
  SignalType,
} from "@pulse-brazil/domain";
import type { SignalDto } from "../../dto/signal/SignalDto.js";
import { NotFoundError, ValidationError } from "../../errors/ApplicationError.js";
import type { IIdGenerator } from "../../ports/IIdGenerator.js";
import type { IUnitOfWork } from "../../ports/IUnitOfWork.js";
import { type EvidenceInput, toEvidenceReference } from "../account/UpdateAccountTemperature.js";
import { toSignalDto } from "./ListSignalsForAccount.js";

function assertEnumMember<T extends Record<string, string>>(enumObject: T, value: string, fieldName: string): T[keyof T] {
  if (!Object.values(enumObject).includes(value)) {
    throw new ValidationError(`${fieldName} must be one of: ${Object.values(enumObject).join(", ")}`);
  }
  return value as T[keyof T];
}

export interface CreateSignalCommand {
  source: string;
  type: string;
  title: string;
  summary: string;
  linkedAccountIds?: string[];
  linkedThemeIds?: string[];
  geographicScope?: { countryCode: string; region?: string; city?: string };
  /** ISO date string. Defaults to now when omitted. */
  dateObserved?: string;
  confidenceScore: number;
  origin: string;
  evidence?: EvidenceInput[];
}

/**
 * Captures a new piece of market or account intelligence. Verifies every
 * referenced account exists before the signal and its canonical relational
 * links are persisted atomically.
 */
export class CreateSignal {
  constructor(
    private readonly unitOfWork: IUnitOfWork,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async execute(command: CreateSignalCommand): Promise<SignalDto> {
    if (!command.title.trim()) {
      throw new ValidationError("title is required");
    }

    const source = assertEnumMember(ConnectorSource, command.source, "source");
    const type = assertEnumMember(SignalType, command.type, "type");
    const origin = assertEnumMember(SignalOrigin, command.origin, "origin");

    const linkedAccountIds: AccountId[] = (command.linkedAccountIds ?? []).map(asAccountId);
    const signal = Signal.of({
      id: asSignalId(this.idGenerator.newId()),
      source,
      type,
      title: command.title,
      summary: command.summary,
      linkedAccountIds,
      linkedThemeIds: (command.linkedThemeIds ?? []).map(asThemeId),
      geographicScope: command.geographicScope ? GeographicScope.of(command.geographicScope) : undefined,
      dateObserved: command.dateObserved ? new Date(command.dateObserved) : new Date(),
      evidence: (command.evidence ?? []).map(toEvidenceReference),
      confidence: ConfidenceScore.of(command.confidenceScore),
      origin,
    });

    await this.unitOfWork.execute(async ({ accounts, signals }) => {
      // Protect referenced accounts in stable order so concurrent
      // multi-account signals cannot deadlock in opposite account order.
      const accountIdsToLock = [...linkedAccountIds].sort();
      for (const accountId of accountIdsToLock) {
        const account = await accounts.findByIdForLink(accountId);
        if (!account) {
          throw new NotFoundError("Account", accountId);
        }
      }

      await signals.save(signal);
    });

    return toSignalDto(signal);
  }
}
