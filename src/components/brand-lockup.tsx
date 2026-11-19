import { appInfo } from "@/lib/app-info";

export function BrandLockup({ size = "default" }: { size?: "default" | "compact" | "splash" }) {
  const [firstWord, ...remainingWords] = appInfo.name.toLocaleUpperCase().split(" ");
  return (
    <span className={`brand-lockup brand-lockup--${size}`}>
      <span className="brand-symbol" aria-hidden="true">
        <svg viewBox="0 0 48 48" fill="none">
          <path d="M8 13h9c4 0 6 2 8 6l2 5h13" />
          <path d="M8 24h17" />
          <path d="M8 35h9c4 0 6-2 8-6l2-5" />
          <circle cx="39" cy="24" r="2.5" />
        </svg>
      </span>
      <span className="brand-wordmark">
        <span className="brand-wordmark-primary">{firstWord}</span>
        <span className="brand-wordmark-secondary">{remainingWords.join(" ")}</span>
      </span>
    </span>
  );
}
