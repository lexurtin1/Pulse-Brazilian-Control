import { useTheme } from "../../hooks/useTheme";
import "./PulseLogo.css";

interface PulseLogoProps {
  /** Renders flowing inline in a header instead of as a fixed floating badge. */
  inline?: boolean;
}

export function PulseLogo({ inline = false }: PulseLogoProps) {
  const { theme } = useTheme();
  const src = theme === "dark" ? "/logos/calastone-wordmark-white.png" : "/logos/calastone-wordmark-black.png";

  return (
    <div className="pulse-logo" data-inline={inline || undefined}>
      <img className="pulse-logo__mark" src={src} alt="Calastone" />
    </div>
  );
}
