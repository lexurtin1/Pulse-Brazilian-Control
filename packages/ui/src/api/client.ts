import type {
  AccountDetailDto,
  AccountMapPinDto,
  AccountResearchBriefDto,
  AccountSummaryDto,
  ActiveAccountsSummaryDto,
  DashboardFreshnessDto,
  ExpansionUpdateDto,
  ImportLocationCsvResultDto,
  ImportPipelineCsvResultDto,
  LocationRecordMapPinDto,
  OpenDealsResultDto,
  PipelineSummaryDto,
  ProcessDocumentUploadResultDto,
  ReconcileSalesforceAccountsResultDto,
  RunMarketResearchSweepResult,
  SignalDto,
  UpdateExpansionUpdateCommand,
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

export function fetchOpenDeals(): Promise<OpenDealsResultDto | null> {
  return fetchJson("/api/pipeline/open-deals");
}

export function fetchDashboardFreshness(): Promise<DashboardFreshnessDto> {
  return fetchJson("/api/dashboard/freshness");
}

/** `null` until the first call note or meeting document has been ingested. */
export function fetchLatestUpdate(): Promise<ExpansionUpdateDto | null> {
  return fetchJson("/api/dashboard/latest-update");
}

/** Only the fields present in `patch` are changed, and each one becomes pinned against future document ingests. */
export async function saveLatestUpdate(patch: UpdateExpansionUpdateCommand): Promise<ExpansionUpdateDto> {
  const response = await fetch("/api/dashboard/latest-update", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const payload = (await response.json().catch(() => null)) as (ExpansionUpdateDto & { error?: string }) | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? `/api/dashboard/latest-update PATCH responded with ${response.status}`);
  }
  return payload as ExpansionUpdateDto;
}

/** Enriches existing accounts from a Salesforce account export — this is what populates the client types the map colours by. Never creates accounts. */
export function reconcileSalesforceAccounts(params: { csvText: string }): Promise<ReconcileSalesforceAccountsResultDto> {
  return postJson("/api/accounts", params);
}

export function ingestDocument(params: {
  content: string;
  mimeType: "text/plain" | "application/pdf" | "image/png" | "image/jpeg" | "image/webp" | "image/gif";
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

/** Triggers a real Perplexity call per market-wide topic (6 fixed topics) — same endpoint Vercel Cron hits on schedule. */
export function runResearchSweep(): Promise<RunMarketResearchSweepResult> {
  return fetchJson("/api/signals/research-sweep");
}

/** Permanently deletes every signal in the database — backs the live feed's "Clear feed" button. Irreversible. */
export async function clearSignals(): Promise<void> {
  const response = await fetch("/api/signals", { method: "DELETE" });
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? `/api/signals DELETE responded with ${response.status}`);
  }
}

/** Triggers a real, account-scoped Perplexity call ("Information Sweep") — replaces any existing brief for this account. */
export function runAccountResearchSweep(accountId: string): Promise<AccountResearchBriefDto> {
  return postJson(`/api/accounts/${encodeURIComponent(accountId)}`, {});
}
