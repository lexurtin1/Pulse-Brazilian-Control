import type {
  AccountDetailDto,
  AccountMapPinDto,
  AccountSummaryDto,
  ActiveAccountsSummaryDto,
  ImportLocationCsvResultDto,
  ImportPipelineCsvResultDto,
  LocationRecordMapPinDto,
  PipelineSummaryDto,
  ProcessDocumentUploadResultDto,
  RunMarketResearchSweepResult,
  SignalDto,
  TopOpenDealsResultDto,
} from "@pulse-brazil/application";

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`${path} responded with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? `${path} responded with ${response.status}`);
  }
  return payload as T;
}

export function fetchAccounts(): Promise<AccountSummaryDto[]> {
  return fetchJson("/api/accounts");
}

export function fetchActiveAccountsSummary(): Promise<ActiveAccountsSummaryDto | null> {
  return fetchJson("/api/accounts?summary=1");
}

export function fetchAccountMapPins(): Promise<AccountMapPinDto[]> {
  return fetchJson("/api/accounts/map-pins");
}

export function fetchRecentSignals(limit?: number): Promise<SignalDto[]> {
  const query = limit ? `?limit=${limit}` : "";
  return fetchJson(`/api/signals/recent${query}`);
}

export function fetchAccountDetail(accountId: string): Promise<AccountDetailDto> {
  return fetchJson(`/api/accounts/${encodeURIComponent(accountId)}`);
}

export function fetchLocationMapPins(): Promise<LocationRecordMapPinDto[]> {
  return fetchJson("/api/locations/map-pins");
}

export function importLocationCsv(params: {
  csvText: string;
  originalFilename?: string;
  uploadedBy?: string;
}): Promise<ImportLocationCsvResultDto> {
  return postJson("/api/locations/import", params);
}

export function importPipelineCsv(params: {
  csvText: string;
  originalFilename?: string;
  uploadedBy?: string;
}): Promise<ImportPipelineCsvResultDto> {
  return postJson("/api/pipeline/import", params);
}

export function fetchPipelineSummary(): Promise<PipelineSummaryDto | null> {
  return fetchJson("/api/pipeline/summary");
}

export function fetchTopOpenDeals(): Promise<TopOpenDealsResultDto | null> {
  return fetchJson("/api/pipeline/top-open-deals");
}

export function ingestDocument(params: {
  content: string;
  mimeType: "text/plain" | "application/pdf";
  connectorSource: string;
  originalFilename?: string;
}): Promise<ProcessDocumentUploadResultDto> {
  return postJson("/api/documents/ingest", params);
}

export function createAccount(params: {
  name: string;
  accountType: string;
  status?: string;
  city?: string;
}): Promise<AccountSummaryDto> {
  return postJson("/api/accounts", {
    name: params.name,
    accountType: params.accountType,
    status: params.status,
    geographicScope: { countryCode: "BR", city: params.city },
  });
}

/** Triggers a real Perplexity call per query (3 per Prospect/Active account) — same endpoint Vercel Cron hits on schedule. `limit` caps how many eligible accounts are processed. */
export function runResearchSweep(limit?: number): Promise<RunMarketResearchSweepResult> {
  const query = limit !== undefined ? `?limit=${limit}` : "";
  return fetchJson(`/api/signals/research-sweep${query}`);
}
