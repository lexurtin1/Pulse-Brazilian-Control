import { describe, expect, it } from "vitest";
import { parseCsv } from "./parseCsv.js";

describe("parseCsv", () => {
  it("preserves commas and escaped quotes inside quoted fields", () => {
    expect(parseCsv('name,summary\r\n"Banco, SA","Said ""hello"""')).toEqual({
      headers: ["name", "summary"],
      rows: [{ name: "Banco, SA", summary: 'Said "hello"' }],
    });
  });

  it("ignores a UTF-8 BOM on the first header", () => {
    expect(parseCsv("\uFEFFname,status\nAcme,Active").headers).toEqual(["name", "status"]);
  });
});
