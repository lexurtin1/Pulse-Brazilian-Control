import { describe, expect, it } from "vitest";
import { ClaudeServiceAdapter } from "../ClaudeServiceAdapter.js";

/**
 * Hits the real Anthropic API with claude-sonnet-5 — no mocking, per issue #1
 * ("verify it does, end to end, with a real document producing real
 * extracted signals"). Skipped rather than failed when no key is configured
 * so `npm test` stays runnable without network access / secrets.
 */
const apiKey = process.env.ANTHROPIC_API_KEY;
const describeIfLive = apiKey ? describe : describe.skip;

describeIfLive("ClaudeServiceAdapter.extractSignalsFromDocument (live)", () => {
  it("extracts a well-formed signal from a real document via the live Anthropic API", async () => {
    const adapter = new ClaudeServiceAdapter(apiKey!);

    const knownAccounts = [
      { id: "acc_xp_investimentos", name: "XP Investimentos" },
      { id: "acc_btg_pactual", name: "BTG Pactual" },
    ];

    const documentText = [
      "Call note — 2026-06-10",
      "",
      "Spoke with our contact at XP Investimentos today. They confirmed they are",
      "piloting a new tokenised fixed-income product targeting Q4 launch, and",
      "specifically asked about our cross-border settlement capabilities for",
      "USD-denominated flows. They mentioned a competitor, Itau BBA, is already",
      "live with a similar tokenisation offering.",
    ].join("\n");

    const result = await adapter.extractSignalsFromDocument({
      documentContent: { kind: "text", text: documentText },
      knownAccounts,
    });

    expect(Array.isArray(result.signals)).toBe(true);
    expect(result.signals.length).toBeGreaterThan(0);

    for (const signal of result.signals) {
      expect(typeof signal.title).toBe("string");
      expect(signal.title.length).toBeGreaterThan(0);
      expect(typeof signal.summary).toBe("string");
      expect(signal.summary.length).toBeGreaterThan(0);
      expect(signal.confidence).toBeGreaterThanOrEqual(0);
      expect(signal.confidence).toBeLessThanOrEqual(1);
      if (signal.accountId !== null) {
        expect(knownAccounts.map((a) => a.id)).toContain(signal.accountId);
      }
    }

    // The document clearly concerns XP Investimentos — expect at least one
    // signal attributed to it rather than every signal landing unmatched.
    expect(result.signals.some((s) => s.accountId === "acc_xp_investimentos")).toBe(true);

    // Itau BBA is not in the known-accounts list, so it should surface as an
    // unmatched mention rather than being silently dropped or invented as an id.
    expect(result.unmatchedAccountMentions.some((m) => m.toLowerCase().includes("itau"))).toBe(true);
  });
});
