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
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <Legend />
        <Bar dataKey="Matchup VPs" stackId="a" fill="#22c55e" />
        <Bar dataKey="Scoring VPs" stackId="a" fill="#86efac" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
