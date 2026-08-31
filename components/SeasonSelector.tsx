"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CURRENT_SEASON, SEASONS } from "@/lib/config";

const HISTORY_LINKS = [
  { href: "/history", label: "Stats" },
  { href: "/history/h2h", label: "Head-to-Head" },
  { href: "/history/records", label: "Records" },
  { href: "/trades", label: "Trades" },
];

function pill(active: boolean): string {
  return `px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
    active
      ? "bg-green-600 text-white"
      : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
  }`;
}

export default function SeasonSelector() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const onSeasonPage = pathname === "/";
  const currentSeason = searchParams.get("season") ?? CURRENT_SEASON;
  const seasons = SEASONS.length > 0 ? SEASONS : [CURRENT_SEASON];

  return (
    <div className="flex gap-2 flex-wrap items-center">
      {HISTORY_LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={pill(pathname === link.href)}
        >
          {link.label}
        </Link>
      ))}
      <span className="text-gray-300 dark:text-gray-600 select-none">|</span>
      {seasons.map((season) => (
        <Link
          key={season}
          href={`/?season=${season}`}
          className={pill(onSeasonPage && season === currentSeason)}
        >
          {season}
        </Link>
      ))}
    </div>
  );
}
