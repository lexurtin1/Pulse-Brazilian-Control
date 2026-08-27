import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import type {
  AccountMapPinDto,
  AccountSummaryDto,
  DashboardFreshnessDto,
  ExpansionUpdateDto,
  OpenDealsResultDto,
  PipelineSummaryDto,
  SignalDto,
} from "@pulse-brazil/application";
import { CesiumGlobe } from "./components/CesiumGlobe/CesiumGlobe";
import { MapLegend } from "./components/MapLegend/MapLegend";
import { CreateAccountFAB } from "./components/CreateAccountFAB/CreateAccountFAB";
import { AccountDossier } from "./components/AccountDossier/AccountDossier";
import { EntryAnimation } from "./components/EntryAnimation/EntryAnimation";
import { CommandHeader } from "./components/CommandCentre/CommandHeader";
import { KpiCard } from "./components/CommandCentre/KpiCard";
import { LatestUpdateCard } from "./components/CommandCentre/LatestUpdateCard";
import { OpenDealsCard } from "./components/CommandCentre/OpenDealsCard";
import { LiveFeedCard } from "./components/CommandCentre/LiveFeedCard";
import {
  fetchAccountMapPins,
  fetchAccounts,
  fetchDashboardFreshness,
  fetchLatestUpdate,
  fetchOpenDeals,
  fetchPipelineSummary,
  fetchRecentSignals,
} from "./api/client";
import { formatCurrency, formatCurrencyDelta, formatShortDate } from "./utils/formatNumbers";
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
  const [accounts, setAccounts] = useState<AccountSummaryDto[]>([]);
  const [mapPins, setMapPins] = useState<AccountMapPinDto[]>([]);
  const [signals, setSignals] = useState<SignalDto[]>([]);
  const [pipelineSummary, setPipelineSummary] = useState<PipelineSummaryDto | null>(null);
  const [openDeals, setOpenDeals] = useState<OpenDealsResultDto | null>(null);
  const [dashboardFreshness, setDashboardFreshness] = useState<DashboardFreshnessDto | null>(null);
  const [latestUpdate, setLatestUpdate] = useState<ExpansionUpdateDto | null>(null);
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
      fetchPipelineSummary(),
      fetchOpenDeals(),
      fetchDashboardFreshness(),
      fetchLatestUpdate(),
    ])
      .then(
        ([
          accountsResult,
          mapPinsResult,
          signalsResult,
          pipelineSummaryResult,
          openDealsResult,
          dashboardFreshnessResult,
          latestUpdateResult,
        ]) => {
          if (cancelled) return;
          setAccounts(accountsResult);
          setMapPins(mapPinsResult);
          setSignals(signalsResult);
          setPipelineSummary(pipelineSummaryResult);
          setOpenDeals(openDealsResult);
          setDashboardFreshness(dashboardFreshnessResult);
          setLatestUpdate(latestUpdateResult);
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

  // After a document ingest, re-fetch the signal feed so newly extracted
  // signals show up without a full page reload.
  const refreshSignals = useCallback(() => {
    fetchRecentSignals()
      .then(setSignals)
      .catch((error) => console.error("Failed to refresh signals", error));
  }, []);

  // After a Pipeline CSV import, re-fetch the summary + open deals so the KPI
  // strip and rail panel show up without a full page reload.
  const refreshPipeline = useCallback(() => {
    fetchPipelineSummary()
      .then(setPipelineSummary)
      .catch((error) => console.error("Failed to refresh pipeline summary", error));
    fetchOpenDeals()
      .then(setOpenDeals)
      .catch((error) => console.error("Failed to refresh open deals", error));
  }, []);

  // After a document ingest, re-fetch the Brazil update — a call note or set
  // of meeting minutes revises it, and the card is the first thing read.
  const refreshLatestUpdate = useCallback(() => {
    fetchLatestUpdate()
      .then(setLatestUpdate)
      .catch((error) => console.error("Failed to refresh the latest update", error));
  }, []);

  // An account or location import changes what the map draws — pin coordinates
  // from a location CSV, client-type colours from a Salesforce account export.
  const refreshMapPins = useCallback(() => {
    fetchAccountMapPins()
      .then(setMapPins)
      .catch((error) => console.error("Failed to refresh map pins", error));
  }, []);

  // After creating an account, or reconciling a Salesforce account export,
  // re-fetch the account list — it backs the client-type dots on Open Deals
  // and the Live Feed as well as the account name lookup.
  const refreshAccounts = useCallback(() => {
    fetchAccounts()
      .then(setAccounts)
      .catch((error) => console.error("Failed to refresh accounts", error));
  }, []);

  // After a Pipeline CSV import or a sweep run, re-fetch the freshness ring
  // so it reflects the new upload/sweep timestamp immediately, not just on
  // the next full page load.
  const refreshFreshness = useCallback(() => {
    fetchDashboardFreshness()
      .then(setDashboardFreshness)
      .catch((error) => console.error("Failed to refresh dashboard freshness", error));
  }, []);

  // A research sweep run affects both the signal feed and the freshness
  // ring's market-sweep timestamp.
  const handleSweepComplete = useCallback(() => {
    refreshSignals();
    refreshFreshness();
  }, [refreshSignals, refreshFreshness]);

  // One callback for all upload paths — refetching data that a given upload
  // didn't touch is cheap and harmless, and keeps UploadFAB from needing to
  // know which backend path it took.
  const refreshAfterUpload = useCallback(() => {
    refreshSignals();
    refreshPipeline();
    refreshFreshness();
    refreshLatestUpdate();
    refreshMapPins();
    refreshAccounts();
  }, [refreshSignals, refreshPipeline, refreshFreshness, refreshLatestUpdate, refreshMapPins, refreshAccounts]);

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
        <CommandHeader
          freshness={dashboardFreshness}
          onImported={refreshAfterUpload}
          onSweepComplete={handleSweepComplete}
          onFeedCleared={refreshSignals}
        />
        <div className="command-centre__body">
          <div className="main-grid">
            {/* The KPI tiles sit above the map rather than spanning the page,
                so the rail beside them runs the full height of the body —
                the live feed is the thing you read for minutes at a time and
                it was the thing being squeezed. */}
            <div className="map-column">
              <motion.div className="kpi-strip" variants={shellItemVariants}>
                {/* Unweighted and weighted are one figure seen two ways, so
                    they share a card. Both numbers are still shown in full. */}
                <KpiCard
                  accent="teal"
                  label="PIPELINE VALUE"
                  value={pipelineSummary ? formatCurrency(pipelineSummary.unweightedValue) : undefined}
                  secondary={
                    pipelineSummary
                      ? { label: "WEIGHTED", value: formatCurrency(pipelineSummary.weightedValue) }
                      : undefined
                  }
                  footnote={
                    pipelineSummary
                      ? pipelineSummary.unweightedDelta
                        ? `${formatCurrencyDelta(pipelineSummary.unweightedDelta.amount)} vs. upload on ${formatShortDate(pipelineSummary.unweightedDelta.previousAsOf)}`
                        : `${pipelineSummary.openDealCount} open deals as of ${formatShortDate(pipelineSummary.asOf)}`
                      : "Upload a Salesforce pipeline export to populate this card"
                  }
                />
                <LatestUpdateCard latestUpdate={latestUpdate} onUpdated={setLatestUpdate} />
              </motion.div>

              <motion.div className="map-panel" variants={shellItemVariants}>
                <div className="map-panel__header">
                  <span className="map-panel__title">OPERATIONAL MAP · BRAZIL</span>
                </div>
                <div className="map-panel__canvas">
                  <div ref={mapWrapRef} className="app-shell__map-live">
                    <CesiumGlobe
                      pins={visibleMapPins}
                      selectedAccountId={selectedAccountId}
                      onSelectAccount={handleSelectAccount}
                    />
                  </div>
                  <MapLegend
                    pins={mapPins}
                    hiddenClientTypes={hiddenClientTypes}
                    onToggleClientType={toggleClientType}
                  />
                </div>
              </motion.div>
            </div>

            <motion.div className="right-rail" variants={shellItemVariants}>
              <OpenDealsCard openDeals={openDeals} accountsById={accountsById} />
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
    </>
  );
}
