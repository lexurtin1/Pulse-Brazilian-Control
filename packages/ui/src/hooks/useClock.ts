import { useEffect, useState } from "react";

function format(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

/** Real client-side BRT/UTC clocks — no backend involved. */
export function useClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return {
    brt: format(now, "America/Sao_Paulo"),
    utc: format(now, "UTC"),
  };
}
