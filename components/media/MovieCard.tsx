"use client";

import { getImageUrl, getMediaTitle, getMediaYear } from "@/lib/tmdb";
import type { TMDBMediaItem } from "@/types";
import { Star } from "lucide-react";

interface MovieCardProps {
  item: TMDBMediaItem;
  onClick?: () => void;
  /** "row" = horizontal-scroll row card (fixed-ish, fluid), "grid" = dense grid cell */
  size?: "row" | "grid";
}

export default function MovieCard({
  item,
  onClick,
  size = "row",
}: MovieCardProps) {
  const title = getMediaTitle(item);
  const year = getMediaYear(item);
  const rating = item.vote_average ? item.vote_average.toFixed(1) : null;

  const cardClass =
    size === "row"
      ? "focusable group relative flex-shrink-0 w-[44vw] sm:w-[200px] md:w-[190px] lg:w-[180px] xl:w-[170px] 2xl:w-[160px] cursor-pointer transition-transform duration-200 hover:scale-[1.03]"
      : "focusable group relative w-full cursor-pointer transition-transform duration-200 hover:scale-[1.03]";

  return (
    <div
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onClick) onClick();
      }}
      className={cardClass}
      tabIndex={0}
      role="button"
      aria-label={`${title}${year !== "—" ? `, ${year}` : ""}`}
    >
      {/* Poster */}
      <div
        className={`relative aspect-[2/3] rounded-xl overflow-hidden bg-zinc-800 shadow-lg transition-shadow group-hover:shadow-emerald-500/20 ${
          size === "grid" ? "group-hover:ring-4 group-hover:ring-emerald-500" : ""
        }`}
      >
        <img
          src={getImageUrl(item.poster_path, "w342")}
          alt={title}
          className="w-full h-full object-cover transition-opacity duration-300 group-hover:opacity-90"
          loading="lazy"
        />
        {rating && (
          <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm rounded-lg px-2 py-0.5 flex items-center gap-1 text-xs font-medium">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
            <span className="text-amber-100">{rating}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Title & Year */}
      <div className={`mt-2 px-0.5 ${
        size === "grid" ? "line-clamp-2" : ""
      }`}>
        <p
          className={`text-sm font-medium text-zinc-200 leading-tight ${
            size === "row" ? "truncate" : "line-clamp-2"
          }`}
        >
          {title}
        </p>
        <p className="text-xs text-zinc-500 mt-0.5">{year}</p>
      </div>
    </div>
  );
}