import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import type {
  AccountMapPinDto,
  AccountSummaryDto,
  ActiveAccountsSummaryDto,
  LocationRecordMapPinDto,
  PipelineSummaryDto,
  SignalDto,
  TopOpenDealsResultDto,
} from "@pulse-brazil/application";
import { CesiumGlobe } from "./components/CesiumGlobe/CesiumGlobe";
import { MapLegend } from "./components/MapLegend/MapLegend";
import { CreateAccountFAB } from "./components/CreateAccountFAB/CreateAccountFAB";
import { AccountDossier } from "./components/AccountDossier/AccountDossier";
import { LocationPinDetail } from "./components/LocationPinDetail/LocationPinDetail";
import { EntryAnimation } from "./components/EntryAnimation/EntryAnimation";
import { CommandHeader } from "./components/CommandCentre/CommandHeader";
import { KpiCard } from "./components/CommandCentre/KpiCard";
import { FeedControlsCard } from "./components/CommandCentre/FeedControlsCard";
import { TopOpenDealsCard } from "./components/CommandCentre/TopOpenDealsCard";
import { LiveFeedCard } from "./components/CommandCentre/LiveFeedCard";
import {
  fetchAccountMapPins,
  fetchAccounts,
  fetchActiveAccountsSummary,
  fetchLocationMapPins,
  fetchPipelineSummary,
  fetchRecentSignals,
  fetchTopOpenDeals,
} from "./api/client";
import { formatCount, formatCountDelta, formatCurrency, formatCurrencyDelta, formatShortDate } from "./utils/formatNumbers";
import { primaryClientType } from "./utils/clientType";
import "./components/CommandCentre/CommandCentre.css";
import "./App.css";

type LoadState = "loading" | "error" | "ready";

const INTRO_SESSION_KEY = "pulse:intro-seen";

const shellVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
};

const shellItemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

export function App() {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [dossierAccountId, setDossierAccountId] = useState<string | null>(null);
  const [selectedLocationPin, setSelectedLocationPin] = useState<LocationRecordMapPinDto | null>(null);
  const [accounts, setAccounts] = useState<AccountSummaryDto[]>([]);
  const [mapPins, setMapPins] = useState<AccountMapPinDto[]>([]);
  const [locationPins, setLocationPins] = useState<LocationRecordMapPinDto[]>([]);
  const [signals, setSignals] = useState<SignalDto[]>([]);
  const [pipelineSummary, setPipelineSummary] = useState<PipelineSummaryDto | null>(null);
  const [activeAccountsSummary, setActiveAccountsSummary] = useState<ActiveAccountsSummaryDto | null>(null);
  const [topOpenDeals, setTopOpenDeals] = useState<TopOpenDealsResultDto | null>(null);
  const [status, setStatus] = useState<LoadState>("loading");
  const [hiddenClientTypes, setHiddenClientTypes] = useState<ReadonlySet<string | undefined>>(() => new Set());
  const [introDone, setIntroDone] = useState(() => sessionStorage.getItem(INTRO_SESSION_KEY) === "1");
  const mapWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetchAccounts(),
      fetchAccountMapPins(),
      fetchRecentSignals(),
      fetchLocationMapPins(),
      fetchPipelineSummary(),
      fetchTopOpenDeals(),
      fetchActiveAccountsSummary(),
    ])
      .then(
        ([
          accountsResult,
          mapPinsResult,
          signalsResult,
          locationPinsResult,
          pipelineSummaryResult,
          topOpenDealsResult,
          activeAccountsSummaryResult,
        ]) => {
          if (cancelled) return;
          setAccounts(accountsResult);
          setMapPins(mapPinsResult);
          setSignals(signalsResult);
          setLocationPins(locationPinsResult);
          setPipelineSummary(pipelineSummaryResult);
          setTopOpenDeals(topOpenDealsResult);
          setActiveAccountsSummary(activeAccountsSummaryResult);
          setStatus("ready");
        },
      )
      .catch((error) => {
        console.error("Failed to load Pulse Brazil data", error);
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // After a CSV import, re-fetch just the location pins so newly uploaded
  // records show up without a full page reload.
  const refreshLocationPins = useCallback(() => {
    fetchLocationMapPins()
      .then(setLocationPins)
      .catch((error) => console.error("Failed to refresh location pins", error));
  }, []);

  // After a document ingest, re-fetch the signal feed so newly extracted
  // signals show up without a full page reload.
  const refreshSignals = useCallback(() => {
    fetchRecentSignals()
      .then(setSignals)
      .catch((error) => console.error("Failed to refresh signals", error));
  }, []);

  // After a Pipeline CSV import, re-fetch the summary + top deals so the KPI
  // strip and rail panel show up without a full page reload.
  const refreshPipeline = useCallback(() => {
    fetchPipelineSummary()
      .then(setPipelineSummary)
      .catch((error) => console.error("Failed to refresh pipeline summary", error));
    fetchTopOpenDeals()
      .then(setTopOpenDeals)
      .catch((error) => console.error("Failed to refresh top open deals", error));
  }, []);

  // After a Location CSV import, re-fetch the Active Accounts summary so
  // its count/delta reflect the new AccountCountSnapshot without a full
  // page reload.
  const refreshActiveAccountsSummary = useCallback(() => {
    fetchActiveAccountsSummary()
      .then(setActiveAccountsSummary)
      .catch((error) => console.error("Failed to refresh active accounts summary", error));
  }, []);

  // One callback for all upload paths — refetching data that a given upload
  // didn't touch is cheap and harmless, and keeps UploadFAB from needing to
  // know which backend path it took.
  const refreshAfterUpload = useCallback(() => {
    refreshLocationPins();
    refreshSignals();
    refreshPipeline();
    refreshActiveAccountsSummary();
  }, [refreshLocationPins, refreshSignals, refreshPipeline, refreshActiveAccountsSummary]);

  // After creating an account, re-fetch the account list so it's available
  // wherever accounts are listed (e.g. UploadFAB's "link to account" select).
  const refreshAccounts = useCallback(() => {
    fetchAccounts()
      .then(setAccounts)
      .catch((error) => console.error("Failed to refresh accounts", error));
  }, []);

  const accountsById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);

  // Clicking a legend pill hides/shows that client type's pins on the map —
  // the legend itself always lists every client type (driven by the full,
  // unfiltered mapPins) so a hidden type's pill never disappears and stays
  // clickable to bring it back.
  const toggleClientType = useCallback((clientType: string | undefined) => {
    setHiddenClientTypes((current) => {
      const next = new Set(current);
      if (next.has(clientType)) next.delete(clientType);
      else next.add(clientType);
      return next;
    });
  }, []);

  const visibleMapPins = useMemo(
    () => mapPins.filter((pin) => !hiddenClientTypes.has(primaryClientType(pin.clientTypes))),
    [mapPins, hiddenClientTypes],
  );

  const showIntro = status === "ready" && !introDone;

  // Set the "seen" flag as soon as the intro starts, not when it finishes —
  // a refresh mid-animation should land straight on the dashboard, never
  // replay the sequence.
  useEffect(() => {
    if (showIntro) sessionStorage.setItem(INTRO_SESSION_KEY, "1");
  }, [showIntro]);

  function handleSelectAccount(accountId: string) {
    setSelectedAccountId(accountId);
    setDossierAccountId(accountId);
  }

  if (status === "loading") {
    return <div className="command-centre command-centre--status">Loading Pulse Brazil…</div>;
  }

  if (status === "error") {
    return (
      <div className="command-centre command-centre--status">
        Couldn't load data. Check the API is running and try again.
      </div>
    );
  }

  return (
    <>
      <motion.div
        className="command-centre"
        variants={shellVariants}
        initial={showIntro ? "hidden" : false}
        animate={showIntro ? "hidden" : "visible"}
      >
        <CommandHeader />
        <div className="command-centre__body">
          <motion.div className="kpi-strip" variants={shellItemVariants}>
            <KpiCard
              accent="blue"
              label="ACTIVE ACCOUNTS · BR"
              value={activeAccountsSummary ? formatCount(activeAccountsSummary.count) : undefined}
              footnote={
                activeAccountsSummary
                  ? activeAccountsSummary.delta
                    ? `${formatCountDelta(activeAccountsSummary.delta.count)} vs. upload on ${formatShortDate(activeAccountsSummary.delta.previousAsOf)}`
                    : `as of ${formatShortDate(activeAccountsSummary.asOf)}`
                  : "Upload a Location CSV to populate this card"
              }
            />
            <KpiCard
              accent="teal"
              label="PIPELINE VALUE - UNWEIGHTED"
              value={pipelineSummary ? formatCurrency(pipelineSummary.unweightedValue) : undefined}
              footnote={
                pipelineSummary
                  ? pipelineSummary.unweightedDelta
                    ? `${formatCurrencyDelta(pipelineSummary.unweightedDelta.amount)} vs. upload on ${formatShortDate(pipelineSummary.unweightedDelta.previousAsOf)}`
                    : `${pipelineSummary.openDealCount} open deals as of ${formatShortDate(pipelineSummary.asOf)}`
                  : "Upload a Salesforce pipeline export to populate this card"
              }
            />
            <KpiCard
              accent="teal"
              label="PIPELINE VALUE - WEIGHTED"
              value={pipelineSummary ? formatCurrency(pipelineSummary.weightedValue) : undefined}
              footnote={
                pipelineSummary
                  ? pipelineSummary.weightedDelta
                    ? `${formatCurrencyDelta(pipelineSummary.weightedDelta.amount)} vs. upload on ${formatShortDate(pipelineSummary.weightedDelta.previousAsOf)}`
                    : `probability-weighted, as of ${formatShortDate(pipelineSummary.asOf)}`
                  : "Upload a Salesforce pipeline export to populate this card"
              }
            />
            <FeedControlsCard accountsForLinking={accounts} onImported={refreshAfterUpload} onSweepComplete={refreshSignals} />
          </motion.div>

          <div className="main-grid">
            <motion.div className="map-panel" variants={shellItemVariants}>
              <div className="map-panel__header">
                <span className="map-panel__title">OPERATIONAL MAP · BRAZIL</span>
              </div>
              <div className="map-panel__canvas">
                <div ref={mapWrapRef} className="app-shell__map-live">
                  <CesiumGlobe
                    pins={visibleMapPins}
                    locationPins={locationPins}
                    selectedAccountId={selectedAccountId}
                    onSelectAccount={handleSelectAccount}
                    onSelectLocationPin={setSelectedLocationPin}
                  />
                </div>
                <MapLegend pins={mapPins} hiddenClientTypes={hiddenClientTypes} onToggleClientType={toggleClientType} />
              </div>
            </motion.div>

            <motion.div className="right-rail" variants={shellItemVariants}>
              <TopOpenDealsCard topOpenDeals={topOpenDeals} accountsById={accountsById} />
              <LiveFeedCard
                signals={signals}
                accountsById={accountsById}
                selectedAccountId={selectedAccountId}
                onSelectAccount={handleSelectAccount}
              />
            </motion.div>
          </div>
        </div>

        <motion.div variants={shellItemVariants}>
          <CreateAccountFAB onCreated={refreshAccounts} />
        </motion.div>
      </motion.div>
      {showIntro && <EntryAnimation mapRef={mapWrapRef} onComplete={() => setIntroDone(true)} />}
      <AccountDossier accountId={dossierAccountId} onClose={() => setDossierAccountId(null)} />
      <LocationPinDetail
        pin={selectedLocationPin}
        onClose={() => setSelectedLocationPin(null)}
        onSelectAccount={(accountId) => {
          setSelectedLocationPin(null);
          handleSelectAccount(accountId);
        }}
      />
    </>
  );
}
