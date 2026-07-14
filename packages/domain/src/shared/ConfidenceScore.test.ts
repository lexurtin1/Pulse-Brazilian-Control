import { describe, expect, it } from "vitest";
import { ConfidenceScore } from "./ConfidenceScore.js";
import { InvariantViolationError } from "./errors.js";

describe("ConfidenceScore", () => {
  it.each([
    [0, "Low"],
    [0.34, "Medium"],
    [0.67, "High"],
    [1, "High"],
  ] as const)("classifies %s as %s", (value, band) => {
    expect(ConfidenceScore.of(value).band).toBe(band);
  });

  it.each([-0.01, 1.01, Number.NaN])("rejects an invalid score: %s", (value) => {
    expect(() => ConfidenceScore.of(value)).toThrow(InvariantViolationError);
  });
});
