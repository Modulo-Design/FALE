"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface TeamStanding {
  displayName: string;
  totalPoints: number;
}

interface Props {
  standings: TeamStanding[];
}

// Smooth linear interpolation from dark green (#16a34a) for rank 1 to light green (#86efac) for last.
function barColor(index: number, total: number): string {
  const t = total <= 1 ? 0 : index / (total - 1);
  const r = Math.round(0x16 + t * (0x86 - 0x16));
  const g = Math.round(0xa3 + t * (0xef - 0xa3));
  const b = Math.round(0x4a + t * (0xac - 0x4a));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export default function PointsChart({ standings }: Props) {
  const data = [...standings]
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .map((t) => ({
      name: t.displayName.split(" ")[0],
      Points: t.totalPoints,
    }));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} domain={["auto", "auto"]} />
        <Tooltip formatter={(v) => (typeof v === "number" ? v.toFixed(2) : v)} />
        <Bar dataKey="Points" radius={[4, 4, 0, 0]}>
          {data.map((_, idx) => (
            <Cell key={idx} fill={barColor(idx, data.length)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
