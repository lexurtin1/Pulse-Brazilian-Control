import { useEffect, useRef } from "react";
import type { RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Shared dialog behavior for AccountDossier and UploadFAB's sheet: focus
 * moves into the dialog on open, Tab/Shift+Tab wraps among its focusable
 * descendants instead of escaping to the page behind it, Escape closes it,
 * and focus returns to whatever triggered it once closed. Required because
 * both dialogs use aria-modal="true" — without a real focus trap that
 * attribute tells assistive tech the background is inert while sighted
 * keyboard users could still tab into it, which is worse than omitting it.
 */
export function useDialogA11y(containerRef: RefObject<HTMLElement>, isOpen: boolean, onClose: () => void): void {
  const previouslyFocused = useRef<HTMLElement | null>(null);
  // Callers typically pass an inline arrow function as onClose, which gets a
  // new identity every render. Reading it via ref (updated on every render,
  // outside the effect) keeps the effect's dependency array free of it, so
  // an unrelated parent re-render while the dialog is open can't retrigger
  // the focus-trap setup and steal focus mid-interaction.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const container = containerRef.current;
    if (!container) return;

    const getFocusable = () => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    (getFocusable()[0] ?? container).focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;

      const items = getFocusable();
      if (items.length === 0) return;

      const first = items[0]!;
      const last = items[items.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [isOpen, containerRef]);
}
