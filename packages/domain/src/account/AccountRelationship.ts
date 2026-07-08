import { InvariantViolationError } from "../shared/errors.js";
import type { AccountId, AccountRelationshipId } from "../shared/identifiers.js";
import { AccountRelationshipType } from "./AccountRelationshipType.js";

/**
 * A directed relationship between two accounts (e.g. parent/subsidiary,
 * competitor, counterparty). Modeled independently of the Account aggregate
 * — a relationship references both accounts by id rather than being owned
 * by either one, since it spans two aggregate roots and is the seed of the
 * future relationship graph.
 */
export class AccountRelationship {
  private constructor(
    readonly id: AccountRelationshipId,
    readonly fromAccountId: AccountId,
    readonly toAccountId: AccountId,
    readonly relationshipType: AccountRelationshipType,
    readonly rationale?: string,
  ) {}

  static of(params: {
    id: AccountRelationshipId;
    fromAccountId: AccountId;
    toAccountId: AccountId;
    relationshipType: AccountRelationshipType;
    rationale?: string;
  }): AccountRelationship {
    if (params.fromAccountId === params.toAccountId) {
      throw new InvariantViolationError("AccountRelationship", "fromAccountId and toAccountId must differ");
    }
    return new AccountRelationship(
      params.id,
      params.fromAccountId,
      params.toAccountId,
      params.relationshipType,
      params.rationale?.trim() || undefined,
    );
  }
}
