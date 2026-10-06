import { BarChart3 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RiskLevel } from "../api/types";
import { Card, ErrorBox, PageHeader, Spinner, axisProps, chartTooltip } from "../components/ui";
import { useApi } from "../hooks/useApi";
import { CAT, RISK_HEX, titleCase } from "../lib/format";

interface Data {
  days: number;
  total: number;
  by_class: { cls: string; label: string; count: number; critical: number }[];
  by_level: { level: RiskLevel; count: number }[];
  hourly: { hour: string; count: number; avg_risk: number }[];
  daily: { date: string; total: number; critical: number; high: number; predicted: number; avg_response_s: number | null }[];
  by_section: { section: string; name: string; count: number }[];
  by_zone: { zone: string; count: number }[];
  risk_by_class: { label: string; avg_risk: number; max_risk: number }[];
  confidence_hist: { bin: string; count: number }[];
  by_status: { status: string; count: number }[];
  by_motion: { direction: string; count: number }[];
  predicted_vs_on_track: { label: string; predicted: number; on_track: number }[];
}

const ZONE_HEX: Record<string, string> = { CRITICAL: RISK_HEX.CRITICAL, WARNING: RISK_HEX.MEDIUM, SAFE: RISK_HEX.SAFE };
const grid = <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />;
const BLUE = CAT[0];

function ChartCard({ n, title, note, children, className }: { n: number; title: string; note?: string; children: ReactNode; className?: string }) {
  return (
    <Card
      className={className}
      title={
        <span>
          <span className="mr-2 font-mono text-xs text-slate-500">{String(n).padStart(2, "0")}</span>
          {title}
        </span>
      }
    >
      {note && <p className="-mt-1 mb-2 text-[11px] text-slate-500">{note}</p>}
      <div className="h-60">{children}</div>
    </Card>
  );
}

function LegendRow({ items }: { items: { label: string; color: string; dash?: boolean }[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-3 text-[11px] text-slate-400">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(14);
  const { data, error, loading, reload } = useApi<Data>("/analytics", { days }, 30000);
  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorBox message={error} onRetry={() => reload()} />;
  if (!data) return null;
  const crit = data.by_level.find((l) => l.level === "CRITICAL")?.count ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Hazard Analytics"
        subtitle={`${data.total} incidents analysed over the last ${data.days} days · ${crit} critical`}
        icon={BarChart3}
        actions={
          <div className="flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
            {[7, 14, 30, 60].map((d) => (
              <button key={d} onClick={() => setDays(d)} className={`rounded-md px-3 py-1.5 text-xs font-medium ${days === d ? "bg-cyan-500/20 text-cyan-200" : "text-slate-400 hover:text-white"}`}>
                {d}d
              </button>
            ))}
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
        <ChartCard n={1} title="Incidents by hazard class" note="Critical share shown in red (status colour)">
          <ResponsiveContainer>
            <BarChart data={data.by_class.map((c) => ({ ...c, other: c.count - c.critical }))} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis type="number" {...axisProps} allowDecimals={false} />
              <YAxis type="category" dataKey="label" {...axisProps} width={100} interval={0} fontSize={10} />
              <Tooltip {...chartTooltip} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="critical" name="Critical" stackId="a" fill={RISK_HEX.CRITICAL} />
              <Bar dataKey="other" name="Other levels" stackId="a" fill={BLUE} radius={[0, 4, 4, 0]} stroke="#0a1220" strokeWidth={2} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard n={2} title="Risk level distribution">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={data.by_level.filter((l) => l.count > 0)} dataKey="count" nameKey="level" innerRadius="45%" outerRadius="70%" paddingAngle={2} stroke="#0a1220" strokeWidth={2} label={({ level, count }) => `${level} ${count}`} labelLine={false} fontSize={11}>
                {data.by_level
                  .filter((l) => l.count > 0)
                  .map((l) => (
                    <Cell key={l.level} fill={RISK_HEX[l.level]} />
                  ))}
              </Pie>
              <Tooltip {...chartTooltip} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard n={3} title="Incidents by hour of day (IST)" note="Animal hazards peak at dusk and night">
          <ResponsiveContainer>
            <BarChart data={data.hourly}>
              {grid}
              <XAxis dataKey="hour" {...axisProps} interval={3} />
              <YAxis {...axisProps} width={30} allowDecimals={false} />
              <Tooltip {...chartTooltip} />
              <Bar dataKey="count" name="Incidents" fill={BLUE} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <Card title={<span><span className="mr-2 font-mono text-xs text-slate-500">04</span>Daily incident trend</span>} className="lg:col-span-2">
          <LegendRow items={[{ label: "All incidents", color: CAT[0] }, { label: "Critical", color: RISK_HEX.CRITICAL }, { label: "Predicted threats", color: CAT[6] }]} />
          <div className="h-60">
            <ResponsiveContainer>
              <LineChart data={data.daily}>
                {grid}
                <XAxis dataKey="date" {...axisProps} />
                <YAxis {...axisProps} width={30} allowDecimals={false} />
                <Tooltip {...chartTooltip} />
                <Line type="monotone" dataKey="total" name="All incidents" stroke={CAT[0]} strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="critical" name="Critical" stroke={RISK_HEX.CRITICAL} strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="predicted" name="Predicted threats" stroke={CAT[6]} strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 3" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <ChartCard n={5} title="Incidents by railway section">
          <ResponsiveContainer>
            <BarChart data={data.by_section}>
              {grid}
              <XAxis dataKey="section" {...axisProps} />
              <YAxis {...axisProps} width={30} allowDecimals={false} />
              <Tooltip {...chartTooltip} labelFormatter={(l) => data.by_section.find((s) => s.section === l)?.name ?? l} />
              <Bar dataKey="count" name="Incidents" fill={BLUE} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard n={6} title="Detections by danger zone" note="Zone at peak risk; SAFE-zone entries are predicted threats">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={data.by_zone} dataKey="count" nameKey="zone" innerRadius="45%" outerRadius="70%" paddingAngle={2} stroke="#0a1220" strokeWidth={2} label={({ zone, count }) => `${zone} ${count}`} labelLine={false} fontSize={11}>
                {data.by_zone.map((z) => (
                  <Cell key={z.zone} fill={ZONE_HEX[z.zone] ?? BLUE} />
                ))}
              </Pie>
              <Tooltip {...chartTooltip} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard n={7} title="Average risk score by hazard class" note="Hover for peak risk">
          <ResponsiveContainer>
            <BarChart data={data.risk_by_class} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} {...axisProps} />
              <YAxis type="category" dataKey="label" {...axisProps} width={100} interval={0} fontSize={10} />
              <Tooltip {...chartTooltip} formatter={(v: number, _n, p) => [`${v} (peak ${p.payload.max_risk})`, "Avg risk"]} />
              <Bar dataKey="avg_risk" name="Avg risk" fill={BLUE} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard n={8} title="Operator response time (daily mean, s)" note="Time from detection to acknowledgement">
          <ResponsiveContainer>
            <LineChart data={data.daily}>
              {grid}
              <XAxis dataKey="date" {...axisProps} />
              <YAxis {...axisProps} width={30} />
              <Tooltip {...chartTooltip} />
              <Line type="monotone" dataKey="avg_response_s" name="Mean response (s)" stroke={CAT[2]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard n={9} title="Detection confidence distribution">
          <ResponsiveContainer>
            <BarChart data={data.confidence_hist}>
              {grid}
              <XAxis dataKey="bin" {...axisProps} />
              <YAxis {...axisProps} width={30} allowDecimals={false} />
              <Tooltip {...chartTooltip} labelFormatter={(l) => `Confidence ≥ ${l}`} />
              <Bar dataKey="count" name="Incidents" fill={BLUE} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard n={10} title="Incident status breakdown">
          <ResponsiveContainer>
            <BarChart data={data.by_status.map((s) => ({ ...s, label: titleCase(s.status) }))} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis type="number" {...axisProps} allowDecimals={false} />
              <YAxis type="category" dataKey="label" {...axisProps} width={100} interval={0} fontSize={10} />
              <Tooltip {...chartTooltip} />
              <Bar dataKey="count" name="Incidents" fill={BLUE} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <Card title={<span><span className="mr-2 font-mono text-xs text-slate-500">11</span>Early warning vs on-track detections</span>}>
          <LegendRow items={[{ label: "Predicted before entry", color: CAT[0] }, { label: "Detected on track", color: CAT[1] }]} />
          <div className="h-60">
            <ResponsiveContainer>
              <BarChart data={data.predicted_vs_on_track}>
                {grid}
                <XAxis dataKey="label" {...axisProps} interval={0} angle={-30} textAnchor="end" height={55} />
                <YAxis {...axisProps} width={30} allowDecimals={false} />
                <Tooltip {...chartTooltip} />
                <Bar dataKey="predicted" name="Predicted before entry" fill={CAT[0]} radius={[4, 4, 0, 0]} />
                <Bar dataKey="on_track" name="Detected on track" fill={CAT[1]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <ChartCard n={12} title="Object motion at peak risk">
          <ResponsiveContainer>
            <BarChart data={data.by_motion}>
              {grid}
              <XAxis dataKey="direction" {...axisProps} interval={0} fontSize={10} />
              <YAxis {...axisProps} width={30} allowDecimals={false} />
              <Tooltip {...chartTooltip} />
              <Bar dataKey="count" name="Incidents" fill={BLUE} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
