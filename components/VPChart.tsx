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

import { useMediaQuery } from "@/lib/use-media-query";
import type { TeamStanding } from "@/lib/types";

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
  // Fourteen governor names will not fit along the bottom of a phone screen:
  // recharts silently drops ticks to make room, so half the league disappears.
  // Below Tailwind's `sm` breakpoint the bars turn sideways instead, which
  // gives every name a full row of its own.
  const narrow = useMediaQuery("(max-width: 639px)");

  const data = [...standings]
    .sort((a, b) => b.totalVP - a.totalVP)
    .map((t) => ({
      name: t.displayName.split(" ")[0],
      "Matchup VPs": t.weeklyResults.reduce((s, r) => s + r.vpMatchup + r.vpAdjustment, 0),
      "Scoring VPs": t.weeklyResults.reduce((s, r) => s + r.vpScoring, 0),
    }));

  if (narrow) {
    return (
      <ResponsiveContainer width="100%" height={520}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 12, left: 0, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis type="number" tick={{ fontSize: 12 }} />
          <YAxis
            type="category"
            dataKey="name"
            width={64}
            interval={0}
            tick={{ fontSize: 12, fontWeight: 700 }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Bar dataKey="Matchup VPs" stackId="a" fill="#22c55e" />
          <Bar dataKey="Scoring VPs" stackId="a" fill="#86efac" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 24 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        {/* interval={0} forces every tick; the angle keeps them from colliding
            at tablet widths, where all 14 still fit but only just. */}
        <XAxis
          dataKey="name"
          interval={0}
          angle={-35}
          textAnchor="end"
          height={52}
          tick={{ fontSize: 13, fontWeight: 700 }}
        />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Bar dataKey="Matchup VPs" stackId="a" fill="#22c55e" />
        <Bar dataKey="Scoring VPs" stackId="a" fill="#86efac" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
