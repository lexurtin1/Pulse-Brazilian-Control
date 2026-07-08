import { ConfidenceScore } from "../shared/ConfidenceScore.js";
import { ConnectorSource } from "../shared/ConnectorSource.js";
import { InvariantViolationError } from "../shared/errors.js";
import { EvidenceReference } from "../shared/EvidenceReference.js";
import { GeographicScope } from "../shared/GeographicScope.js";
import type { AccountId, SignalId, ThemeId } from "../shared/identifiers.js";
import { SignalOrigin } from "./SignalOrigin.js";
import { SignalType } from "./SignalType.js";

/**
 * A discrete piece of market or account intelligence — a regulatory
 * change, a competitive move, a cross-border development — captured with
 * enough linkage that it is never an orphaned fact. Every Signal must tie
 * back to at least an account, a theme, or a geography so it can always be
 * surfaced in a relevant place.
 */
export class Signal {
  private constructor(
    readonly id: SignalId,
    readonly source: ConnectorSource,
    readonly type: SignalType,
    readonly title: string,
    readonly summary: string,
    readonly linkedAccountIds: readonly AccountId[],
    readonly linkedThemeIds: readonly ThemeId[],
    readonly geographicScope: GeographicScope | undefined,
    readonly dateObserved: Date,
    readonly evidence: readonly EvidenceReference[],
    readonly confidence: ConfidenceScore,
    readonly origin: SignalOrigin,
  ) {}

  static of(params: {
    id: SignalId;
    source: ConnectorSource;
    type: SignalType;
    title: string;
    summary: string;
    linkedAccountIds?: readonly AccountId[];
    linkedThemeIds?: readonly ThemeId[];
    geographicScope?: GeographicScope;
    dateObserved: Date;
    evidence: readonly EvidenceReference[];
    confidence: ConfidenceScore;
    origin: SignalOrigin;
  }): Signal {
    if (!params.title.trim()) {
      throw new InvariantViolationError("Signal", "title must not be empty");
    }
    if (params.dateObserved.getTime() > Date.now()) {
      throw new InvariantViolationError("Signal", "dateObserved must not be in the future");
    }
    const linkedAccountIds = params.linkedAccountIds ?? [];
    const linkedThemeIds = params.linkedThemeIds ?? [];
    if (linkedAccountIds.length === 0 && linkedThemeIds.length === 0 && !params.geographicScope) {
      throw new InvariantViolationError(
        "Signal",
        "must link to at least one account, theme, or geographic scope",
      );
    }
    if (params.origin === SignalOrigin.MachineDerived && params.source === ConnectorSource.ManualEntry) {
      throw new InvariantViolationError("Signal", "MachineDerived origin cannot use ConnectorSource.ManualEntry");
    }
    return new Signal(
      params.id,
      params.source,
      params.type,
      params.title.trim(),
      params.summary.trim(),
      linkedAccountIds,
      linkedThemeIds,
      params.geographicScope,
      params.dateObserved,
      params.evidence,
      params.confidence,
      params.origin,
    );
  }
}
