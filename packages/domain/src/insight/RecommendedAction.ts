import { InvariantViolationError } from "../shared/errors.js";

/** An optional suggested next step attached to an Insight. */
export class RecommendedAction {
  private constructor(
    readonly description: string,
    readonly dueDate?: Date,
  ) {}

  static of(params: { description: string; dueDate?: Date }): RecommendedAction {
    if (!params.description.trim()) {
      throw new InvariantViolationError("RecommendedAction", "description must not be empty");
    }
    return new RecommendedAction(params.description.trim(), params.dueDate);
  }
}
