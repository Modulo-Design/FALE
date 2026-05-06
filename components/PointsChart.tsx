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

const COLORS = [
  "#22c55e","#16a34a","#15803d","#166534","#14532d",
  "#4ade80","#86efac","#bbf7d0","#dcfce7","#f0fdf4","#f7fee7","#ecfccb",
];

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
        <Tooltip formatter={(v) => typeof v === "number" ? v.toFixed(2) : v} />
        <Bar dataKey="Points" radius={[4, 4, 0, 0]}>
          {data.map((_, idx) => (
            <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
