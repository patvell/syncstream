"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import MovieCard from "@/components/media/MovieCard";
import type { TMDBMediaItem } from "@/types";

interface MovieGridProps {
  title: string;
  items: TMDBMediaItem[];
  onSelect: (item: TMDBMediaItem) => void;
  /** "row" = horizontal scroll row (default), "grid" = dense responsive grid */
  layout?: "row" | "grid";
  /** Max items to show (row layout only) */
  limit?: number;
}

export default function MovieGrid({
  title,
  items,
  onSelect,
  layout = "row",
  limit = 20,
}: MovieGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const scrollAmount = 400;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  if (items.length === 0) return null;

  // Row layout
  if (layout === "row") {
    return (
      <section className="mb-8">
        <div className="flex items-center justify-between px-4 sm:px-6 mb-3">
          <h2 className="text-lg sm:text-xl font-semibold text-zinc-200 tracking-tight">
            {title}
          </h2>
          <div className="flex gap-1">
            <button
              onClick={() => scroll("left")}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors focusable"
              aria-label={`Scroll ${title} left`}
              tabIndex={0}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => scroll("right")}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors focusable"
              aria-label={`Scroll ${title} right`}
              tabIndex={0}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto px-4 sm:px-6 pb-2 hide-scrollbar"
        >
          {items.slice(0, limit).map((item) => (
            <MovieCard
              key={item.id}
              item={item}
              onClick={() => onSelect(item)}
              size="row"
            />
          ))}
        </div>
      </section>
    );
  }

  // Grid layout
  return (
    <section className="mb-8">
      <div className="flex items-center justify-between px-4 sm:px-6 mb-3">
        <h2 className="text-lg sm:text-xl font-semibold text-zinc-200 tracking-tight">
          {title}
        </h2>
      </div>

      <div className="px-4 sm:px-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
        {items.map((item) => (
          <MovieCard
            key={item.id}
            item={item}
            onClick={() => onSelect(item)}
            size="grid"
          />
        ))}
      </div>
    </section>
  );
}