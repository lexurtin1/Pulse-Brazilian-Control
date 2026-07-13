import { asAccountId, type Signal } from "@pulse-brazil/domain";
import type { SignalDto, SignalGeographicScopeDto, SignalSourceDto } from "../../dto/signal/SignalDto.js";
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

  const detail = signal.evidence.find((evidence) => evidence.excerpt)?.excerpt;

  const seenUrls = new Set<string>();
  const sources: SignalSourceDto[] = [];
  for (const evidence of signal.evidence) {
    if (evidence.locator && !seenUrls.has(evidence.locator)) {
      seenUrls.add(evidence.locator);
      sources.push({ url: evidence.locator });
    }
  }

  return {
    id: signal.id,
    source: signal.source,
    type: signal.type,
    title: signal.title,
    summary: signal.summary,
    detail,
    sources,
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
