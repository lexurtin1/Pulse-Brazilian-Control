import type { CreateAccountCommand } from "@pulse-brazil/application";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getCompositionRoot } from "../compositionRoot.js";
import { respondToError } from "./errorResponse.js";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === "GET") {
    try {
      const accounts = await getCompositionRoot().listAccounts.execute();
      res.status(200).json(accounts);
    } catch (error) {
      console.error("[api/accounts]", error);
      res.status(500).json({ error: "Internal server error" });
    }
    return;
  }

  if (req.method === "POST") {
    const body = req.body as CreateAccountCommand | undefined;
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
