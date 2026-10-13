"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ListFilter, X } from "lucide-react";
import type { TMDBGenre } from "@/types";

export type MediaFilter = "all" | "movie" | "tv";

interface FilterBarProps {
  movieGenres: TMDBGenre[];
  tvGenres: TMDBGenre[];
  /** Called when user taps a media-type tab (filters homepage rows in place) */
  onFilterChange: (filter: MediaFilter) => void;
}

export default function FilterBar({
  movieGenres,
  tvGenres,
  onFilterChange,
}: FilterBarProps) {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<MediaFilter>("all");
  const [mobileOpen, setMobileOpen] = useState(false);

  const genres =
    activeFilter === "tv"
      ? tvGenres
      : activeFilter === "movie"
      ? movieGenres
      : movieGenres.slice(0, 12);

  const handleTabClick = useCallback(
    (tab: MediaFilter) => {
      setActiveFilter(tab);
      onFilterChange(tab);
      // On mobile, opening Movies/TV reveals the genre chips row
      setMobileOpen(tab !== "all");
    },
    [onFilterChange]
  );

  const navigateToBrowse = useCallback(
    (type: "movie" | "tv", genreId?: number) => {
      const params = new URLSearchParams({ type });
      if (genreId) params.set("genre", String(genreId));
      router.push(`/browse?${params.toString()}`);
    },
    [router]
  );

  return (
    <div className="px-4 sm:px-6 py-4">
      <div className="flex flex-wrap items-center gap-3">
        {/* Media type segmented control */}
        <div className="flex items-center gap-1 bg-zinc-900 rounded-xl p-1" role="tablist">
          {(
            [
              { id: "all", label: "All" },
              { id: "movie", label: "Movies" },
              { id: "tv", label: "TV" },
            ] as { id: MediaFilter; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors focusable ${
                activeFilter === tab.id
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
              }`}
              role="tab"
              aria-selected={activeFilter === tab.id}
              tabIndex={0}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Genre chips (hide on mobile, show via toggle) */}
        <div className={`flex-1 min-w-0 ${mobileOpen ? "block" : "hidden lg:block"}`}>
          <div className="flex gap-2 overflow-x-auto hide-scrollbar py-1">
            {genres.map((genre) => (
              <button
                key={genre.id}
                onClick={() =>
                  navigateToBrowse(
                    activeFilter === "tv" ? "tv" : "movie",
                    genre.id
                  )
                }
                className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-100 bg-zinc-800/60 hover:bg-zinc-700/60 rounded-full transition-colors focusable"
                tabIndex={0}
              >
                {genre.name}
              </button>
            ))}
            {/* Clear / All Genres */}
            <button
              onClick={() =>
                router.push(
                  `/browse?type=${activeFilter === "tv" ? "tv" : "movie"}`
                )
              }
              className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/10 bg-zinc-800/60 rounded-full transition-colors focusable"
              tabIndex={0}
            >
              <X className="w-3 h-3 inline mr-1" />
              All Genres
            </button>
          </div>
        </div>

        {/* Mobile filter toggle */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="lg:hidden p-2 text-zinc-400 hover:text-zinc-200 rounded-lg focusable"
          aria-label="Toggle filters"
          aria-expanded={mobileOpen}
          tabIndex={0}
        >
          <ListFilter className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}