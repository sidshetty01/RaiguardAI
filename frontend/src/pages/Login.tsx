import { Brain, Eye, Loader2, Lock, Radar, ShieldCheck, User as UserIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { errorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";

const DEMO = [
  { role: "Admin", username: "admin", password: "admin123", desc: "Full control & settings" },
  { role: "Operator", username: "operator", password: "operator123", desc: "Acknowledge & sign-off" },
  { role: "Viewer", username: "viewer", password: "viewer123", desc: "Read-only audit" },
];

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("operator");
  const [password, setPassword] = useState("operator123");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
      if (location.pathname !== "/") history.replaceState(null, "", "/");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-full lg:grid-cols-[1.15fr_1fr]">
      <div className="relative hidden overflow-hidden border-r border-white/[0.06] lg:block">
        {/* perspective track illustration */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 800 900" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#020617" />
              <stop offset="1" stopColor="#0c2a3a" />
            </linearGradient>
            <linearGradient id="zone" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ef4444" stopOpacity="0" />
              <stop offset="1" stopColor="#ef4444" stopOpacity="0.35" />
            </linearGradient>
          </defs>
          <rect width="800" height="900" fill="url(#sky)" />
          <path d="M0 420 Q120 340 240 400 T480 380 T800 410 V900 H0Z" fill="#06231a" />
          <path d="M0 450 Q160 400 300 440 T620 430 T800 445 V900 H0Z" fill="#082b1f" />
          <polygon points="388,420 412,420 640,900 160,900" fill="url(#zone)" />
          <polygon points="380,420 420,420 800,900 0,900" fill="#facc15" fillOpacity="0.05" />
          <line x1="396" y1="420" x2="300" y2="900" stroke="#cbd5e1" strokeWidth="4" />
          <line x1="404" y1="420" x2="500" y2="900" stroke="#cbd5e1" strokeWidth="4" />
          {Array.from({ length: 22 }).map((_, i) => {
            const t = Math.pow(i / 22, 1.8);
            const y = 425 + t * 475;
            const half = 6 + t * 120;
            return <rect key={i} x={400 - half} y={y} width={half * 2} height={2 + t * 10} fill="#4a3b2c" opacity={0.8} />;
          })}
          <g>
            <rect x="520" y="560" width="110" height="80" fill="none" stroke="#ef4444" strokeWidth="3" rx="3">
              <animate attributeName="opacity" values="1;0.4;1" dur="1.4s" repeatCount="indefinite" />
            </rect>
            <text x="575" y="620" fontSize="62" textAnchor="middle">🐘</text>
            <rect x="520" y="532" width="150" height="24" rx="4" fill="#020617" opacity="0.85" />
            <text x="528" y="549" fontSize="13" fill="#fca5a5" fontFamily="Inter" fontWeight="700">ELEPHANT · RISK 91</text>
            <line x1="575" y1="640" x2="505" y2="660" stroke="#f43f5e" strokeWidth="3" />
          </g>
        </svg>
        <div className="relative z-10 flex h-full flex-col justify-between p-10">
          <div className="flex items-center gap-3">
            <img src="/favicon.svg" className="h-10 w-10" alt="" />
            <div className="text-xl font-extrabold text-white">
              RailGuard <span className="text-cyan-300">AI</span>
            </div>
          </div>
          <div className="max-w-lg">
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-white">
              See the Risk.
              <br />
              Predict the Threat.
              <br />
              <span className="bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent">Protect the Track.</span>
            </h1>
            <p className="mt-4 text-slate-300">AI-based intelligent framework for autonomous railway track safety monitoring in rural and forest corridors.</p>
            <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
              {[
                { icon: Eye, t: "YOLOv8 + Track ROI", d: "12+ hazard classes, zone-aware" },
                { icon: Radar, t: "Trajectory prediction", d: "Early warning before entry" },
                { icon: Brain, t: "Explainable risk (XAI)", d: "Every score fully itemised" },
                { icon: ShieldCheck, t: "Escalation engine", d: "Operator → Loco Pilot" },
              ].map((f) => (
                <div key={f.t} className="glass flex gap-3 p-3">
                  <f.icon className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" />
                  <div>
                    <div className="font-semibold text-white">{f.t}</div>
                    <div className="text-xs text-slate-400">{f.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="text-xs text-slate-500">Department of AI & DS, NMAMIT · Major Project 2023-27 · RailGuard AI System v2.0</div>
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="glass w-full max-w-sm space-y-5 p-7">
          <div>
            <div className="mb-4 flex items-center gap-3 lg:hidden">
              <img src="/favicon.svg" className="h-9 w-9" alt="" />
              <div className="text-lg font-extrabold text-white">RailGuard AI</div>
            </div>
            <h2 className="text-2xl font-bold text-white">Control Room Sign-in</h2>
            <p className="mt-1 text-sm text-slate-400">Authorised railway safety personnel only.</p>
          </div>
          <div>
            <label className="label" htmlFor="u">
              Username
            </label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input id="u" className="input pl-9" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="p">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input id="p" type="password" className="input pl-9" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
          </div>
          {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-sm text-red-300">{error}</div>}
          <button className="btn-primary w-full py-2.5" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Sign in
          </button>
          <div>
            <div className="label">Demo accounts</div>
            <div className="grid grid-cols-3 gap-2">
              {DEMO.map((d) => (
                <button
                  type="button"
                  key={d.role}
                  onClick={() => {
                    setUsername(d.username);
                    setPassword(d.password);
                  }}
                  className={`rounded-lg border p-2 text-left transition ${username === d.username ? "border-cyan-400/50 bg-cyan-400/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"}`}
                >
                  <div className="text-xs font-semibold text-white">{d.role}</div>
                  <div className="text-[10px] leading-tight text-slate-400">{d.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
