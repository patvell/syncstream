"use client";

import { getImageUrl } from "@/lib/tmdb";
import { Play } from "lucide-react";
import type { WatchProgress } from "@/types";

interface ResumeCardProps {
  entry: WatchProgress;
  onClick: () => void;
}

export default function ResumeCard({ entry, onClick }: ResumeCardProps) {
  const {
    tmdb_id,
    media_type,
    season,
    episode,
    progress_seconds,
    duration_seconds,
    poster_path,
    title,
  } = entry;

  const pct =
    duration_seconds > 0
      ? Math.min(100, Math.round((progress_seconds / duration_seconds) * 100))
      : 0;

  const label = media_type === "tv" ? `S${season} E${episode}` : "Movie";

  return (
    <div
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter") onClick();
      }}
      className="focusable group relative w-[140px] sm:w-[160px] md:w-[180px] flex-shrink-0 cursor-pointer transition-transform duration-200 hover:scale-[1.03]"
      tabIndex={0}
      role="button"
      aria-label={`Resume ${label}: ${title || tmdb_id}`}
    >
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-zinc-800 shadow-lg">
        <img
          src={getImageUrl(poster_path ?? null, "w342")}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
        />
        {/* Dark overlay + play icon */}
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-emerald-500/90 flex items-center justify-center shadow-lg">
            <Play className="w-5 h-5 fill-zinc-950 ml-0.5" />
          </div>
        </div>
        {/* Label badge */}
        <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm rounded px-1.5 py-0.5 text-[10px] text-zinc-200 font-medium">
          {label}
        </div>
        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-zinc-800">
          <div
            className="h-full bg-emerald-500 rounded-full"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      {/* Title */}
      <p className="mt-2 text-xs sm:text-sm font-medium text-zinc-300 truncate leading-tight">
        {title || "Continue Watching"}
      </p>
    </div>
  );
}