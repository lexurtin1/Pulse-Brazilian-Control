import { InvariantViolationError } from "./errors.js";
import { ExternalSystem } from "./ExternalSystem.js";

/**
 * A pointer into a system of record outside the domain (e.g. a Salesforce
 * Account Id). Lets Account and SourceDocument stay reconcilable with their
 * origin without the domain knowing anything about that system's API.
 */
export class ExternalReference {
  private constructor(
    readonly system: ExternalSystem,
    readonly externalId: string,
    readonly url?: string,
  ) {}

  static of(params: { system: ExternalSystem; externalId: string; url?: string }): ExternalReference {
    if (!params.externalId.trim()) {
      throw new InvariantViolationError("ExternalReference", "externalId must not be empty");
    }
    return new ExternalReference(params.system, params.externalId.trim(), params.url);
  }
}
