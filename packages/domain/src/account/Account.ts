import { InvariantViolationError } from "../shared/errors.js";
import { ExternalReference } from "../shared/ExternalReference.js";
import { GeographicScope } from "../shared/GeographicScope.js";
import type { AccountId, SignalId, ThemeId } from "../shared/identifiers.js";
import { AccountStatus } from "./AccountStatus.js";
import { AccountType } from "./AccountType.js";
import { OfficeLocation } from "./OfficeLocation.js";
import { TemperatureAssessment } from "./TemperatureAssessment.js";

interface AccountProps {
  id: AccountId;
  name: string;
  accountType: AccountType;
  status: AccountStatus;
  geographicScope: GeographicScope;
  officeLocations: readonly OfficeLocation[];
  linkedThemeIds: readonly ThemeId[];
  /**
   * Denormalized read convenience. Signal.linkedAccountIds is the
   * authoritative link direction; the application layer is responsible for
   * keeping this list in sync when signals are linked or unlinked.
   */
  linkedSignalIds: readonly SignalId[];
  latestTemperature?: TemperatureAssessment;
  externalReferences: readonly ExternalReference[];
}

function assertOnePrimaryOffice(offices: readonly OfficeLocation[]): void {
  if (offices.length === 0) return;
  const primaryCount = offices.filter((office) => office.isPrimary).length;
  if (primaryCount !== 1) {
    throw new InvariantViolationError("Account", "exactly one officeLocation must be marked primary when any are present");
  }
}

function assertUniqueExternalSystems(refs: readonly ExternalReference[]): void {
  const systems = new Set(refs.map((ref) => ref.system));
  if (systems.size !== refs.length) {
    throw new InvariantViolationError("Account", "externalReferences must have at most one entry per ExternalSystem");
  }
}

/**
 * The durable business entity for a Brazilian capital-markets account —
 * the aggregate root that offices, temperature history, theme/signal
 * linkage, and external identifiers all hang off of. Not a CRM mirror:
 * Salesforce is one external reference among possibly several, not the
 * account's identity.
 */
export class Account {
  private constructor(private readonly props: AccountProps) {}

  static create(params: {
    id: AccountId;
    name: string;
    accountType: AccountType;
    status: AccountStatus;
    geographicScope: GeographicScope;
    officeLocations?: readonly OfficeLocation[];
    linkedThemeIds?: readonly ThemeId[];
    linkedSignalIds?: readonly SignalId[];
    latestTemperature?: TemperatureAssessment;
    externalReferences?: readonly ExternalReference[];
  }): Account {
    if (!params.name.trim()) {
      throw new InvariantViolationError("Account", "name must not be empty");
    }
    const officeLocations = params.officeLocations ?? [];
    const externalReferences = params.externalReferences ?? [];
    assertOnePrimaryOffice(officeLocations);
    assertUniqueExternalSystems(externalReferences);

    if (params.latestTemperature && params.latestTemperature.accountId !== params.id) {
      throw new InvariantViolationError("Account", "latestTemperature must belong to this account");
    }

    return new Account({
      id: params.id,
      name: params.name.trim(),
      accountType: params.accountType,
      status: params.status,
      geographicScope: params.geographicScope,
      officeLocations,
      linkedThemeIds: params.linkedThemeIds ?? [],
      linkedSignalIds: params.linkedSignalIds ?? [],
      latestTemperature: params.latestTemperature,
      externalReferences,
    });
  }

  get id(): AccountId {
    return this.props.id;
  }
  get name(): string {
    return this.props.name;
  }
  get accountType(): AccountType {
    return this.props.accountType;
  }
  get status(): AccountStatus {
    return this.props.status;
  }
  get geographicScope(): GeographicScope {
    return this.props.geographicScope;
  }
  get officeLocations(): readonly OfficeLocation[] {
    return this.props.officeLocations;
  }
  get primaryOfficeLocation(): OfficeLocation | undefined {
    return this.props.officeLocations.find((office) => office.isPrimary);
  }
  get linkedThemeIds(): readonly ThemeId[] {
    return this.props.linkedThemeIds;
  }
  get linkedSignalIds(): readonly SignalId[] {
    return this.props.linkedSignalIds;
  }
  get latestTemperature(): TemperatureAssessment | undefined {
    return this.props.latestTemperature;
  }
  get externalReferences(): readonly ExternalReference[] {
    return this.props.externalReferences;
  }

  withStatus(status: AccountStatus): Account {
    return new Account({ ...this.props, status });
  }

  withOfficeLocations(officeLocations: readonly OfficeLocation[]): Account {
    assertOnePrimaryOffice(officeLocations);
    return new Account({ ...this.props, officeLocations });
  }

  withExternalReferences(externalReferences: readonly ExternalReference[]): Account {
    assertUniqueExternalSystems(externalReferences);
    return new Account({ ...this.props, externalReferences });
  }

  /** Records a new temperature read as the account's current snapshot. The full history is owned outside this aggregate. */
  applyTemperatureAssessment(assessment: TemperatureAssessment): Account {
    if (assessment.accountId !== this.props.id) {
      throw new InvariantViolationError("Account", "assessment.accountId must match this account");
    }
    return new Account({ ...this.props, latestTemperature: assessment });
  }

  linkTheme(themeId: ThemeId): Account {
    if (this.props.linkedThemeIds.includes(themeId)) return this;
    return new Account({ ...this.props, linkedThemeIds: [...this.props.linkedThemeIds, themeId] });
  }

  unlinkTheme(themeId: ThemeId): Account {
    return new Account({
      ...this.props,
      linkedThemeIds: this.props.linkedThemeIds.filter((id) => id !== themeId),
    });
  }

  linkSignal(signalId: SignalId): Account {
    if (this.props.linkedSignalIds.includes(signalId)) return this;
    return new Account({ ...this.props, linkedSignalIds: [...this.props.linkedSignalIds, signalId] });
  }

  unlinkSignal(signalId: SignalId): Account {
    return new Account({
      ...this.props,
      linkedSignalIds: this.props.linkedSignalIds.filter((id) => id !== signalId),
    });
  }
}
