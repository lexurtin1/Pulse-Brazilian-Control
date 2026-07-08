import { asAccountId, type Signal } from "@pulse-brazil/domain";
import type { SignalDto, SignalGeographicScopeDto } from "../../dto/signal/SignalDto.js";
import { ValidationError } from "../../errors/ApplicationError.js";
import type { ISignalRepository } from "../../ports/ISignalRepository.js";

/** Shared by CreateSignal and GetAccountDetail too — one mapping from Signal to its DTO shape. */
export function toSignalDto(signal: Signal): SignalDto {
  const geographicScope: SignalGeographicScopeDto | undefined = signal.geographicScope
    ? {
        countryCode: signal.geographicScope.countryCode,
        region: signal.geographicScope.region,
        city: signal.geographicScope.city,
      }
    : undefined;

  return {
    id: signal.id,
    source: signal.source,
    type: signal.type,
    title: signal.title,
    summary: signal.summary,
    linkedAccountIds: [...signal.linkedAccountIds],
    linkedThemeIds: [...signal.linkedThemeIds],
    geographicScope,
    dateObserved: signal.dateObserved.toISOString(),
    confidenceScore: signal.confidence.toNumber(),
    origin: signal.origin,
    evidenceCount: signal.evidence.length,
  };
}

export class ListSignalsForAccount {
  constructor(private readonly signals: ISignalRepository) {}

  async execute(accountId: string): Promise<SignalDto[]> {
    if (!accountId.trim()) {
      throw new ValidationError("accountId is required");
    }
    const signals = await this.signals.findByAccountId(asAccountId(accountId));
    return signals.map(toSignalDto);
  }
}
