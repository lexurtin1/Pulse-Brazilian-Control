import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Pencil, X } from "lucide-react";
import type { ExpansionUpdateDto, UpdateExpansionUpdateCommand } from "@pulse-brazil/application";
import { saveLatestUpdate } from "../../api/client";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { formatRelativeDay, formatShortDate } from "../../utils/formatNumbers";
import "./CommandCentre.css";
import "./LatestUpdateCard.css";

interface LatestUpdateCardProps {
  latestUpdate: ExpansionUpdateDto | null;
  onUpdated: (update: ExpansionUpdateDto) => void;
}

const TITLE_ID = "latest-update-title";

/** Turns the multi-line textareas the panel edits into the string arrays the API takes. */
function toLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
}

function pinned(update: ExpansionUpdateDto, field: string): boolean {
  return update.manuallyEditedFields.includes(field);
}

/** A short "you set this, Claude won't change it" marker — the only way to tell a pinned field from a generated one. */
function PinnedMark({ update, field }: { update: ExpansionUpdateDto; field: string }) {
  if (!pinned(update, field)) return null;
  return (
    <span className="latest-update__pinned" title="You set this by hand — uploading a document won't overwrite it">
      set by hand
    </span>
  );
}

export function LatestUpdateCard({ latestUpdate, onUpdated }: LatestUpdateCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function close() {
    setIsOpen(false);
    setIsEditing(false);
    setSaveError(null);
  }

  useDialogA11y(panelRef, isOpen, close);

  // The collapsed tile is a summary line, not the update: last contact and
  // the next meeting are what someone glancing at the strip actually wants,
  // and the rest is one click away.
  const footnote = latestUpdate
    ? [
        latestUpdate.lastContact ? `last contact ${formatRelativeDay(latestUpdate.lastContact.occurredAt)}` : null,
        latestUpdate.nextMeeting
          ? `next meeting ${formatShortDate(latestUpdate.nextMeeting.scheduledFor)}`
          : "no meeting scheduled",
      ]
        .filter(Boolean)
        .join(" · ")
    : "Upload a call note or meeting minutes to populate this card";

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!latestUpdate) return;

    const form = new FormData(event.currentTarget);
    const headline = String(form.get("headline") ?? "").trim();
    if (!headline) {
      setSaveError("The headline can't be empty.");
      return;
    }

    const scheduledFor = String(form.get("nextMeetingDate") ?? "").trim();
    const withWhom = String(form.get("nextMeetingWith") ?? "").trim();
    const purpose = String(form.get("nextMeetingPurpose") ?? "").trim();

    // A meeting needs a date and someone to meet. Clearing either is how you
    // say "there is no next meeting" — which is a real answer the card
    // records, and one a later document ingest will not overwrite.
    const patch: UpdateExpansionUpdateCommand = {
      headline,
      nextMeeting: scheduledFor && withWhom ? { scheduledFor: new Date(scheduledFor).toISOString(), withWhom, purpose } : null,
      awaitingInternal: toLines(String(form.get("awaitingInternal") ?? "")),
      nextActions: toLines(String(form.get("nextActions") ?? "")),
    };

    setIsSaving(true);
    setSaveError(null);
    try {
      onUpdated(await saveLatestUpdate(patch));
      setIsEditing(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Couldn't save your changes.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="kpi-card kpi-card--button"
        data-accent="blue"
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
      >
        <span className="kpi-card__label">LATEST UPDATE · BRAZIL</span>
        <span className="latest-update__headline" data-empty={!latestUpdate || undefined}>
          {latestUpdate?.headline ?? "Nothing recorded yet"}
        </span>
        <span className="kpi-card__footnote">{footnote}</span>
      </button>

      {isOpen && (
        <div className="latest-update-backdrop" onClick={close}>
          <div
            ref={panelRef}
            className="latest-update-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={TITLE_ID}
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="latest-update-panel__header">
              <div>
                <span className="rail-card__label">LATEST UPDATE · BRAZIL</span>
                <h2 id={TITLE_ID} className="latest-update-panel__title">
                  {latestUpdate?.headline ?? "Nothing recorded yet"}
                </h2>
              </div>
              <button type="button" className="latest-update-panel__close" aria-label="Close" onClick={close}>
                <X size={18} />
              </button>
            </div>

            {!latestUpdate && (
              <p className="rail-card__empty">
                Upload a call note, meeting minutes, or an email thread and Claude will draft this from it. You can correct
                anything it gets wrong, and what you correct stays put.
              </p>
            )}

            {latestUpdate && !isEditing && (
              <>
                <div className="latest-update-panel__body">
                  <section className="latest-update__section">
                    <h3 className="latest-update__section-title">
                      Last contact
                      <PinnedMark update={latestUpdate} field="lastContact" />
                    </h3>
                    {latestUpdate.lastContact ? (
                      <>
                        <p className="latest-update__meta">
                          {formatShortDate(latestUpdate.lastContact.occurredAt)} ·{" "}
                          {formatRelativeDay(latestUpdate.lastContact.occurredAt)}
                          {latestUpdate.lastContact.contactNames.length > 0 && (
                            <> · {latestUpdate.lastContact.contactNames.join(", ")}</>
                          )}
                        </p>
                        <p className="latest-update__prose">{latestUpdate.lastContact.discussed}</p>
                      </>
                    ) : (
                      <p className="latest-update__none">No contact recorded.</p>
                    )}
                  </section>

                  <section className="latest-update__section">
                    <h3 className="latest-update__section-title">
                      Next meeting
                      <PinnedMark update={latestUpdate} field="nextMeeting" />
                    </h3>
                    {latestUpdate.nextMeeting ? (
                      <>
                        <p className="latest-update__meta">
                          {formatShortDate(latestUpdate.nextMeeting.scheduledFor)} ·{" "}
                          {formatRelativeDay(latestUpdate.nextMeeting.scheduledFor)} · {latestUpdate.nextMeeting.withWhom}
                        </p>
                        {latestUpdate.nextMeeting.purpose && (
                          <p className="latest-update__prose">{latestUpdate.nextMeeting.purpose}</p>
                        )}
                      </>
                    ) : (
                      <p className="latest-update__none">Nothing scheduled.</p>
                    )}
                  </section>

                  <section className="latest-update__section">
                    <h3 className="latest-update__section-title">
                      Waiting on internally
                      <PinnedMark update={latestUpdate} field="awaitingInternal" />
                    </h3>
                    {latestUpdate.awaitingInternal.length > 0 ? (
                      <ul className="latest-update__list">
                        {latestUpdate.awaitingInternal.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="latest-update__none">Nothing outstanding.</p>
                    )}
                  </section>

                  <section className="latest-update__section">
                    <h3 className="latest-update__section-title">
                      Next actions
                      <PinnedMark update={latestUpdate} field="nextActions" />
                    </h3>
                    {latestUpdate.nextActions.length > 0 ? (
                      <ul className="latest-update__list">
                        {latestUpdate.nextActions.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="latest-update__none">None recorded.</p>
                    )}
                  </section>
                </div>

                <footer className="latest-update-panel__footer">
                  <span className="latest-update__provenance">
                    {latestUpdate.origin === "MachineDerived" ? "Drafted by Claude from " : "Recorded by hand · "}
                    {latestUpdate.sourceDocumentIds.length > 0 &&
                      `${latestUpdate.sourceDocumentIds.length} source document${
                        latestUpdate.sourceDocumentIds.length === 1 ? "" : "s"
                      } · `}
                    updated {formatRelativeDay(latestUpdate.asOf)}
                  </span>
                  <button type="button" className="feed-action-button" onClick={() => setIsEditing(true)}>
                    <Pencil size={14} strokeWidth={2} />
                    <span>Edit</span>
                  </button>
                </footer>
              </>
            )}

            {latestUpdate && isEditing && (
              <form className="latest-update-panel__body latest-update__form" onSubmit={handleSave}>
                <p className="latest-update__form-note">
                  Anything you change here is kept — the next document upload will refresh the rest, but won&rsquo;t
                  overwrite what you&rsquo;ve set.
                </p>

                <label className="latest-update__field">
                  <span>Headline</span>
                  <input name="headline" type="text" defaultValue={latestUpdate.headline} required />
                </label>

                <fieldset className="latest-update__fieldset">
                  <legend>Next meeting</legend>
                  <div className="latest-update__field-row">
                    <label className="latest-update__field">
                      <span>Date</span>
                      <input
                        name="nextMeetingDate"
                        type="date"
                        defaultValue={latestUpdate.nextMeeting?.scheduledFor.slice(0, 10) ?? ""}
                      />
                    </label>
                    <label className="latest-update__field">
                      <span>With</span>
                      <input name="nextMeetingWith" type="text" defaultValue={latestUpdate.nextMeeting?.withWhom ?? ""} />
                    </label>
                  </div>
                  <label className="latest-update__field">
                    <span>Purpose</span>
                    <input name="nextMeetingPurpose" type="text" defaultValue={latestUpdate.nextMeeting?.purpose ?? ""} />
                  </label>
                  <p className="latest-update__field-hint">Clear the date or the name to record that nothing is scheduled.</p>
                </fieldset>

                <label className="latest-update__field">
                  <span>Waiting on internally — one per line</span>
                  <textarea name="awaitingInternal" rows={3} defaultValue={latestUpdate.awaitingInternal.join("\n")} />
                </label>

                <label className="latest-update__field">
                  <span>Next actions — one per line</span>
                  <textarea name="nextActions" rows={3} defaultValue={latestUpdate.nextActions.join("\n")} />
                </label>

                {saveError && (
                  <p className="upload-sheet__error" role="alert">
                    {saveError}
                  </p>
                )}

                <div className="latest-update__form-actions">
                  <button
                    type="button"
                    className="feed-action-button"
                    onClick={() => {
                      setIsEditing(false);
                      setSaveError(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="upload-sheet__submit" disabled={isSaving}>
                    {isSaving ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
