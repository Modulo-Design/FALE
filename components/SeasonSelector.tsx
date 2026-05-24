"use client";

import { useRouter } from "next/navigation";

interface Props {
  seasons: string[];
  current: string;
  historicalActive?: boolean;
}

export default function SeasonSelector({ seasons, current, historicalActive }: Props) {
  const router = useRouter();
  return (
    <div className="flex gap-2 flex-wrap items-center">
      <button
        onClick={() => router.push("/?view=historical")}
        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
          historicalActive
            ? "bg-green-600 text-white"
            : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
        }`}
      >
        Historical
      </button>
      <span className="text-gray-300 dark:text-gray-600 select-none">|</span>
      {seasons.map((s) => (
        <button
          key={s}
          onClick={() => router.push(`/?season=${s}`)}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            !historicalActive && s === current
              ? "bg-green-600 text-white"
              : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
