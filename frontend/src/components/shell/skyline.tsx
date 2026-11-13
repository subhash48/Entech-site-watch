/** Decorative construction skyline (cranes and buildings) for the bottom of the sidebar. */
export function Skyline({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 200" preserveAspectRatio="xMidYMax slice" aria-hidden className={className}>
      <defs>
        <linearGradient id="sky-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b6fd8" stopOpacity="0" />
          <stop offset="1" stopColor="#3b6fd8" stopOpacity="0.32" />
        </linearGradient>
      </defs>
      <g fill="url(#sky-fade)" stroke="#6f95e6" strokeOpacity="0.32" strokeWidth="1">
        {/* Buildings */}
        <rect x="6" y="128" width="34" height="72" />
        <rect x="44" y="104" width="30" height="96" />
        <rect x="150" y="116" width="36" height="84" />
        <rect x="192" y="138" width="42" height="62" />
        <rect x="96" y="150" width="40" height="50" />
      </g>
      <g stroke="#6f95e6" strokeOpacity="0.3" strokeWidth="1" fill="none">
        {/* Floor lines / scaffolding */}
        {[118, 132, 146, 160, 174, 188].map((y) => <line key={`a${y}`} x1="44" y1={y} x2="74" y2={y} />)}
        {[128, 142, 156, 170, 184].map((y) => <line key={`b${y}`} x1="150" y1={y} x2="186" y2={y} />)}
        {[60, 52].map((x) => <line key={`c${x}`} x1={x} y1="104" x2={x} y2="200" />)}
        {/* Tower crane, left */}
        <path d="M84 200 V36 M90 200 V36 M84 36 H90" />
        {Array.from({ length: 16 }, (_, i) => 200 - i * 10).map((y) => <path key={`d${y}`} d={`M84 ${y} L90 ${y - 10}`} />)}
        <path d="M30 40 H160 M30 40 L87 22 L160 40 M87 22 V36" />
        <path d="M144 40 V70 M140 70 h8" />
        {/* Tower crane, right */}
        <path d="M206 200 V72 M211 200 V72" />
        {Array.from({ length: 12 }, (_, i) => 200 - i * 10).map((y) => <path key={`e${y}`} d={`M206 ${y} L211 ${y - 10}`} />)}
        <path d="M170 76 H240 M170 76 L208 62 L240 76 M208 62 V72" />
        <path d="M182 76 V98 M178 98 h8" />
      </g>
    </svg>
  );
}
