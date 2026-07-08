import { InvariantViolationError } from "../shared/errors.js";
import type { ThemeId } from "../shared/identifiers.js";
import { ThemeCategory } from "./ThemeCategory.js";

/**
 * A named market theme that accounts and signals can be linked to (order
 * routing, regulation, cross-border, tokenisation, ETF, competition, or a
 * custom one). Modeled as a value object identified by a stable id — themes
 * are shared reference data, not owned by any single account.
 */
export class Theme {
  private constructor(
    readonly id: ThemeId,
    readonly category: ThemeCategory,
    readonly label: string,
    readonly description?: string,
  ) {}

  static of(params: { id: ThemeId; category: ThemeCategory; label: string; description?: string }): Theme {
    if (!params.label.trim()) {
      throw new InvariantViolationError("Theme", "label must not be empty");
    }
    return new Theme(params.id, params.category, params.label.trim(), params.description?.trim() || undefined);
  }

  equals(other: Theme): boolean {
    return this.id === other.id;
  }
}
