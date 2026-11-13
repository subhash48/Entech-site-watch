/** SiteWatch AI mark: rising signal bars. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <defs>
        <linearGradient id="logo-bars" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#2b6ef2" />
          <stop offset="1" stopColor="#7fb2ff" />
        </linearGradient>
      </defs>
      <g fill="url(#logo-bars)">
        <rect x="3" y="17" width="5" height="12" rx="1.2" />
        <rect x="10" y="11" width="5" height="18" rx="1.2" />
        <rect x="17" y="5" width="5" height="24" rx="1.2" />
        <rect x="24" y="13" width="5" height="16" rx="1.2" />
      </g>
    </svg>
  );
}
