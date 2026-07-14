import { describe, expect, it } from "vitest";
import { formatEnumLabel } from "./formatEnumLabel";

describe("formatEnumLabel", () => {
  it("separates camel-case enum labels", () => {
    expect(formatEnumLabel("RegulatoryChange")).toBe("Regulatory Change");
  });
});
