"use client";

import { Medal, Trophy } from "lucide-react";
import type { Podium as PodiumData } from "@/lib/types";

interface Props {
  podium: PodiumData;
  season: string;
  className?: string;
}

const PLACES = [
  {
    key: "first" as const,
    label: "Champion",
    Icon: Trophy,
    // Gold, silver and bronze, kept muted enough to sit beside the green accent.
    accent: "border-amber-300 bg-amber-50 dark:border-amber-700/60 dark:bg-amber-900/20",
    text: "text-amber-900 dark:text-amber-100",
    icon: "text-amber-500 dark:text-amber-400",
    size: "text-lg",
  },
  {
    key: "second" as const,
    label: "Runner-up",
    Icon: Medal,
    accent: "border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-800/60",
    text: "text-gray-800 dark:text-gray-100",
    icon: "text-gray-400 dark:text-gray-400",
    size: "text-base",
  },
  {
    key: "third" as const,
    label: "Third",
    Icon: Medal,
    accent: "border-orange-200 bg-orange-50 dark:border-orange-800/60 dark:bg-orange-900/20",
    text: "text-orange-900 dark:text-orange-100",
    icon: "text-orange-400 dark:text-orange-500",
    size: "text-base",
  },
];

export default function Podium({ podium, season, className = "" }: Props) {
  return (
    <aside className={`space-y-2 ${className}`}>
      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        {season} Podium
      </h3>

      {PLACES.map(({ key, label, Icon, accent, text, icon, size }) => {
        const name = podium[key];
        if (!name) return null;
        return (
          <div key={key} className={`flex items-center gap-3 rounded-lg border p-3 ${accent}`}>
            <Icon className={`w-5 h-5 shrink-0 ${icon}`} aria-hidden />
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {label}
              </p>
              <p className={`font-bold truncate ${size} ${text}`}>{name}</p>
            </div>
          </div>
        );
      })}

      <p className="text-[11px] leading-snug text-gray-400 dark:text-gray-500 pt-1">
        Third place goes to the better-seeded losing semi-finalist. Sleeper&apos;s third-place
        game is an exhibition and doesn&apos;t decide it.
      </p>
    </aside>
  );
}
