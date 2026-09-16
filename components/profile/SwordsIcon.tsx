// Font Awesome's free set has no crossed-swords icon (only the ornate
// "khanda"), so this stat uses a small hand-drawn one instead.
export default function SwordsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="stat-icon-swords" fill="currentColor" aria-hidden="true">
      <g transform="rotate(45 12 12)">
        <path d="M12 0 L15 5 L13.5 16 L10.5 16 L9 5 Z" />
        <rect x="6" y="15" width="12" height="3" rx="1" />
        <rect x="10" y="18" width="4" height="5" rx="1" />
        <circle cx="12" cy="23.5" r="2" />
      </g>
      <g transform="rotate(-45 12 12)">
        <path d="M12 0 L15 5 L13.5 16 L10.5 16 L9 5 Z" />
        <rect x="6" y="15" width="12" height="3" rx="1" />
        <rect x="10" y="18" width="4" height="5" rx="1" />
        <circle cx="12" cy="23.5" r="2" />
      </g>
    </svg>
  );
}
