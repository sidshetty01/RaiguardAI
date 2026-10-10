/** Animated night-time railway scene for the home hero (pure SVG + SMIL, no assets). */

const VPX = 1010; // vanishing point
const VPY = 360;
const BOTTOM = 640;

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// lateral offset (in "metres") at a given row -> x
function px(xm: number, y: number) {
  const t = (y - VPY) / (BOTTOM - VPY);
  return VPX + xm * t * 150;
}

function Elephant({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s}) translate(-60 -90)`}>
      <ellipse cx="60" cy="92" rx="52" ry="6" fill="#000" opacity="0.45" />
      <g fill="#0d1524" stroke="rgba(120,200,255,0.35)" strokeWidth="1.2">
        <rect x="38" y="56" width="13" height="34" rx="5" />
        <rect x="56" y="58" width="12" height="32" rx="5" />
        <rect x="84" y="56" width="13" height="34" rx="5" />
        <rect x="100" y="58" width="12" height="32" rx="5" />
        <ellipse cx="74" cy="44" rx="42" ry="29" />
        <path d="M112 38 q10 12 5 28" fill="none" strokeWidth="2.5" />
        <circle cx="32" cy="36" r="21" />
        <path d="M17 38 C6 50 6 66 11 86 L19 86 C15 68 16 56 26 46 Z" />
        <ellipse cx="45" cy="38" rx="13" ry="18" fill="#122036" />
      </g>
      <path d="M22 54 q-7 7 -2 13" stroke="#e8dcc0" strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="26" cy="31" r="1.8" fill="#9fe8ff" />
    </g>
  );
}

function Cow({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s}) translate(-40 -50)`} fill="#0d1524" stroke="rgba(120,200,255,0.3)" strokeWidth="1.5">
      <rect x="18" y="34" width="6" height="16" rx="2" />
      <rect x="52" y="34" width="6" height="16" rx="2" />
      <rect x="14" y="16" width="48" height="22" rx="10" />
      <path d="M62 20 l14 -4 l2 10 l-12 4z" />
    </g>
  );
}

function DetBox({ x, y, w, h, color, label, sub }: { x: number; y: number; w: number; h: number; color: string; label: string; sub: string }) {
  const c = Math.min(16, w / 4);
  const corners = [
    `M${x} ${y + c} V${y} H${x + c}`,
    `M${x + w - c} ${y} H${x + w} V${y + c}`,
    `M${x} ${y + h - c} V${y + h} H${x + c}`,
    `M${x + w - c} ${y + h} H${x + w} V${y + h - c}`,
  ];
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={color} opacity="0.06" />
      <rect x={x} y={y} width={w} height={h} fill="none" stroke={color} strokeWidth="1.2" opacity="0.55" strokeDasharray="4 4" />
      {corners.map((d) => (
        <path key={d} d={d} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round">
          <animate attributeName="opacity" values="1;0.35;1" dur="1.6s" repeatCount="indefinite" />
        </path>
      ))}
      <g transform={`translate(${x} ${y - 38})`}>
        <rect width={Math.max(w, 170)} height="32" rx="7" fill="#05080f" opacity="0.88" stroke={color} strokeOpacity="0.5" />
        <rect width="4" height="32" rx="2" fill={color} />
        <text x="12" y="13" fontFamily="JetBrains Mono, monospace" fontSize="10.5" fontWeight="700" fill="#fff" letterSpacing="0.6">
          {label}
        </text>
        <text x="12" y="26" fontFamily="JetBrains Mono, monospace" fontSize="9.5" fill={color} letterSpacing="0.4">
          {sub}
        </text>
      </g>
    </g>
  );
}

export default function HeroScene() {
  const r = rng(7);
  const stars = Array.from({ length: 90 }, () => ({ x: r() * 1440, y: r() * 300, s: r() * 1.4 + 0.3, d: 2 + r() * 4 }));
  const trees: { x: number; y: number; h: number }[] = [];
  for (let i = 0; i < 70; i++) {
    const side = i % 2 ? 1 : -1;
    const y = VPY + 4 + Math.pow(r(), 2.2) * 110;
    // always outside the 9 m warning buffer, so trees never land on the line
    const x = px(side * (11 + r() * 45), y);
    trees.push({ x, y, h: 14 + ((y - VPY) / 110) * 90 * (0.6 + r() * 0.6) });
  }
  trees.sort((a, b) => a.y - b.y);
  const sleepers = Array.from({ length: 26 }, (_, i) => {
    const t = Math.pow((i + 1) / 26, 1.9);
    const y = VPY + t * (BOTTOM - VPY);
    return { y, x1: px(-1.25, y), x2: px(1.25, y), h: 1 + t * 9 };
  });
  const ridge = (base: number, amp: number, f: number, ph: number) => {
    let d = `M0 ${VPY + 2}`;
    for (let x = 0; x <= 1440; x += 20) d += ` L${x} ${(VPY - base - amp * (0.6 * Math.sin(x * f + ph) + 0.4 * Math.sin(x * f * 2.3 + ph * 2))).toFixed(1)}`;
    return d + ` L1440 ${VPY + 2} Z`;
  };

  return (
    <svg className="scene" viewBox="0 0 1440 640" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#03050d" />
          <stop offset="0.45" stopColor="#081428" />
          <stop offset="0.56" stopColor="#123049" />
        </linearGradient>
        <radialGradient id="horizon" cx={VPX / 1440} cy={VPY / 640} r="0.55">
          <stop offset="0" stopColor="#2fd9f4" stopOpacity="0.28" />
          <stop offset="0.4" stopColor="#3b5bff" stopOpacity="0.1" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="headlight">
          <stop offset="0" stopColor="#fff6d8" stopOpacity="1" />
          <stop offset="0.25" stopColor="#ffd27a" stopOpacity="0.6" />
          <stop offset="1" stopColor="#ffb547" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="moon">
          <stop offset="0.55" stopColor="#e9f2ff" />
          <stop offset="0.62" stopColor="#bcd3ff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#bcd3ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#081521" />
          <stop offset="1" stopColor="#03070c" />
        </linearGradient>
        <linearGradient id="rail" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9fe8ff" stopOpacity="0.4" />
          <stop offset="1" stopColor="#e6f6ff" />
        </linearGradient>
        <linearGradient id="crit" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ef4444" stopOpacity="0.05" />
          <stop offset="1" stopColor="#ef4444" stopOpacity="0.32" />
        </linearGradient>
        <linearGradient id="sweep" x1="0" x2="1">
          <stop offset="0" stopColor="#2fd9f4" stopOpacity="0" />
          <stop offset="0.9" stopColor="#2fd9f4" stopOpacity="0.07" />
          <stop offset="1" stopColor="#bff6ff" stopOpacity="0.28" />
        </linearGradient>
        <linearGradient id="readable" x1="0" x2="1">
          <stop offset="0" stopColor="#04060c" stopOpacity="0.96" />
          <stop offset="0.38" stopColor="#04060c" stopOpacity="0.7" />
          <stop offset="0.62" stopColor="#04060c" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="fadeBottom" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.72" stopColor="#04060c" stopOpacity="0" />
          <stop offset="1" stopColor="#04060c" stopOpacity="0.9" />
        </linearGradient>
        <filter id="soft">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="6" refY="5" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" fill="#ffb547" />
        </marker>
      </defs>

      <rect width="1440" height="640" fill="url(#sky)" />
      <rect width="1440" height="640" fill="url(#horizon)" />
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.s} fill="#fff">
          <animate attributeName="opacity" values="0.2;0.95;0.2" dur={`${s.d}s`} repeatCount="indefinite" begin={`${(i % 7) * 0.4}s`} />
        </circle>
      ))}
      <circle cx="1250" cy="112" r="70" fill="url(#moon)" />

      <path d={ridge(92, 46, 0.0042, 1.2)} fill="#0b1a2c" />
      <path d={ridge(58, 34, 0.007, 2.4)} fill="#0a1625" />
      <path d={ridge(24, 18, 0.013, 0.7)} fill="#08111d" />

      <rect y={VPY} width="1440" height={BOTTOM - VPY} fill="url(#ground)" />

      {/* danger zones */}
      <polygon points={`${VPX - 9},${VPY} ${VPX + 9},${VPY} ${px(9, BOTTOM)},${BOTTOM} ${px(-9, BOTTOM)},${BOTTOM}`} fill="#ffb547" opacity="0.05" stroke="#ffb547" strokeOpacity="0.45" strokeDasharray="8 7" strokeWidth="1.5" />
      <polygon points={`${VPX - 4},${VPY} ${VPX + 4},${VPY} ${px(3.4, BOTTOM)},${BOTTOM} ${px(-3.4, BOTTOM)},${BOTTOM}`} fill="url(#crit)" stroke="#ef4444" strokeOpacity="0.75" strokeWidth="1.6">
        <animate attributeName="opacity" values="1;0.65;1" dur="2.4s" repeatCount="indefinite" />
      </polygon>

      {/* ballast, sleepers, rails */}
      <polygon points={`${VPX - 3},${VPY} ${VPX + 3},${VPY} ${px(2, BOTTOM)},${BOTTOM} ${px(-2, BOTTOM)},${BOTTOM}`} fill="#1a1a1d" />
      {sleepers.map((s) => (
        <rect key={s.y} x={s.x1} y={s.y - s.h} width={s.x2 - s.x1} height={s.h} fill="#3a2e24" opacity="0.9" />
      ))}
      {[-0.84, 0.84].map((xm) => (
        <g key={xm}>
          <line x1={VPX + xm * 0.6} y1={VPY} x2={px(xm, BOTTOM)} y2={BOTTOM} stroke="#7fdfff" strokeWidth="6" opacity="0.25" filter="url(#soft)" />
          <line x1={VPX + xm * 0.6} y1={VPY} x2={px(xm, BOTTOM)} y2={BOTTOM} stroke="url(#rail)" strokeWidth="3" />
        </g>
      ))}

      {/* tree line */}
      {trees.map((t, i) => (
        <path key={i} d={`M${t.x} ${t.y - t.h} L${t.x - t.h * 0.3} ${t.y} L${t.x + t.h * 0.3} ${t.y} Z`} fill={i % 3 ? "#050c15" : "#071220"} />
      ))}

      {/* train headlight at the vanishing point */}
      <circle cx={VPX} cy={VPY - 2} r="70" fill="url(#headlight)">
        <animate attributeName="r" values="55;80;55" dur="3s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.55;1;0.55" dur="3s" repeatCount="indefinite" />
      </circle>

      {/* signal post */}
      <g transform={`translate(${px(-2.8, 470)} 470)`}>
        <rect x="-3" y="-120" width="6" height="120" fill="#141c2a" />
        <rect x="-14" y="-160" width="28" height="56" rx="8" fill="#0c121d" stroke="#2a3446" />
        <circle cx="0" cy="-145" r="8" fill="#ef4444">
          <animate attributeName="opacity" values="1;0.25;1" dur="1.2s" repeatCount="indefinite" />
        </circle>
        <circle cx="0" cy="-145" r="20" fill="#ef4444" opacity="0.25" filter="url(#soft)">
          <animate attributeName="opacity" values="0.4;0;0.4" dur="1.2s" repeatCount="indefinite" />
        </circle>
        <circle cx="0" cy="-120" r="7" fill="#1d3b2a" />
      </g>

      {/* hazards + detections */}
      <Cow x={px(1.6, 400)} y={400} s={0.55} />
      <DetBox x={px(1.6, 400) - 26} y={378} w={52} h={26} color="#eab308" label="CATTLE · 0.88" sub="WARNING · 58" />

      <Elephant x={px(3.3, 500)} y={500} s={0.95} />
      <DetBox x={px(3.3, 500) - 64} y={408} w={128} h={98} color="#ef4444" label="ELEPHANT · 0.94 · 57 m" sub="CRITICAL · RISK 91" />
      <path d={`M${px(3.3, 500) - 70} 498 Q ${px(2.2, 512)} 512 ${px(1.3, 516)} 516`} fill="none" stroke="#ffb547" strokeWidth="2.5" strokeDasharray="7 6" markerEnd="url(#arrowhead)">
        <animate attributeName="stroke-dashoffset" values="26;0" dur="0.9s" repeatCount="indefinite" />
      </path>
      <g transform={`translate(${px(3.3, 500) - 64} 524)`}>
        <rect width="128" height="24" rx="7" fill="#ffb547">
          <animate attributeName="opacity" values="1;0.6;1" dur="1.2s" repeatCount="indefinite" />
        </rect>
        <text x="64" y="16" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="11" fontWeight="700" fill="#1c1503">
          ⚠ ENTRY IN 4.2s
        </text>
      </g>

      {/* radar sweep */}
      <g>
        <rect x="-180" y={VPY - 40} width="180" height={BOTTOM - VPY + 40} fill="url(#sweep)">
          <animateTransform attributeName="transform" type="translate" from="560 0" to="1700 0" dur="5s" repeatCount="indefinite" />
        </rect>
      </g>

      <rect width="1440" height="640" fill="url(#readable)" />
      <rect width="1440" height="640" fill="url(#fadeBottom)" />
    </svg>
  );
}
