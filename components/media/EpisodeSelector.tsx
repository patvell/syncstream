"use client";

import { useState, useEffect } from "react";
import { Play, ChevronDown } from "lucide-react";
import { getImageUrl } from "@/lib/tmdb";
import type { TMDBEpisode, TMDBSeason } from "@/types";

interface EpisodeSelectorProps {
  tmdbId: number;
  currentSeason: number;
  currentEpisode: number;
  onSelectEpisode: (season: number, episode: number) => void;
}

export default function EpisodeSelector({
  tmdbId,
  currentSeason,
  currentEpisode,
  onSelectEpisode,
}: EpisodeSelectorProps) {
  const [seasons, setSeasons] = useState<TMDBSeason[]>([]);
  const [episodes, setEpisodes] = useState<TMDBEpisode[]>([]);
  const [activeSeason, setActiveSeason] = useState(currentSeason);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);

  // Fetch season list once
  useEffect(() => {
    const fetchSeasons = async () => {
      try {
        const res = await fetch(`/api/tmdb/tv/${tmdbId}`);
        const data = await res.json();
        const seasonList = (data.seasons || [])
          .filter((s: TMDBSeason) => s.season_number > 0)
          .sort((a: TMDBSeason, b: TMDBSeason) => a.season_number - b.season_number);
        setSeasons(seasonList);
      } catch {
        setSeasons([]);
      }
    };
    fetchSeasons();
  }, [tmdbId]);

  // Fetch episodes for active season
  useEffect(() => {
    if (activeSeason < 1) return;
    const fetchEpisodes = async () => {
      setIsLoadingEpisodes(true);
      try {
        const res = await fetch(
          `/api/tmdb/tv/${tmdbId}/season/${activeSeason}`
        );
        const data = await res.json();
        setEpisodes(data.episodes || []);
      } catch {
        setEpisodes([]);
      } finally {
        setIsLoadingEpisodes(false);
      }
    };
    fetchEpisodes();
  }, [tmdbId, activeSeason]);

  // Adjust activeSeason during render if the current season isn't in the list
  // (React-idiomatic "derived state from props" pattern -- avoids effect setState)
  if (
    seasons.length > 0 &&
    !seasons.some((s) => s.season_number === activeSeason)
  ) {
    setActiveSeason(currentSeason);
  }

  return (
    <div className="space-y-3">
      {/* Season selector */}
      <div className="relative">
        <select
          value={activeSeason}
          onChange={(e) => setActiveSeason(Number(e.target.value))}
          className="appearance-none w-full h-10 bg-zinc-800 border border-zinc-700 rounded-lg pl-3 pr-8 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30"
          aria-label="Select season"
        >
          {seasons.map((s) => (
            <option key={s.id} value={s.season_number}>
              {s.name} ({s.episode_count} episodes)
            </option>
          ))}
        </select>
        <ChevronDown className="w-4 h-4 absolute right-2.5 top-3 text-zinc-500 pointer-events-none" />
      </div>

      {/* Episode grid */}
      {isLoadingEpisodes ? (
        <div className="py-6 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-zinc-600 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      ) : episodes.length === 0 ? (
        <p className="text-xs text-zinc-500 py-4">
          No episode list available for this season.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {episodes.map((ep) => {
            const isCurrent =
              ep.season_number === currentSeason &&
              ep.episode_number === currentEpisode;
            return (
              <button
                key={ep.id}
                onClick={() =>
                  onSelectEpisode(ep.season_number, ep.episode_number)
                }
                className={`focusable group relative rounded-lg overflow-hidden transition-all ${
                  isCurrent
                    ? "ring-2 ring-emerald-500"
                    : "ring-1 ring-zinc-700 hover:ring-emerald-500/50"
                }`}
                tabIndex={0}
                aria-label={`Episode ${ep.episode_number}: ${ep.name}`}
              >
                {/* Episode number badge (no thumb for many episodes) */}
                <div className="aspect-video bg-zinc-800 flex items-center justify-center relative">
                  {ep.still_path ? (
                    <img
                      src={getImageUrl(ep.still_path, "w342")}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-lg font-bold text-zinc-600">
                      {ep.episode_number}
                    </span>
                  )}
                  <div className="absolute inset-0 bg-black/30" />
                  {isCurrent && (
                    <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center">
                      <Play className="w-5 h-5 text-emerald-400 fill-emerald-400" />
                    </div>
                  )}
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent px-1.5 py-1">
                  <p className="text-[10px] text-zinc-300 truncate font-medium">
                    E{ep.episode_number} {ep.name}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}