"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Play, Users, TrendingUp, ChevronLeft, ChevronRight } from "lucide-react";
import { getImageUrl, getMediaTitle } from "@/lib/tmdb";
import type { TMDBMediaItem } from "@/types";

const ROTATE_INTERVAL = 7000; // ms
const PAUSE_RESUME_DELAY = 3000; // ms after interaction

interface HeroCarouselProps {
  items: TMDBMediaItem[];
  onCreateRoom: (item: TMDBMediaItem) => void;
}

export default function HeroCarousel({ items, onCreateRoom }: HeroCarouselProps) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const pausedRef = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const itemsList = items.slice(0, 5);

  const nextSlide = useCallback(() => {
    if (itemsList.length === 0) return;
    setIsTransitioning(true);
    setCurrentIndex((currentIndex + 1) % itemsList.length);
    setTimeout(() => setIsTransitioning(false), 300);
  }, [currentIndex, itemsList.length]);

  const prevSlide = useCallback(() => {
    if (itemsList.length === 0) return;
    setIsTransitioning(true);
    setCurrentIndex((currentIndex - 1 + itemsList.length) % itemsList.length);
    setTimeout(() => setIsTransitioning(false), 300);
  }, [currentIndex, itemsList.length]);

  // Touch swipe support (phone/iPad)
  const touchStartX = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartX.current === null) return;
      const endX = e.changedTouches[0]?.clientX ?? null;
      if (endX === null) return;
      const delta = endX - touchStartX.current;
      if (Math.abs(delta) > 50) {
        if (delta < 0) nextSlide();
        else prevSlide();
      }
      touchStartX.current = null;
    },
    [nextSlide, prevSlide]
  );

  const goToSlide = useCallback(
    (index: number) => {
      if (index === currentIndex) return;
      setIsTransitioning(true);
      setCurrentIndex(index);
      setTimeout(() => setIsTransitioning(false), 300);
    },
    [currentIndex]
  );

  const pauseRotation = useCallback(() => {
    pausedRef.current = true;
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      pausedRef.current = false;
    }, PAUSE_RESUME_DELAY);
  }, []);

  const navigateItem = useCallback(
    (item: TMDBMediaItem) => {
      const mediaType = item.media_type || (item.title ? "movie" : "tv");
      router.push(`/watch/${item.id}?type=${mediaType}`);
    },
    [router]
  );

  // Auto-rotation
  useEffect(() => {
    if (itemsList.length < 2) return;
    const interval = setInterval(() => {
      if (pausedRef.current) return;
      nextSlide();
    }, ROTATE_INTERVAL);
    return () => clearInterval(interval);
  }, [itemsList.length, nextSlide]);

  if (itemsList.length === 0) return null;

  const heroItem = itemsList[currentIndex];

  return (
    <section
      className="relative w-full h-[45vh] sm:h-[55vh] lg:h-[65vh] xl:h-[70vh] min-h-[400px] max-h-[800px] overflow-hidden"
      onMouseEnter={pauseRotation}
      onFocus={pauseRotation}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={(e) => {
        // prevent pull-to-refresh interfering with swipe
        if (touchStartX.current !== null) e.preventDefault();
      }}
    >
      {/* Backdrop stack (cross-fade between slides) */}
      <div className="absolute inset-0">
        {itemsList.map((item, index) => (
          <div
            key={item.id}
            className={`absolute inset-0 transition-opacity duration-500 ${
              index === currentIndex ? "opacity-100" : "opacity-0"
            }`}
          >
            <img
              src={getImageUrl(item.backdrop_path, "original")}
              alt=""
              className={`w-full h-full object-cover ${
                index === currentIndex ? "animate-[kenburns_8s_ease-in-out]" : ""
              }`}
              loading={index <= 1 ? "eager" : "lazy"}
            />
          </div>
        ))}
        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-zinc-950/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-zinc-950/80 via-zinc-950/20 to-transparent" />
      </div>

      {/* Hero content */}
      <div
        key={heroItem.id}
        className={`relative z-10 h-full flex flex-col justify-end pb-10 sm:pb-16 px-4 sm:px-6 md:px-12 max-w-2xl animate-fade-in ${
          isTransitioning ? "opacity-80" : ""
        }`}
      >
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-emerald-500" />
          <span className="text-sm font-medium text-emerald-400">Trending Now</span>
        </div>
        <h1 className="text-2xl sm:text-3xl md:text-4xl xl:text-5xl font-bold tracking-tight text-zinc-50 mb-3 leading-tight">
          {getMediaTitle(heroItem)}
        </h1>
        {heroItem.overview && (
          <p className="text-sm sm:text-base text-zinc-300 leading-relaxed line-clamp-2 xl:line-clamp-3 mb-5">
            {heroItem.overview}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => navigateItem(heroItem)}
            className="flex items-center gap-2 px-5 py-2.5 sm:px-6 sm:py-3 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold rounded-xl transition-colors focusable"
            tabIndex={0}
          >
            <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-zinc-950" />
            Watch Now
          </button>
          <button
            onClick={() => onCreateRoom(heroItem)}
            className="flex items-center gap-2 px-4 py-2 sm:px-5 sm:py-2.5 bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-200 font-semibold rounded-xl backdrop-blur-sm transition-colors focusable"
            tabIndex={0}
          >
            <Users className="w-4 h-4 sm:w-5 sm:h-5" />
            Create Watch Party
          </button>
        </div>
      </div>

      {/* Slide controls (desktop click + TV D-Pad) */}
      {itemsList.length > 1 && (
        <div className="absolute right-3 bottom-3 flex flex-col items-end gap-2 z-20">
          <div className="flex items-center gap-2">
            <button
              onClick={prevSlide}
              className="text-zinc-300 hover:text-zinc-50 hover:bg-zinc-800/60 rounded-lg p-1.5 transition-colors focusable"
              aria-label="Previous hero slide"
              tabIndex={0}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex gap-1.5">
              {itemsList.map((item, index) => (
                <button
                  key={item.id}
                  onClick={() => goToSlide(index)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    index === currentIndex
                      ? "bg-emerald-500 scale-125"
                      : "bg-zinc-600 hover:bg-zinc-400"
                  } focusable`}
                  aria-label={`Slide ${index + 1}: ${getMediaTitle(item)}`}
                  tabIndex={0}
                >
                  <span className="sr-only">{getMediaTitle(item)}</span>
                </button>
              ))}
            </div>
            <button
              onClick={nextSlide}
              className="text-zinc-300 hover:text-zinc-50 hover:bg-zinc-800/60 rounded-lg p-1.5 transition-colors focusable"
              aria-label="Next hero slide"
              tabIndex={0}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// Ken Burns effect keyframes for hero backdrops
// (defined in globals.css as @keyframes kenburns)