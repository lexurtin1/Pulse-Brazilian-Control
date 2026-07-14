import { describe, expect, it } from "vitest";
import { UlidIdGenerator } from "./UlidIdGenerator.js";

describe("UlidIdGenerator", () => {
  it("creates distinct canonical ULIDs", () => {
    const generator = new UlidIdGenerator();
    const first = generator.newId();
    const second = generator.newId();

    expect(first).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(second).not.toBe(first);
  });
});
