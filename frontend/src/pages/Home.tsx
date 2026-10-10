import type { MouseEvent } from "react";
import { Link } from "react-router-dom";
import HeroScene from "../components/HeroScene";
import Icon from "../components/Icon";
import { useApi } from "../hooks/useApi";

interface Summary {
  kpis: { incidents_24h: number; critical_24h: number; cameras_online: number; cameras_total: number; avg_response_s: number | null; network_safety_score: number };
}

/* small illustrations for the feature cards */
function ArtImage() {
  return (
    <svg viewBox="0 0 320 140" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="ai-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b1a33" />
          <stop offset="1" stopColor="#123049" />
        </linearGradient>
      </defs>
      <rect x="60" y="14" width="200" height="112" rx="10" fill="url(#ai-sky)" stroke="rgba(148,163,184,.25)" />
      <path d="M60 92 L120 64 L160 82 L210 52 L260 80 V116 a10 10 0 0 1 -10 10 H70 a10 10 0 0 1 -10 -10Z" fill="#0a1625" />
      <path d="M156 126 L162 70 M176 126 L166 70" stroke="#cfefff" strokeWidth="2" opacity=".8" />
      <rect x="182" y="62" width="44" height="34" fill="none" stroke="#ef4444" strokeWidth="2" rx="2" />
      <rect x="182" y="50" width="56" height="11" rx="3" fill="#ef4444" />
      <text x="186" y="58.5" fontSize="7.5" fontFamily="JetBrains Mono" fill="#fff" fontWeight="700">RISK 91</text>
      <rect x="60" y="14" width="200" height="3" fill="#2fd9f4" opacity=".9">
        <animate attributeName="y" values="16;122;16" dur="3s" repeatCount="indefinite" />
      </rect>
    </svg>
  );
}

function ArtLive() {
  return (
    <svg viewBox="0 0 320 140" preserveAspectRatio="xMidYMid slice">
      <rect width="320" height="140" fill="#060b14" />
      <polygon points="156,30 164,30 230,140 90,140" fill="#ef4444" opacity=".14" stroke="#ef4444" strokeOpacity=".5" />
      <path d="M158 30 L128 140 M162 30 L192 140" stroke="#cfefff" strokeWidth="2" />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const t = Math.pow((i + 1) / 6, 1.8);
        const y = 30 + t * 110;
        const hw = 4 + t * 40;
        return <rect key={i} x={160 - hw} y={y - 2 - t * 3} width={hw * 2} height={2 + t * 4} fill="#3a2e24" />;
      })}
      <g>
        <rect x="196" y="62" width="34" height="26" fill="none" stroke="#eab308" strokeWidth="2" />
        <animateTransform attributeName="transform" type="translate" values="40 0; -14 6; 40 0" dur="4s" repeatCount="indefinite" />
      </g>
      <circle cx="22" cy="20" r="4" fill="#ef4444">
        <animate attributeName="opacity" values="1;.2;1" dur="1.2s" repeatCount="indefinite" />
      </circle>
      <text x="32" y="24" fontSize="10" fontFamily="JetBrains Mono" fill="#cbd5e1">
        REC · CAM-02
      </text>
    </svg>
  );
}

function ArtIncidents() {
  const rows = [
    ["#ef4444", 0.92],
    ["#f97316", 0.7],
    ["#eab308", 0.55],
    ["#22c55e", 0.3],
  ] as const;
  return (
    <svg viewBox="0 0 320 140" preserveAspectRatio="xMidYMid slice">
      {rows.map(([c, w], i) => (
        <g key={i} transform={`translate(48 ${20 + i * 27})`}>
          <rect width="224" height="20" rx="6" fill="rgba(148,163,184,.07)" />
          <circle cx="12" cy="10" r="4" fill={c} />
          <rect x="24" y="7" width="70" height="6" rx="3" fill="rgba(148,163,184,.3)" />
          <rect x="110" y="7" width={100 * w} height="6" rx="3" fill={c}>
            <animate attributeName="width" values={`0;${100 * w}`} dur="1.2s" begin={`${i * 0.15}s`} fill="freeze" />
          </rect>
        </g>
      ))}
    </svg>
  );
}

const FEATURES = [
  { to: "/image", title: "Check an image", text: "Drop in a track photo and get detected hazards, danger zones and an explainable 0-100 risk score.", art: <ArtImage /> },
  { to: "/live", title: "Live monitoring", text: "Watch simulated trackside cameras or analyse your own video with YOLOv8, tracking and early warning.", art: <ArtLive /> },
  { to: "/incidents", title: "Incidents", text: "Every hazard the system caught - evidence snapshot, risk breakdown, alert trail and PDF reports.", art: <ArtIncidents /> },
];

function spotlight(e: MouseEvent<HTMLAnchorElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
}

export default function Home() {
  const { data } = useApi<Summary>("/dashboard/summary", undefined, 15000);
  const k = data?.kpis;
  const stats = [
    { k: "Cameras online", v: k ? `${k.cameras_online}/${k.cameras_total}` : "-" },
    { k: "Incidents · 24h", v: k ? k.incidents_24h : "-" },
    { k: "Critical · 24h", v: k ? k.critical_24h : "-", c: "#ff7a7a" },
    { k: "Network safety", v: k ? Math.round(k.network_safety_score) : "-", c: "#7ef0a6" },
  ];

  return (
    <>
      <section className="hero">
        <div className="hero-card">
          <HeroScene />
          <div className="hero-copy">
            <span className="badge-live">
              <span className="live-dot" /> AI ENGINE ONLINE · WESTERN GHATS CORRIDOR
            </span>
            <h1>
              See the risk.
              <br />
              <span className="grad">Protect the track.</span>
            </h1>
            <p>AI that watches railway lines through forests and farmland - spotting elephants, cattle, fallen trees and rockfall, and warning you before they reach the rails.</p>
            <div className="cta">
              <Link to="/image" className="btn primary">
                <Icon name="image" /> Check an image
              </Link>
              <Link to="/live" className="btn">
                <Icon name="play" /> Watch live
              </Link>
            </div>
          </div>
        </div>
        <div className="stats">
          {stats.map((s) => (
            <div className="stat" key={s.k}>
              <div className="k">{s.k}</div>
              <div className="v" style={{ color: s.c }}>
                {s.v}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="features">
        {FEATURES.map((f) => (
          <Link key={f.to} to={f.to} className="feature" onMouseMove={spotlight}>
            <div className="art">{f.art}</div>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
            <span className="go">
              Open <Icon name="arrow" />
            </span>
          </Link>
        ))}
      </section>
    </>
  );
}
