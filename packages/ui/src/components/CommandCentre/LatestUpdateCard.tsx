import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Check, Pencil, X } from "lucide-react";
import type { ExpansionUpdateDto } from "@pulse-brazil/application";
import { saveLatestUpdate } from "../../api/client";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { formatRelativeDay, formatShortDate } from "../../utils/formatNumbers";
import { changedFieldsOnly } from "../../utils/latestUpdatePatch";
import "./CommandCentre.css";
import "./FeedActions.css";
import "./LatestUpdateCard.css";

interface LatestUpdateCardProps {
  latestUpdate: ExpansionUpdateDto | null;
  onUpdated: (update: ExpansionUpdateDto) => void;
}

const TITLE_ID = "latest-update-title";

/** How long the "Saved" tick stays up — long enough to read, short enough not to become a permanent badge. */
const SAVED_CONFIRMATION_MS = 4000;

/** Field ids, so a section's own "Edit" link can drop the cursor straight into the matching input. */
const FIELD_IDS = {
  headline: "latest-update-headline",
  lastContact: "latest-update-last-contact-date",
  nextMeeting: "latest-update-next-meeting-date",
  awaitingInternal: "latest-update-awaiting",
  nextActions: "latest-update-next-actions",
} as const;

type EditableField = keyof typeof FIELD_IDS;

/** Turns the multi-line textareas the panel edits into the string arrays the API takes. */
function toLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
}

/** The contact-names input is one comma-separated line, which is how people actually type a list of names. */
function toNames(value: string): string[] {
  return value
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

function pinned(update: ExpansionUpdateDto, field: string): boolean {
  return update.manuallyEditedFields.includes(field);
}

/**
 * A pinned field is one a person set by hand, and document ingest leaves it
 * alone forever after. That has to be visible *and* reversible from the same
 * spot — an invisible permanent pin is how this card went stale while every
 * upload reported success.
 */
function PinnedMark({
  update,
  field,
  onRelease,
  disabled,
}: {
  update: ExpansionUpdateDto;
  field: string;
  onRelease: (field: string) => void;
  disabled: boolean;
}) {
  if (!pinned(update, field)) return null;
  return (
    <button
      type="button"
      className="latest-update__pinned"
      disabled={disabled}
      onClick={() => onRelease(field)}
      title="You set this by hand, so uploads leave it alone. Click to let the next document update it again."
    >
      set by hand
      <span className="latest-update__pinned-release">Let uploads update this</span>
    </button>
  );
}

/**
 * One fact on the collapsed tile: what it is, when, and who. Renders even
 * when there is nothing to show — a tile that grew and shrank with its own
 * content would resize the whole KPI row every time a document landed.
 */
function TileFact({
  label,
  date,
  detail,
  accent,
}: {
  label: string;
  date?: string;
  detail?: string;
  accent: "blue" | "teal";
}) {
  return (
    <div className="latest-update-tile__fact" data-accent={accent} data-empty={!date || undefined}>
      <span className="latest-update-tile__fact-label">{label}</span>
      {date ? (
        <>
          <span className="latest-update-tile__fact-date">{formatShortDate(date)}</span>
          <span className="latest-update-tile__fact-detail">
            {formatRelativeDay(date)}
            {detail ? ` · ${detail}` : ""}
          </span>
        </>
      ) : (
        <span className="latest-update-tile__fact-date latest-update-tile__fact-date--none">None</span>
      )}
    </div>
  );
}

export function LatestUpdateCard({ latestUpdate, onUpdated }: LatestUpdateCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [focusField, setFocusField] = useState<EditableField | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function close() {
    setIsOpen(false);
    setIsEditing(false);
    setSaveError(null);
    setFocusField(null);
  }

  function openPanel(editing: boolean, field: EditableField | null = null) {
    setIsOpen(true);
    setIsEditing(editing);
    setSaveError(null);
    setFocusField(field);
  }

  function startEditing(field: EditableField | null = null) {
    setIsEditing(true);
    setSaveError(null);
    setFocusField(field);
  }

  useDialogA11y(panelRef, isOpen, close);

  // useDialogA11y parks focus on the panel's first focusable element when it
  // opens. If a particular section asked to be edited, move focus on to that
  // field — "Edit" next to Next meeting should land on the meeting date, not
  // back at the headline.
  useEffect(() => {
    if (!isEditing || !focusField) return;
    const input = document.getElementById(FIELD_IDS[focusField]);
    input?.focus();
    input?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [isEditing, focusField]);

  useEffect(() => {
    if (!justSaved) return;
    const timer = setTimeout(() => setJustSaved(false), SAVED_CONFIRMATION_MS);
    return () => clearTimeout(timer);
  }, [justSaved]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const headline = String(form.get("headline") ?? "").trim();
    if (!headline) {
      setSaveError("The headline can't be empty.");
      return;
    }

    const meetingDate = String(form.get("nextMeetingDate") ?? "").trim();
    const meetingWith = String(form.get("nextMeetingWith") ?? "").trim();
    const meetingPurpose = String(form.get("nextMeetingPurpose") ?? "").trim();

    const contactDate = String(form.get("lastContactDate") ?? "").trim();
    const contactNames = String(form.get("lastContactNames") ?? "").trim();
    const contactDiscussed = String(form.get("lastContactDiscussed") ?? "").trim();

    // Each composite needs the two parts that make it mean anything: a date,
    // and either someone to meet or something that was said. Clearing either
    // is how you record "there is none" — a real answer the card keeps, and
    // one a later document ingest will not overwrite.
    const submitted = {
      headline,
      lastContact:
        contactDate && contactDiscussed
          ? {
              occurredAt: new Date(contactDate).toISOString(),
              contactNames: toNames(contactNames),
              discussed: contactDiscussed,
            }
          : null,
      nextMeeting:
        meetingDate && meetingWith
          ? { scheduledFor: new Date(meetingDate).toISOString(), withWhom: meetingWith, purpose: meetingPurpose }
          : null,
      awaitingInternal: toLines(String(form.get("awaitingInternal") ?? "")),
      nextActions: toLines(String(form.get("nextActions") ?? "")),
    };

    // Only what moved. Naming an untouched field would pin it, and a pinned
    // field never refreshes from a document again.
    const patch = changedFieldsOnly(submitted, latestUpdate);
    if (Object.keys(patch).length === 0) {
      setIsEditing(false);
      setFocusField(null);
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    try {
      onUpdated(await saveLatestUpdate(patch));
      setIsEditing(false);
      setFocusField(null);
      setJustSaved(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Couldn't save your changes.");
    } finally {
      setIsSaving(false);
    }
  }

  /** Hands one field back to document ingest, so the next upload can refresh it. */
  async function releasePin(field: string) {
    setIsSaving(true);
    setSaveError(null);
    try {
      onUpdated(await saveLatestUpdate({ unpinFields: [field] }));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Couldn't release that field.");
    } finally {
      setIsSaving(false);
    }
  }

  /** The read view's per-section shortcut into the form. */
  function SectionEdit({ field }: { field: EditableField }) {
    return (
      <button type="button" className="latest-update__section-edit" onClick={() => startEditing(field)}>
        Edit
      </button>
    );
  }

  return (
    <>
      <div className="kpi-card latest-update-tile" data-accent="blue">
        <div className="latest-update-tile__top">
          <span className="kpi-card__label">LATEST UPDATE · BRAZIL</span>
          {latestUpdate && (
            <span className="latest-update-tile__stamp">updated {formatRelativeDay(latestUpdate.asOf)}</span>
          )}
        </div>

        {/* The headline button stretches over the whole tile via ::after, so
            a click anywhere on the card opens the panel — while the pencil
            stays a sibling rather than an invalid nested button. */}
        <button
          type="button"
          className="latest-update-tile__open"
          onClick={() => openPanel(false)}
          aria-haspopup="dialog"
        >
          <span className="latest-update__headline" data-empty={!latestUpdate || undefined}>
            {latestUpdate?.headline ?? "Nothing recorded yet"}
          </span>
        </button>

        {latestUpdate ? (
          <div className="latest-update-tile__facts">
            <TileFact
              label="LAST CONTACT"
              accent="blue"
              date={latestUpdate.lastContact?.occurredAt}
              detail={latestUpdate.lastContact?.contactNames.join(", ")}
            />
            <TileFact
              label="NEXT MEETING"
              accent="teal"
              date={latestUpdate.nextMeeting?.scheduledFor}
              detail={latestUpdate.nextMeeting?.withWhom}
            />
          </div>
        ) : (
          <span className="kpi-card__footnote">Upload a call note or meeting minutes to populate this card</span>
        )}

        {latestUpdate && latestUpdate.awaitingInternal.length > 0 && (
          <span className="latest-update-tile__waiting">
            {latestUpdate.awaitingInternal.length} waiting on internally
          </span>
        )}

        <button
          type="button"
          className="latest-update-tile__edit"
          aria-label="Edit the Brazil update"
          onClick={() => openPanel(true, "headline")}
        >
          <Pencil size={14} strokeWidth={2} />
        </button>
      </div>

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
                {latestUpdate && (
                  <PinnedMark update={latestUpdate} field="headline" onRelease={releasePin} disabled={isSaving} />
                )}
              </div>
              <div className="latest-update-panel__actions">
                {justSaved && (
                  <span className="latest-update__saved" role="status">
                    <Check size={13} strokeWidth={3} />
                    Saved
                  </span>
                )}
                {latestUpdate && !isEditing && (
                  <button type="button" className="feed-action-button" onClick={() => startEditing()}>
                    <Pencil size={14} strokeWidth={2} />
                    <span>Edit</span>
                  </button>
                )}
                <button type="button" className="latest-update-panel__close" aria-label="Close" onClick={close}>
                  <X size={18} />
                </button>
              </div>
            </div>

            {!latestUpdate && !isEditing && (
              <>
                <p className="rail-card__empty">
                  Upload a call note, meeting minutes, or an email thread and Claude will draft this from it. You can
                  correct anything it gets wrong, and what you correct stays put — or write the first version yourself.
                </p>
                <div className="latest-update__form-actions">
                  <button type="button" className="upload-sheet__submit" onClick={() => startEditing("headline")}>
                    Write it by hand
                  </button>
                </div>
              </>
            )}

            {latestUpdate && !isEditing && (
              <>
                <div className="latest-update-panel__body">
                  <section className="latest-update__section">
                    <h3 className="latest-update__section-title">
                      Last contact
                      <PinnedMark update={latestUpdate} field="lastContact" onRelease={releasePin} disabled={isSaving} />
                      <SectionEdit field="lastContact" />
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
                      <PinnedMark update={latestUpdate} field="nextMeeting" onRelease={releasePin} disabled={isSaving} />
                      <SectionEdit field="nextMeeting" />
                    </h3>
                    {latestUpdate.nextMeeting ? (
                      <>
                        <p className="latest-update__meta">
                          {formatShortDate(latestUpdate.nextMeeting.scheduledFor)} ·{" "}
                          {formatRelativeDay(latestUpdate.nextMeeting.scheduledFor)} ·{" "}
                          {latestUpdate.nextMeeting.withWhom}
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
                      <PinnedMark update={latestUpdate} field="awaitingInternal" onRelease={releasePin} disabled={isSaving} />
                      <SectionEdit field="awaitingInternal" />
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
                      <PinnedMark update={latestUpdate} field="nextActions" onRelease={releasePin} disabled={isSaving} />
                      <SectionEdit field="nextActions" />
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
                </footer>
              </>
            )}

            {isEditing && (
              <form className="latest-update-panel__body latest-update__form" onSubmit={handleSave}>
                <p className="latest-update__form-note">
                  Anything you change here is kept — the next document upload will refresh the rest, but won&rsquo;t
                  overwrite what you&rsquo;ve set.
                </p>

                <label className="latest-update__field" htmlFor={FIELD_IDS.headline}>
                  <span>Headline</span>
                  <input
                    id={FIELD_IDS.headline}
                    name="headline"
                    type="text"
                    defaultValue={latestUpdate?.headline ?? ""}
                    required
                  />
                </label>

                <fieldset className="latest-update__fieldset">
                  <legend>Last contact</legend>
                  <div className="latest-update__field-row">
                    <label className="latest-update__field" htmlFor={FIELD_IDS.lastContact}>
                      <span>Date</span>
                      <input
                        id={FIELD_IDS.lastContact}
                        name="lastContactDate"
                        type="date"
                        defaultValue={latestUpdate?.lastContact?.occurredAt.slice(0, 10) ?? ""}
                      />
                    </label>
                    <label className="latest-update__field">
                      <span>Who &mdash; comma separated</span>
                      <input
                        name="lastContactNames"
                        type="text"
                        defaultValue={latestUpdate?.lastContact?.contactNames.join(", ") ?? ""}
                      />
                    </label>
                  </div>
                  <label className="latest-update__field">
                    <span>What was discussed</span>
                    <textarea
                      name="lastContactDiscussed"
                      rows={3}
                      defaultValue={latestUpdate?.lastContact?.discussed ?? ""}
                    />
                  </label>
                  <p className="latest-update__field-hint">
                    Clear the date or the discussion to record that there was no contact.
                  </p>
                </fieldset>

                <fieldset className="latest-update__fieldset">
                  <legend>Next meeting</legend>
                  <div className="latest-update__field-row">
                    <label className="latest-update__field" htmlFor={FIELD_IDS.nextMeeting}>
                      <span>Date</span>
                      <input
                        id={FIELD_IDS.nextMeeting}
                        name="nextMeetingDate"
                        type="date"
                        defaultValue={latestUpdate?.nextMeeting?.scheduledFor.slice(0, 10) ?? ""}
                      />
                    </label>
                    <label className="latest-update__field">
                      <span>With</span>
                      <input
                        name="nextMeetingWith"
                        type="text"
                        defaultValue={latestUpdate?.nextMeeting?.withWhom ?? ""}
                      />
                    </label>
                  </div>
                  <label className="latest-update__field">
                    <span>Purpose</span>
                    <input name="nextMeetingPurpose" type="text" defaultValue={latestUpdate?.nextMeeting?.purpose ?? ""} />
                  </label>
                  <p className="latest-update__field-hint">
                    Clear the date or the name to record that nothing is scheduled.
                  </p>
                </fieldset>

                <label className="latest-update__field" htmlFor={FIELD_IDS.awaitingInternal}>
                  <span>Waiting on internally &mdash; one per line</span>
                  <textarea
                    id={FIELD_IDS.awaitingInternal}
                    name="awaitingInternal"
                    rows={3}
                    defaultValue={latestUpdate?.awaitingInternal.join("\n") ?? ""}
                  />
                </label>

                <label className="latest-update__field" htmlFor={FIELD_IDS.nextActions}>
                  <span>Next actions &mdash; one per line</span>
                  <textarea
                    id={FIELD_IDS.nextActions}
                    name="nextActions"
                    rows={3}
                    defaultValue={latestUpdate?.nextActions.join("\n") ?? ""}
                  />
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
                      // With nothing saved yet there is no read view to fall
                      // back to, so Cancel closes the panel outright.
                      if (!latestUpdate) {
                        close();
                        return;
                      }
                      setIsEditing(false);
                      setFocusField(null);
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
