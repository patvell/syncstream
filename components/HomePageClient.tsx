"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Users, Clock } from "lucide-react";
import HeroCarousel from "@/components/media/HeroCarousel";
import MovieGrid from "@/components/media/MovieGrid";
import ResumeCard from "@/components/media/ResumeCard";
import FilterBar from "@/components/layout/FilterBar";
import type { MediaFilter } from "@/components/layout/FilterBar";
import { useSpatialNav } from "@/hooks/useSpatialNav";
import type { TMDBMediaItem, WatchProgress } from "@/types";

interface HomePageProps {
  trending: TMDBMediaItem[];
  popularMovies: TMDBMediaItem[];
  popularTV: TMDBMediaItem[];
  continueWatchingEntries: WatchProgress[];
  movieGenres: { id: number; name: string }[];
  tvGenres: { id: number; name: string }[];
}

export default function HomePageClient({
  trending,
  popularMovies,
  popularTV,
  continueWatchingEntries,
  movieGenres,
  tvGenres,
}: HomePageProps) {
  const router = useRouter();
  useSpatialNav({ debounceTime: 80 });

  // Homepage in-place filter (does NOT navigate away)
  const [activeFilter, setActiveFilter] = useState<MediaFilter>("all");

  // Resume entries -- hydrate from the API (server can't read cookie in page)
  const [resumeEntries, setResumeEntries] = useState<WatchProgress[]>(
    continueWatchingEntries || []
  );

  useEffect(() => {
    const fetchResume = async () => {
      try {
        const res = await fetch("/api/watch/progress?limit=8");
        const data = await res.json();
        if (data.entries?.length) setResumeEntries(data.entries);
      } catch {
        // noop
      }
    };
    fetchResume();
  }, []);

  const resumeToWatch = useCallback(
    (entry: WatchProgress) => {
      router.push(
        `/watch/${entry.tmdb_id}?type=${entry.media_type}&season=${entry.season}&episode=${entry.episode}&resume=${entry.progress_seconds}`
      );
    },
    [router]
  );

  const handleFilterChange = useCallback((filter: MediaFilter) => {
    setActiveFilter(filter);
  }, []);

  const navigateToWatch = useCallback(
    (item: TMDBMediaItem) => {
      const mediaType = item.media_type || (item.title ? "movie" : "tv");
      router.push(`/watch/${item.id}?type=${mediaType}`);
    },
    [router]
  );

  const createRoom = useCallback(() => {
    const roomId = crypto.randomUUID();
    router.push(`/room/${roomId}`);
  }, [router]);

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* ========== HERO CAROUSEL ========== */}
      <HeroCarousel items={trending} onCreateRoom={createRoom} />

      {/* ========== CONTINUE WATCHING ========== */}
      {resumeEntries.length > 0 && (
        <section className="px-4 sm:px-6 pt-6 mb-2">
          <div className="flex items-center gap-3 mb-3">
            <Clock className="w-5 h-5 text-emerald-500" />
            <h2 className="text-lg font-semibold text-zinc-200">
              Continue Watching
            </h2>
            <a
              href="/history"
              className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors ml-auto focusable rounded px-2 py-1"
              tabIndex={0}
            >
              View history
            </a>
          </div>
          <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-1">
            {resumeEntries.slice(0, 8).map((entry) => (
              <ResumeCard
                key={`${entry.tmdb_id}-${entry.season}-${entry.episode}`}
                entry={entry}
                onClick={() => resumeToWatch(entry)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ========== FILTER BAR ========== */}
      <FilterBar
        movieGenres={movieGenres}
        tvGenres={tvGenres}
        onFilterChange={handleFilterChange}
      />

      {/* ========== CATEGORY ROWS ========== */}
      <div className="pt-2 pb-16">
        {activeFilter === "all" && (
          <>
            {trending.length > 0 && (
              <MovieGrid
                title="Trending This Week"
                items={trending.slice(1, 21)}
                onSelect={navigateToWatch}
              />
            )}
            {popularMovies.length > 0 && (
              <MovieGrid
                title="Popular Movies"
                items={popularMovies.slice(0, 20)}
                onSelect={navigateToWatch}
              />
            )}
            {popularTV.length > 0 && (
              <MovieGrid
                title="Popular TV Shows"
                items={popularTV.slice(0, 20)}
                onSelect={navigateToWatch}
              />
            )}
          </>
        )}
        {activeFilter === "movie" && (
          <>
            {trending.length > 0 && (
              <MovieGrid
                title="Trending Movies"
                items={trending.filter((t) => !t.name).slice(0, 21)}
                onSelect={navigateToWatch}
              />
            )}
            {popularMovies.length > 0 && (
              <MovieGrid
                title="Popular Movies"
                items={popularMovies.slice(0, 20)}
                onSelect={navigateToWatch}
              />
            )}
          </>
        )}
        {activeFilter === "tv" && (
          <>
            {trending.length > 0 && (
              <MovieGrid
                title="Trending TV"
                items={trending.filter((t) => t.name).slice(0, 21)}
                onSelect={navigateToWatch}
              />
            )}
            {popularTV.length > 0 && (
              <MovieGrid
                title="Popular TV Shows"
                items={popularTV.slice(0, 20)}
                onSelect={navigateToWatch}
              />
            )}
          </>
        )}
      </div>

      {/* ========== CREATE ROOM CTA (bottom) ========== */}
      <section className="px-4 sm:px-6 pb-16">
        <div className="bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 rounded-2xl p-6 sm:p-8 max-w-2xl">
          <div className="flex items-center gap-3 mb-3">
            <Users className="w-6 h-6 text-emerald-500" />
            <h2 className="text-lg font-semibold text-zinc-200">
              Watch Together
            </h2>
          </div>
          <p className="text-sm text-zinc-400 mb-4">
            Create a room, share the link, and watch synchronized with friends
            across any device. Smart TV, mobile, tablet — all in sync.
          </p>
          <button
            onClick={createRoom}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold rounded-xl transition-colors focusable"
            tabIndex={0}
          >
            <Users className="w-4 h-4" />
            Create a Room
          </button>
        </div>
      </section>
    </div>
  );
}