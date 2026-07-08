import type { AccountDetailDto, AccountMapPinDto, AccountSummaryDto, SignalDto } from "@pulse-brazil/application";

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`${path} responded with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function fetchAccounts(): Promise<AccountSummaryDto[]> {
  return fetchJson("/api/accounts");
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
