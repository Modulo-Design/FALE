import Link from "next/link";
import { Suspense } from "react";
import { CURRENT_SEASON } from "@/lib/config";
import SeasonSelector from "./SeasonSelector";

export default function SiteHeader() {
  return (
    <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm">
      <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            <Link
              href={`/?season=${CURRENT_SEASON}`}
              className="hover:text-green-600 dark:hover:text-green-400 transition-colors"
            >
              🏈 FALE League Dashboard
            </Link>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Victory Points standings tracker
          </p>
        </div>
        {/* SeasonSelector reads searchParams, which Next requires be suspended. */}
        <Suspense fallback={<div className="h-8" />}>
          <SeasonSelector />
        </Suspense>
      </div>
    </header>
  );
}
