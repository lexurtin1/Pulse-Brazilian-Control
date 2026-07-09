import { InvariantViolationError } from "@pulse-brazil/domain";
import { NotFoundError, ValidationError } from "@pulse-brazil/application";
import type { VercelResponse } from "@vercel/node";

/** Maps known application/domain error types to the right HTTP status; anything else is an unexpected 500. */
export function respondToError(res: VercelResponse, logLabel: string, error: unknown): void {
  if (error instanceof ValidationError || error instanceof InvariantViolationError) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (error instanceof NotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  console.error(logLabel, error);
  res.status(500).json({ error: "Internal server error" });
}
