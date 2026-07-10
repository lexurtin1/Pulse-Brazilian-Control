import { useRef } from "react";
import { X } from "lucide-react";
import type { LocationRecordMapPinDto } from "@pulse-brazil/application";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { formatEnumLabel } from "../../utils/formatEnumLabel";
import "./LocationPinDetail.css";

interface LocationPinDetailProps {
  pin: LocationRecordMapPinDto | null;
  onClose: () => void;
  onSelectAccount?: (accountId: string) => void;
}

const TITLE_ID = "location-pin-detail-title";

/** Presentational only — every field it shows was already fetched as part of the map-pins list, no separate request needed. */
export function LocationPinDetail({ pin, onClose, onSelectAccount }: LocationPinDetailProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useDialogA11y(containerRef, pin != null, onClose);

  if (!pin) return null;

  return (
    <div className="location-pin-detail-backdrop" onClick={onClose}>
      <div
        ref={containerRef}
        className="location-pin-detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="location-pin-detail__close" aria-label="Close" onClick={onClose}>
          <X size={18} />
        </button>

        <p className="location-pin-detail__eyebrow">{formatEnumLabel(pin.kind)}</p>
        <h2 id={TITLE_ID} className="location-pin-detail__title">
          {pin.label}
        </h2>
        <div className="location-pin-detail__meta">
          <span className="location-pin-detail__chip">{formatEnumLabel(pin.verificationState)}</span>
          <span className="location-pin-detail__chip" data-review={pin.reviewStatus}>
            {formatEnumLabel(pin.reviewStatus)}
          </span>
        </div>

        <div className="location-pin-detail__section">
          <h3>Coordinate</h3>
          <p>
            {pin.coordinate.latitude.toFixed(5)}, {pin.coordinate.longitude.toFixed(5)}
          </p>
        </div>

        {pin.eventDate && (
          <div className="location-pin-detail__section">
            <h3>Event date</h3>
            <p>{new Date(pin.eventDate).toLocaleDateString()}</p>
          </div>
        )}

        <div className="location-pin-detail__section">
          <h3>Linked account</h3>
          {pin.linkedAccountId ? (
            <>
              <p>{pin.linkedAccountName ?? pin.linkedAccountId}</p>
              <button
                type="button"
                className="location-pin-detail__link-account"
                onClick={() => onSelectAccount?.(pin.linkedAccountId!)}
              >
                Open account
              </button>
            </>
          ) : (
            <p>None on file.</p>
          )}
        </div>
      </div>
    </div>
  );
}
