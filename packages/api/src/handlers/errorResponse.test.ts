import { describe, expect, it, vi } from "vitest";
import { ValidationError } from "@pulse-brazil/application";
import type { VercelResponse } from "@vercel/node";
import { respondToError } from "./errorResponse.js";

function responseDouble(): { response: VercelResponse; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { response: { status } as unknown as VercelResponse, status, json };
}

describe("respondToError", () => {
  it("maps application validation failures to HTTP 400", () => {
    const { response, status, json } = responseDouble();

    respondToError(response, "test", new ValidationError("invalid input"));

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ error: "invalid input" });
  });
});
