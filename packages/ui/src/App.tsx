import { useEffect, useMemo, useState } from "react";
import type { AccountMapPinDto, AccountSummaryDto, SignalDto } from "@pulse-brazil/application";
import { SignalFeed } from "./components/SignalFeed/SignalFeed";
import { BrazilMap } from "./components/BrazilMap/BrazilMap";
import { MapLegend } from "./components/MapLegend/MapLegend";
import { PulseLogo } from "./components/PulseLogo/PulseLogo";
import { UploadFAB } from "./components/UploadFAB/UploadFAB";
import { AccountDossier } from "./components/AccountDossier/AccountDossier";
import { fetchAccountMapPins, fetchAccounts, fetchRecentSignals } from "./api/client";
import "./App.css";

type LoadState = "loading" | "error" | "ready";

export function App() {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [dossierAccountId, setDossierAccountId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountSummaryDto[]>([]);
  const [mapPins, setMapPins] = useState<AccountMapPinDto[]>([]);
  const [signals, setSignals] = useState<SignalDto[]>([]);
  const [status, setStatus] = useState<LoadState>("loading");

  useEffect(() => {
    let cancelled = false;

    Promise.all([fetchAccounts(), fetchAccountMapPins(), fetchRecentSignals()])
      .then(([accountsResult, mapPinsResult, signalsResult]) => {
        if (cancelled) return;
        setAccounts(accountsResult);
        setMapPins(mapPinsResult);
        setSignals(signalsResult);
        setStatus("ready");
      })
      .catch((error) => {
        console.error("Failed to load Pulse Brazil data", error);
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const accountsById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);

  function handleSelectAccount(accountId: string) {
    setSelectedAccountId(accountId);
    setDossierAccountId(accountId);
  }

  if (status === "loading") {
    return <div className="app-shell app-shell--status">Loading Pulse Brazil…</div>;
  }

  if (status === "error") {
    return (
      <div className="app-shell app-shell--status">Couldn't load data. Check the API is running and try again.</div>
    );
  }

  return (
    <div className="app-shell">
      <div className="app-shell__left">
        <SignalFeed
          signals={signals}
          accountsById={accountsById}
          selectedAccountId={selectedAccountId}
          onSelectAccount={handleSelectAccount}
        />
      </div>
      <div className="app-shell__right">
        <div className="app-shell__map">
          <BrazilMap
            pins={mapPins}
            selectedAccountId={selectedAccountId}
            onSelectAccount={handleSelectAccount}
          />
        </div>
        <MapLegend />
      </div>
      <PulseLogo />
      <UploadFAB accountsForLinking={accounts} />
      <AccountDossier accountId={dossierAccountId} onClose={() => setDossierAccountId(null)} />
    </div>
  );
}
