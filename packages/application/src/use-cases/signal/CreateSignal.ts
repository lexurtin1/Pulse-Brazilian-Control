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
import type { IAccountRepository } from "../../ports/IAccountRepository.js";
import type { IIdGenerator } from "../../ports/IIdGenerator.js";
import type { ISignalRepository } from "../../ports/ISignalRepository.js";
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
 * referenced account actually exists before the signal is persisted, and
 * updates each account's linkedSignalIds — Account.linkSignal exists
 * specifically because Signal is the authoritative link direction and
 * Account's copy is a denormalized read convenience this use case must
 * keep in sync.
 */
export class CreateSignal {
  constructor(
    private readonly signals: ISignalRepository,
    private readonly accounts: IAccountRepository,
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
    const linkedAccounts = await Promise.all(
      linkedAccountIds.map(async (accountId) => {
        const account = await this.accounts.findById(accountId);
        if (!account) {
          throw new NotFoundError("Account", accountId);
        }
        return account;
      }),
    );

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

    await this.signals.save(signal);
    await Promise.all(linkedAccounts.map((account) => this.accounts.save(account.linkSignal(signal.id))));

    return toSignalDto(signal);
  }
}
