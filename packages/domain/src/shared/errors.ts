/**
 * Base error for every domain invariant violation. Application and
 * infrastructure code can catch this specifically to distinguish "the
 * business rules rejected this" from unexpected runtime failures.
 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

export class InvariantViolationError extends DomainError {
  constructor(entity: string, rule: string) {
    super(`${entity} invariant violated: ${rule}`);
    this.name = "InvariantViolationError";
  }
}
