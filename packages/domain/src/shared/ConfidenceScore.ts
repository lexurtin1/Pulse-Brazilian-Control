import { InvariantViolationError } from "./errors.js";

export type ConfidenceBand = "Low" | "Medium" | "High";

/**
 * A confidence level attached to any evidence-derived claim (a temperature
 * assessment, a signal, an insight). Always a normalized 0-1 value; the
 * qualitative band is derived so callers never have to duplicate the
 * thresholds themselves.
 */
export class ConfidenceScore {
  private constructor(private readonly value: number) {}

  static of(value: number): ConfidenceScore {
    if (Number.isNaN(value) || value < 0 || value > 1) {
      throw new InvariantViolationError("ConfidenceScore", "value must be a number between 0 and 1 inclusive");
    }
    return new ConfidenceScore(value);
  }

  toNumber(): number {
    return this.value;
  }

  get band(): ConfidenceBand {
    if (this.value < 0.34) return "Low";
    if (this.value < 0.67) return "Medium";
    return "High";
  }

  equals(other: ConfidenceScore): boolean {
    return this.value === other.value;
  }
}
