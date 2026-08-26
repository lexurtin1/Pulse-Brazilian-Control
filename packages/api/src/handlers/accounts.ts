import type { CreateAccountCommand } from "@pulse-brazil/application";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getCompositionRoot } from "../compositionRoot.js";
import { respondToError } from "./errorResponse.js";

/**
 * GET handles both the account list and the Active Accounts summary via a
 * `?summary=1` query flag, and POST handles both creating a single account
 * and reconciling a whole Salesforce account export, discriminated on body
 * shape. Neither gets a file of its own because this project is at the
 * Vercel Hobby plan's 12-Serverless-Function cap (see api/pipeline's
 * catch-all route for the same constraint).
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === "GET") {
    try {
      if (req.query.summary !== undefined) {
        const summary = await getCompositionRoot().getActiveAccountsSummary.execute();
        res.status(200).json(summary);
        return;
      }
      const accounts = await getCompositionRoot().listAccounts.execute();
      res.status(200).json(accounts);
    } catch (error) {
      console.error("[api/accounts]", error);
      res.status(500).json({ error: "Internal server error" });
    }
    return;
  }

  if (req.method === "POST") {
    const body = req.body as (CreateAccountCommand & { csvText?: string }) | undefined;

    // A csvText body is a Salesforce account export, not a new account. This
    // is the path that populates client types — without it the only way to
    // set them is a CLI script, and the map's colours stay grey.
    if (body && typeof body.csvText === "string") {
      try {
        const result = await getCompositionRoot().reconcileSalesforceAccounts.execute({ csvText: body.csvText });
        res.status(200).json(result);
      } catch (error) {
        respondToError(res, "[api/accounts POST reconcile]", error);
      }
      return;
    }

    if (!body || typeof body.name !== "string" || typeof body.accountType !== "string" || !body.geographicScope) {
      res.status(400).json({ error: "Request body must include name, accountType, and geographicScope" });
      return;
    }
    try {
      const account = await getCompositionRoot().createAccount.execute(body);
      res.status(201).json(account);
    } catch (error) {
      respondToError(res, "[api/accounts POST]", error);
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
