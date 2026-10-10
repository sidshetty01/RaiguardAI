import type { ReactNode } from "react";
import type { Factor, RiskLevel } from "../api/types";
import { RISK_HEX, titleCase } from "../lib/format";

export function Pill({ level, score }: { level: string; score?: number }) {
  const c = RISK_HEX[level as RiskLevel] ?? "#94a3b8";
  return (
    <span className={`pill ${level}`} style={{ color: c, borderColor: `${c}55`, background: `${c}1a` }}>
      <span className="dot" />
      {level}
      {score !== undefined && <span className="mono">{Math.round(score)}</span>}
    </span>
  );
}

export function Status({ value }: { value: string }) {
  return <span className={`status ${value}`}>{titleCase(value)}</span>;
}

export function PageHead({ eyebrow, title, sub, actions }: { eyebrow: string; title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

/** Semicircular risk gauge (0-100) coloured by risk level. */
export function Gauge({ score, level, size = 150, label = "RISK" }: { score: number; level: RiskLevel; size?: number; label?: string }) {
  const c = RISK_HEX[level];
  const r = 60;
  const len = Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const ang = Math.PI * (1 - pct);
  const nx = 75 + r * Math.cos(ang);
  const ny = 80 - r * Math.sin(ang);
  return (
    <svg className="gauge" width={size} height={size * 0.68} viewBox="0 0 150 102" aria-label={`Risk ${Math.round(score)} of 100`}>
      <defs>
        <linearGradient id={`g-${level}`} x1="0" x2="1">
          <stop offset="0" stopColor={RISK_HEX.SAFE} />
          <stop offset="0.5" stopColor={RISK_HEX.MEDIUM} />
          <stop offset="1" stopColor={RISK_HEX.CRITICAL} />
        </linearGradient>
        <filter id="gglow">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <path d="M15 80 A60 60 0 0 1 135 80" fill="none" stroke="rgba(148,163,184,0.14)" strokeWidth="11" strokeLinecap="round" />
      <path d="M15 80 A60 60 0 0 1 135 80" fill="none" stroke={`url(#g-${level})`} strokeWidth="11" strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - pct)} style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(.2,.8,.2,1)" }} />
      <circle cx={nx} cy={ny} r="7" fill={c} filter="url(#gglow)" opacity="0.8" />
      <circle cx={nx} cy={ny} r="4.5" fill="#fff" />
      <text x="75" y="74" textAnchor="middle" fontSize="30" fontWeight="800" fill="#fff">
        {Math.round(score)}
      </text>
      <text x="75" y="96" textAnchor="middle" fontSize="9" letterSpacing="2.5" fill="#8b98ad">
        {label}
      </text>
    </svg>
  );
}

const FACTOR_COLORS: Record<string, string> = {
  "Track Proximity": "#ef4444",
  "Hazard Severity": "#f97316",
  "Motion Vector": "#8b7cff",
  "Temporal Persistence": "#3b82f6",
  "Confidence Rating": "#2fd9f4",
  "Benign Class Suppression": "#64748b",
};

/** Explainable-risk breakdown: a stacked contribution bar plus one animated bar per factor. */
export function FactorBars({ factors }: { factors: Factor[] }) {
  const positive = factors.filter((f) => f.points > 0);
  return (
    <div>
      <div className="stack">
        {positive.map((f, i) => (
          <div key={f.factor} title={`${f.factor} +${f.points}`} style={{ width: `${f.points}%`, background: FACTOR_COLORS[f.factor] ?? "#94a3b8", animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
      <div className="factors">
        {factors.map((f, i) => {
          const c = FACTOR_COLORS[f.factor] ?? "#94a3b8";
          return (
            <div className="factor" key={f.factor}>
              <div className="top">
                <span style={{ width: 9, height: 9, borderRadius: 3, background: c, alignSelf: "center" }} />
                <span className="name">{f.factor}</span>
                <span className="pts">
                  {f.points >= 0 ? "+" : ""}
                  {f.points.toFixed(1)}
                  {f.max_points ? <span className="max"> / {f.max_points}</span> : null}
                </span>
              </div>
              {f.max_points > 0 && (
                <div className="track">
                  <div className="fill" style={{ width: `${Math.max(0, (f.points / f.max_points) * 100)}%`, background: c, color: c, animationDelay: `${i * 90}ms` }} />
                </div>
              )}
              <div className="why">{f.description}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** HUD frame with corner brackets and scanlines around a video/canvas feed. */
export function Hud({ children, alarm, scanning, tags }: { children: ReactNode; alarm?: boolean; scanning?: boolean; tags?: ReactNode }) {
  return (
    <div className={`hud ${alarm ? "alarm" : ""}`}>
      {children}
      <div className="scanlines" />
      {scanning && <div className="scan-sweep" />}
      <span className="corner tl" />
      <span className="corner tr" />
      <span className="corner bl" />
      <span className="corner br" />
      {tags}
    </div>
  );
}

export function Empty({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <div>{children}</div>
    </div>
  );
}
