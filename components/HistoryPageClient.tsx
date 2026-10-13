"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Trash2, Play } from "lucide-react";
import { useSpatialNav } from "@/hooks/useSpatialNav";
import { getImageUrl } from "@/lib/tmdb";
import type { WatchProgress, MediaType } from "@/types";

export default function HistoryPageClient() {
  const router = useRouter();
  useSpatialNav({ debounceTime: 80 });

  const [entries, setEntries] = useState<WatchProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | MediaType>("all");

  // Standard data-fetch-on-mount. setState happens inside async continuations
  // (after `await`), so this is not a cascading sync render.
  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch("/api/watch/progress?limit=50");
      const data = await res.json();
      setEntries(data.entries || []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Standard fetch-on-mount. fetchEntries only calls setState inside async
  // continuations (after `await`), so no cascading sync render occurs.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const resume = useCallback(
    (entry: WatchProgress) => {
      router.push(
        `/watch/${entry.tmdb_id}?type=${entry.media_type}&season=${entry.season}&episode=${entry.episode}&resume=${entry.progress_seconds}`
      );
    },
    [router]
  );

  const clearHistory = useCallback(async () => {
    if (!confirm("Clear all watch history?")) return;
    try {
      await fetch("/api/watch/progress", { method: "DELETE" });
      setEntries([]);
    } catch {
      // noop
    }
  }, []);

  const filtered = filter === "all" ? entries : entries.filter((e) => e.media_type === filter);

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="px-4 sm:px-6 pt-4 pb-2">
        <button
          onClick={() => router.push("/")}
          className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors focusable rounded-lg px-3 py-1.5"
          tabIndex={0}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Browse
        </button>
      </div>

      <div className="px-4 sm:px-6 pt-2">
        <h1 className="text-xl font-bold text-zinc-100 mb-1">
          Watch History
        </h1>
        <p className="text-sm text-zinc-500 mb-4">
          Picked up right where you left off, on any device.
        </p>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 bg-zinc-900 rounded-xl p-1 mb-6" role="tablist">
          {(
            [
              { id: "all", label: "All" },
              { id: "movie", label: "Movies" },
              { id: "tv", label: "TV Shows" },
            ] as { id: "all" | MediaType; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors focusable ${
                filter === tab.id
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
              }`}
              role="tab"
              aria-selected={filter === tab.id}
              tabIndex={0}
            >
              {tab.label}
            </button>
          ))}

          {entries.length > 0 && (
            <button
              onClick={clearHistory}
              className="px-4 py-2 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors focusable ml-auto"
              tabIndex={0}
            >
              <Trash2 className="w-4 h-4 inline mr-1" />
              Clear
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-zinc-600 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-zinc-500">
          {entries.length === 0 ? (
            <>No watch history yet. Start watching something!</>
          ) : (
            <>No {filter} entries.</>
          )}
        </div>
      ) : (
        <div className="px-4 sm:px-6 pb-10 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
          {filtered.map((entry) => {
            const pct =
              entry.duration_seconds > 0
                ? Math.min(100, Math.round((entry.progress_seconds / entry.duration_seconds) * 100))
                : 0;
            return (
              <div
                key={`${entry.tmdb_id}-${entry.season}-${entry.episode}`}
                onClick={() => resume(entry)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") resume(entry);
                }}
                className="focusable group cursor-pointer"
                tabIndex={0}
                role="button"
                aria-label={`Resume ${entry.title || entry.tmdb_id}`}
              >
                <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-zinc-800">
                  <img
                    src={getImageUrl(entry.poster_path ?? null, "w342")}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/90 flex items-center justify-center">
                      <Play className="w-4 h-4 fill-zinc-950 ml-0.5" />
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-800">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {/* Type badge */}
                  <div className="absolute top-1.5 left-1.5 bg-black/70 rounded px-1 py-0.5 text-[9px] text-zinc-300">
                    {entry.media_type === "tv"
                      ? `S${entry.season} E${entry.episode}`
                      : "Movie"}
                  </div>
                </div>
                <p className="mt-1.5 text-xs sm:text-sm text-zinc-300 truncate">
                  {entry.title || `Title #${entry.tmdb_id}`}
                </p>
                <p className="text-[10px] text-zinc-500">
                  {entry.progress_seconds > 0
                    ? `${Math.floor(entry.progress_seconds / 60)}m watched`
                    : "Just started"}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}