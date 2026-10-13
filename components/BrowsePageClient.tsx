"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Star, ChevronsUpDown } from "lucide-react";
import { useSpatialNav } from "@/hooks/useSpatialNav";
import { getImageUrl, getMediaTitle, getMediaYear } from "@/lib/tmdb";
import type { TMDBMediaItem, TMDBGenre } from "@/types";

interface BrowsePageClientProps {
  results: TMDBMediaItem[];
  totalPages: number;
  mediaType: "movie" | "tv";
  currentGenre: number | null;
  sortBy: string;
  movieGenres: TMDBGenre[];
  tvGenres: TMDBGenre[];
}

const SORT_OPTIONS = [
  { value: "popularity.desc", label: "Popularity" },
  { value: "vote_average.desc", label: "Top Rated" },
  { value: "release_date.desc", label: "Newest" },
  { value: "title.asc", label: "A–Z" },
  { value: "revenue.desc", label: "Box Office" },
];

export default function BrowsePageClient({
  results: initialResults,
  totalPages: initialTotalPages,
  mediaType: initialMediaType,
  currentGenre,
  sortBy: initialSortBy,
  movieGenres,
  tvGenres,
}: BrowsePageClientProps) {
  const router = useRouter();
  useSpatialNav({ debounceTime: 80 });

  const [mediaType, setMediaType] = useState(initialMediaType);
  const [genre, setGenre] = useState<number | null>(currentGenre);
  const [sortBy, setSortBy] = useState(initialSortBy);
  const [results, setResults] = useState(initialResults);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadingRef = useRef(false);

  const genres = mediaType === "tv" ? tvGenres : movieGenres;
  const genreMap = new Map(genres.map((g) => [g.id, g.name]));

  // Push filter state to URL -- server re-renders with new results
  const applyFilters = useCallback(
    (nextType: "movie" | "tv", nextGenre: number | null, nextSort: string) => {
      const params = new URLSearchParams({ type: nextType, sort: nextSort });
      if (nextGenre) params.set("genre", String(nextGenre));
      router.push(`/browse?${params.toString()}`);
    },
    [router]
  );

  const handleTypeChange = useCallback(
    (t: "movie" | "tv") => {
      setMediaType(t);
      applyFilters(t, genre, sortBy);
    },
    [applyFilters, genre, sortBy]
  );

  const handleGenreChange = useCallback(
    (g: number | null) => {
      setGenre(g);
      applyFilters(mediaType, g, sortBy);
    },
    [applyFilters, mediaType, sortBy]
  );

  const handleSortChange = useCallback(
    (s: string) => {
      setSortBy(s);
      applyFilters(mediaType, genre, s);
    },
    [applyFilters, mediaType, genre]
  );

  // Load more -- client-side fetch of the next page
  const loadMore = useCallback(async () => {
    if (loadingRef.current || page >= totalPages) return;
    loadingRef.current = true;
    setIsLoadingMore(true);
    try {
      const next = page + 1;
      const params = new URLSearchParams({
        page: String(next),
        type: mediaType,
        sort: sortBy,
      });
      if (genre) params.set("genre", String(genre));
      const res = await fetch(`/api/tmdb/discover/${mediaType}?${params.toString()}`);
      const data = await res.json();
      setResults([...results, ...(data.results || [])]);
      setPage(next);
      setTotalPages(data.total_pages);
    } catch {
      // ignore -- user can retry
    } finally {
      loadingRef.current = false;
      setIsLoadingMore(false);
    }
  }, [page, totalPages, results, mediaType, sortBy, genre]);

  const navigateToWatch = useCallback(
    (item: TMDBMediaItem) => {
      router.push(`/watch/${item.id}?type=${mediaType}`);
    },
    [router, mediaType]
  );

  const hasMore = page < totalPages;

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Back button */}
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

      {/* Filter bar */}
      <div className="px-4 sm:px-6 pt-2 pb-4 flex flex-wrap items-center gap-3">
        {/* Media type segmented control */}
        <div className="flex items-center gap-1 bg-zinc-900 rounded-xl p-1" role="tablist">
          {(
            [
              { id: "movie", label: "Movies" },
              { id: "tv", label: "TV Shows" },
            ] as { id: "movie" | "tv"; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTypeChange(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors focusable ${
                mediaType === tab.id
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
              }`}
              role="tab"
              aria-selected={mediaType === tab.id}
              tabIndex={0}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Sort dropdown */}
        <div className="relative">
          <select
            value={sortBy}
            onChange={(e) => handleSortChange(e.target.value)}
            className="appearance-none h-10 bg-zinc-800 border border-zinc-700 rounded-lg pl-3 pr-8 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30"
            aria-label="Sort by"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                Sort: {opt.label}
              </option>
            ))}
          </select>
          <ChevronsUpDown className="w-4 h-4 absolute right-2.5 top-3 text-zinc-500 pointer-events-none" />
        </div>

        {/* Genre chips */}
        <div className="flex gap-2 overflow-x-auto hide-scrollbar flex-1 min-w-0 py-1">
          <button
            onClick={() => handleGenreChange(null)}
            className={`flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-full transition-colors focusable ${
              !genre
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-zinc-800/60 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/60"
            }`}
            tabIndex={0}
          >
            All Genres
          </button>
          {genres.map((g) => (
            <button
              key={g.id}
              onClick={() => handleGenreChange(g.id)}
              className={`flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-full transition-colors focusable ${
                genre === g.id
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-zinc-800/60 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/60"
              }`}
              tabIndex={0}
            >
              {g.name}
            </button>
          ))}
        </div>
      </div>

      {/* Result count */}
      <div className="px-4 sm:px-6 text-sm text-zinc-400 pb-4">
        {results.length} {results.length === 1 ? "title" : "titles"}
        {genre ? ` in ${genreMap.get(genre) || "genre"}` : ""}
      </div>

      {/* Dense responsive grid */}
      {results.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          No titles match these filters.
        </div>
      ) : (
        <div className="px-4 sm:px-6 pb-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
          {results.map((item) => {
            const title = getMediaTitle(item);
            const year = getMediaYear(item);
            const rating = item.vote_average ? item.vote_average.toFixed(1) : null;
            return (
              <div
                key={`${mediaType}-${item.id}`}
                onClick={() => navigateToWatch(item)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") navigateToWatch(item);
                }}
                className="focusable group cursor-pointer"
                tabIndex={0}
                role="button"
                aria-label={`${title}${year !== "—" ? `, ${year}` : ""}`}
              >
                <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-zinc-800 shadow-lg">
                  <img
                    src={getImageUrl(item.poster_path, "w342")}
                    alt={title}
                    className="w-full h-full object-cover transition-opacity group-hover:opacity-90"
                    loading="lazy"
                  />
                  {rating && (
                    <div className="absolute top-1.5 right-1.5 bg-black/70 backdrop-blur-sm rounded px-1.5 py-0.5 flex items-center gap-0.5 text-[10px] font-medium">
                      <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                      <span className="text-amber-100">{rating}</span>
                    </div>
                  )}
                </div>
                <p className="mt-1.5 text-xs sm:text-sm font-medium text-zinc-300 truncate">
                  {title}
                </p>
                <p className="text-[10px] sm:text-xs text-zinc-500">{year}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center py-6">
          <button
            onClick={loadMore}
            disabled={isLoadingMore}
            className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold rounded-xl transition-colors focusable disabled:opacity-50 flex items-center gap-2"
            tabIndex={0}
          >
            {isLoadingMore ? (
              <>
                <div className="w-4 h-4 border-2 border-zinc-500 border-t-emerald-500 rounded-full animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <ChevronsUpDown className="w-4 h-4" />
                Load More
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}