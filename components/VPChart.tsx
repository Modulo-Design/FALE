"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface WeeklyResult {
  vpMatchup: number;
  vpScoring: number;
  vpAdjustment: number;
}

interface TeamStanding {
  displayName: string;
  totalVP: number;
  wins: number;
  losses: number;
  weeklyResults: WeeklyResult[];
}

interface Props {
  standings: TeamStanding[];
}

interface TooltipPayload {
  name: string;
  value: number;
  fill: string;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + p.value, 0);
  return (
    <div className="bg-gray-900 text-white rounded-lg shadow-xl px-4 py-3 text-sm min-w-[140px]">
      <p className="font-bold text-base mb-2 border-b border-gray-700 pb-1">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: entry.fill }} />
            <span className="text-gray-300">{entry.name}</span>
          </span>
          <span className="font-semibold">{entry.value}</span>
        </div>
      ))}
      <div className="flex justify-between pt-1 mt-1 border-t border-gray-700 font-bold">
        <span>Total</span>
        <span>{total}</span>
      </div>
    </div>
  );
}

export default function VPChart({ standings }: Props) {
  const data = [...standings]
    .sort((a, b) => b.totalVP - a.totalVP)
    .map((t) => ({
      name: t.displayName.split(" ")[0],
      "Matchup VPs": t.weeklyResults.reduce((s, r) => s + r.vpMatchup + r.vpAdjustment, 0),
      "Scoring VPs": t.weeklyResults.reduce((s, r) => s + r.vpScoring, 0),
    }));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="name" tick={{ fontSize: 13, fontWeight: 700 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Bar dataKey="Matchup VPs" stackId="a" fill="#22c55e" />
        <Bar dataKey="Scoring VPs" stackId="a" fill="#86efac" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
