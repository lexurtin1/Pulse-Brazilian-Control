import { InvariantViolationError } from "../shared/errors.js";
import type { PromptProfileId } from "../shared/identifiers.js";

/**
 * A reference to a versioned prompt asset — never the prompt text itself.
 * The actual prompt markdown lives in the repo's `claude/` prompt assets;
 * this value object is only what lets an Insight say "this is which prompt,
 * at which version, produced me," so intelligence stays traceable without
 * the domain ever holding prompt strings.
 */
export class PromptProfile {
  private constructor(
    readonly id: PromptProfileId,
    readonly name: string,
    readonly version: string,
    readonly purpose: string,
  ) {}

  static of(params: { id: PromptProfileId; name: string; version: string; purpose: string }): PromptProfile {
    if (!params.name.trim()) {
      throw new InvariantViolationError("PromptProfile", "name must not be empty");
    }
    if (!params.version.trim()) {
      throw new InvariantViolationError("PromptProfile", "version must not be empty");
    }
    return new PromptProfile(params.id, params.name.trim(), params.version.trim(), params.purpose.trim());
  }
}
