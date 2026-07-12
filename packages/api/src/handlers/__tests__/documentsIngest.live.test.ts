import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import handler from "../documentsIngest.js";

/**
 * Exercises the exact handler Vercel invokes for POST /api/documents/ingest
 * against the real Postgres database and the real Anthropic API — no
 * mocking anywhere in the stack. Per issue #1's acceptance criteria: prove a
 * real document produces real, persisted Signal rows through this route.
 * Skipped (not failed) when the required live credentials aren't configured,
 * so `npm test` stays runnable offline; created rows are deleted afterward
 * so this test leaves no residue in the shared database.
 */
const hasLiveCredentials = Boolean(process.env.ANTHROPIC_API_KEY) && Boolean(process.env.DATABASE_URL);
const describeIfLive = hasLiveCredentials ? describe : describe.skip;

function fakeRequest(body: unknown): VercelRequest {
  return { method: "POST", body } as unknown as VercelRequest;
}

function fakeResponse(): VercelResponse & { statusCode?: number; body?: unknown } {
  const res = {} as VercelResponse & { statusCode?: number; body?: unknown };
  res.status = ((code: number) => {
    res.statusCode = code;
    return res;
  }) as VercelResponse["status"];
  res.json = ((payload: unknown) => {
    res.body = payload;
    return res;
  }) as VercelResponse["json"];
  return res;
}

describeIfLive("POST /api/documents/ingest (live)", () => {
  const cleanupPool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const createdSignalIds: string[] = [];
  const createdDocumentIds: string[] = [];

  afterAll(async () => {
    if (createdSignalIds.length > 0) {
      await cleanupPool.query("DELETE FROM signals WHERE id = ANY($1::text[])", [createdSignalIds]);
    }
    if (createdDocumentIds.length > 0) {
      await cleanupPool.query("DELETE FROM documents WHERE id = ANY($1::text[])", [createdDocumentIds]);
    }
    await cleanupPool.end();
  });

  it("persists real Signal rows from a real document, extracted by the live Anthropic API", async () => {
    const { rows } = await cleanupPool.query<{ id: string; name: string }>(
      "SELECT id, name FROM accounts ORDER BY name LIMIT 1",
    );
    const account = rows[0];
    expect(account, "expected at least one account to already exist in the database to attribute a signal to").toBeDefined();

    const documentText = [
      "Call note",
      "",
      `Spoke with our contact at ${account!.name} today. They confirmed they are`,
      "piloting a new tokenised fixed-income product targeting Q4 launch, and",
      "specifically asked about our cross-border settlement capabilities for",
      "USD-denominated flows.",
    ].join("\n");

    const req = fakeRequest({
      content: documentText,
      mimeType: "text/plain",
      connectorSource: "DocumentUpload",
      originalFilename: "live-test-call-note.txt",
      uploadedBy: "vitest-live-integration-test",
    });
    const res = fakeResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(201);
    const responseBody = res.body as { sourceDocumentId: string; signalsCreated: { id: string }[]; unmatchedAccountMentions: string[] };
    expect(responseBody.sourceDocumentId).toBeTruthy();
    createdDocumentIds.push(responseBody.sourceDocumentId);
    expect(responseBody.signalsCreated.length).toBeGreaterThan(0);
    for (const signal of responseBody.signalsCreated) createdSignalIds.push(signal.id);

    const { rows: persistedSignals } = await cleanupPool.query(
      "SELECT id, title, summary, linked_account_ids FROM signals WHERE id = ANY($1::text[])",
      [createdSignalIds],
    );
    expect(persistedSignals.length).toBe(responseBody.signalsCreated.length);
    for (const row of persistedSignals) {
      expect(row.linked_account_ids).toContain(account!.id);
    }
  });
});
