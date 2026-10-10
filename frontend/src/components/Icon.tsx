const PATHS: Record<string, string> = {
  image: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm0 11 5-5 4 4 3-3 4 4M15.5 9.5h.01",
  live: "M15 10l5-3v10l-5-3M3 7h12v10H3z",
  shield: "M12 3 4 6v6c0 5 3.4 8.4 8 9.5 4.6-1.1 8-4.5 8-9.5V6l-8-3Zm-1 12-3-3m3 3 5-6",
  bell: "M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8m4.3 12a2 2 0 0 0 3.4 0",
  doc: "M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5Zm0 0v5h5M9 13h6M9 17h6",
  upload: "M12 16V4m0 0-5 5m5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  back: "M19 12H5m6-6-6 6 6 6",
  play: "M7 4v16l13-8L7 4Z",
  check: "M5 12l5 5L20 7",
  x: "M6 6l12 12M18 6 6 18",
  download: "M12 4v12m0 0-5-5m5 5 5-5M4 20h16",
  radar: "M12 12 19 5M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5",
  brain: "M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a3 3 0 0 0-3-1Zm6 0a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1",
  pin: "M12 21s-7-6.3-7-12a7 7 0 0 1 14 0c0 5.7-7 12-7 12Zm0-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  zap: "M13 2 4 14h7l-1 8 9-12h-7l1-8Z",
  alert: "M12 9v4m0 4h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  clock: "M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  cam: "M3 8h4l2-3h6l2 3h4v11H3V8Zm9 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  layers: "M12 3 2 8l10 5 10-5-10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5",
};

export default function Icon({ name, className, style }: { name: keyof typeof PATHS | string; className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
      <path d={PATHS[name] ?? PATHS.shield} />
    </svg>
  );
}

/** RailGuard mark: a shield with converging rails. */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <defs>
        <linearGradient id="lg-shield" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5ce6fa" />
          <stop offset="1" stopColor="#7b6bff" />
        </linearGradient>
      </defs>
      <path d="M20 2 5 8v10c0 9.6 6.4 16.4 15 19 8.6-2.6 15-9.4 15-19V8L20 2Z" fill="url(#lg-shield)" />
      <path d="M20 2 5 8v10c0 9.6 6.4 16.4 15 19" fill="#fff" opacity="0.12" />
      <path d="M17.5 11 14 30M22.5 11 26 30M15 25h10M15.8 20h8.4M16.6 15.5h6.8" stroke="#06111c" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
