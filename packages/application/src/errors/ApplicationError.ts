/**
 * Base error for the application layer's own boundary concerns — distinct
 * from domain `InvariantViolationError`. A domain error means a business
 * rule was violated; an `ApplicationError` means the use case itself
 * couldn't proceed (nothing to load, bad input, an external port failed).
 * Domain errors are allowed to propagate through use cases unchanged —
 * the two hierarchies are siblings, not parent/child.
 */
export class ApplicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApplicationError";
  }
}

/** A use case looked for something by id (or a required linked entity) and it wasn't there. */
export class NotFoundError extends ApplicationError {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`);
    this.name = "NotFoundError";
  }
}

/** A command or query failed a boundary check before it ever reached the domain (missing field, malformed shape). */
export class ValidationError extends ApplicationError {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/** A call to an external port (Claude, geocoder, connector) failed or returned something the use case couldn't use. */
export class UpstreamServiceError extends ApplicationError {
  constructor(service: string, message: string) {
    super(`${service} failed: ${message}`);
    this.name = "UpstreamServiceError";
  }
}
