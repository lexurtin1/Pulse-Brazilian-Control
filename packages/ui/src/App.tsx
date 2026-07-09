import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { AccountMapPinDto, AccountSummaryDto, SignalDto } from "@pulse-brazil/application";
import { SignalFeed } from "./components/SignalFeed/SignalFeed";
import { BrazilMap } from "./components/BrazilMap/BrazilMap";
import { MapLegend } from "./components/MapLegend/MapLegend";
import { PulseLogo } from "./components/PulseLogo/PulseLogo";
import { UploadFAB } from "./components/UploadFAB/UploadFAB";
import { AccountDossier } from "./components/AccountDossier/AccountDossier";
import { EntryAnimation } from "./components/EntryAnimation/EntryAnimation";
import { fetchAccountMapPins, fetchAccounts, fetchRecentSignals } from "./api/client";
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
  const [status, setStatus] = useState<LoadState>("loading");
  const [introDone, setIntroDone] = useState(() => sessionStorage.getItem(INTRO_SESSION_KEY) === "1");
  const mapWrapRef = useRef<HTMLDivElement>(null);

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
    return <div className="app-shell app-shell--status">Loading Pulse Brazil…</div>;
  }

  if (status === "error") {
    return (
      <div className="app-shell app-shell--status">Couldn't load data. Check the API is running and try again.</div>
    );
  }

  return (
    <>
      <motion.div
        className="app-shell"
        variants={shellVariants}
        initial={showIntro ? "hidden" : false}
        animate={showIntro ? "hidden" : "visible"}
      >
        <motion.div className="app-shell__left" variants={shellItemVariants}>
          <SignalFeed
            signals={signals}
            accountsById={accountsById}
            selectedAccountId={selectedAccountId}
            onSelectAccount={handleSelectAccount}
          />
        </motion.div>
        <div className="app-shell__right">
          <div className="app-shell__map">
            <div ref={mapWrapRef} className="app-shell__map-live">
              <BrazilMap
                pins={mapPins}
                selectedAccountId={selectedAccountId}
                onSelectAccount={handleSelectAccount}
              />
            </div>
            <motion.div variants={shellItemVariants}>
              <MapLegend pins={mapPins} />
            </motion.div>
          </div>
        </div>
        <motion.div variants={shellItemVariants}>
          <PulseLogo />
        </motion.div>
        <motion.div variants={shellItemVariants}>
          <UploadFAB accountsForLinking={accounts} />
        </motion.div>
      </motion.div>
      {showIntro && <EntryAnimation mapRef={mapWrapRef} onComplete={() => setIntroDone(true)} />}
      <AccountDossier accountId={dossierAccountId} onClose={() => setDossierAccountId(null)} />
    </>
  );
}
