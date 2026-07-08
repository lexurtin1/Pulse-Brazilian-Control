import "./PulseLogo.css";

export function PulseLogo() {
  return (
    <div className="pulse-logo" aria-label="Pulse Brazil">
      <svg
        width="28"
        height="28"
        viewBox="0 0 28 28"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle cx="14" cy="14" r="10.5" stroke="currentColor" strokeWidth="1.25" />
        <path
          d="M6 14h3.2l1.6-4.5 2.4 9 1.8-6.5 1.2 2h5.8"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="pulse-logo__wordmark">PULSE</span>
    </div>
  );
}
