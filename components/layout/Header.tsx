"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Search, X, Film, History } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { TMDBMediaItem } from "@/types";
import { getImageUrl, getMediaTitle, getMediaYear } from "@/lib/tmdb";

export default function Header() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<TMDBMediaItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Derived-state: when the query drops below the search threshold, treat
  // results as empty for rendering WITHOUT calling setState during render.
  const shownResults =
    !searchQuery.trim() || searchQuery.trim().length < 2 ? [] : results;

  useEffect(() => {
    if (searchOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [searchOpen]);

  // Debounced search. setState happens inside the debounce timeout (async)
  // after a user-gesture-driven query change -- not a sync render cascade.
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(
          `/api/tmdb/search/multi?query=${encodeURIComponent(searchQuery.trim())}`
        );
        const data = await res.json();
        const filtered = (data.results || []).filter(
          (r: TMDBMediaItem) =>
            r.media_type === "movie" || r.media_type === "tv"
        );
        setResults(filtered.slice(0, 8));
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  // Close search on outside click
  useEffect(() => {
    if (!searchOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        resultsRef.current &&
        !resultsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        // Don't close if clicking inside the form area
        const target = e.target as HTMLElement;
        if (target.closest("form") || target.closest('[role="listbox"]')) return;
        setSearchOpen(false);
        setSearchQuery("");
        setResults([]);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [searchOpen]);

  const navigateToItem = useCallback(
    (item: TMDBMediaItem) => {
      const mediaType = item.media_type || (item.title ? "movie" : "tv");
      setSearchOpen(false);
      setSearchQuery("");
      setResults([]);
      router.push(`/watch/${item.id}?type=${mediaType}`);
    },
    [router]
  );

  const navigateToSearch = useCallback(() => {
    if (!searchQuery.trim()) return;
    setSearchOpen(false);
    setSearchQuery("");
    setResults([]);
    router.push(`/?search=${encodeURIComponent(searchQuery.trim())}`);
  }, [router, searchQuery]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery("");
    setResults([]);
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-zinc-950/80 backdrop-blur-header border-b border-zinc-800/50">
      <div className="h-full max-w-[1800px] mx-auto px-4 sm:px-6 flex items-center justify-between">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2.5 text-zinc-50 hover:text-emerald-400 transition-colors focusable rounded-lg px-2 py-1"
          tabIndex={0}
        >
          <Film className="w-6 h-6 text-emerald-500" />
          <span className="text-lg font-bold tracking-tight">SYNCSTREAM</span>
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {searchOpen ? (
            <div className="relative">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  navigateToSearch();
                }}
                className="flex items-center gap-2"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search movies & TV..."
                  className="w-48 sm:w-64 h-10 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 transition-colors"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") closeSearch();
                  }}
                />
                <button
                  type="button"
                  onClick={closeSearch}
                  className="p-2 text-zinc-400 hover:text-zinc-200 transition-colors"
                  aria-label="Close search"
                >
                  <X className="w-5 h-5" />
                </button>
              </form>

              {/* Results dropdown */}
              {(shownResults.length > 0 || isSearching) && (
                <div
                  ref={resultsRef}
                  className="absolute top-full mt-2 right-0 w-72 sm:w-80 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl shadow-black/50 overflow-hidden animate-fade-in z-50"
                >
                  {isSearching ? (
                    <div className="p-4 flex items-center gap-2 text-sm text-zinc-400">
                      <div className="w-4 h-4 border-2 border-zinc-600 border-t-emerald-500 rounded-full animate-spin" />
                      Searching...
                    </div>
                  ) : (
                    <>
                      {shownResults.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => navigateToItem(item)}
                          className="w-full flex items-center gap-3 p-3 hover:bg-zinc-800/60 transition-colors text-left focusable"
                          tabIndex={0}
                        >
                          <img
                            src={getImageUrl(item.poster_path, "w342")}
                            alt=""
                            className="w-10 h-14 rounded object-cover bg-zinc-800 flex-shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-zinc-200 truncate">
                              {getMediaTitle(item)}
                            </p>
                            <p className="text-xs text-zinc-500">
                              {getMediaYear(item)}
                              {(item.media_type || (item.title ? "movie" : "tv")) === "tv"
                                ? " · TV"
                                : " · Movie"}
                            </p>
                          </div>
                        </button>
                      ))}
                      <button
                        onClick={navigateToSearch}
                        className="w-full flex items-center justify-center gap-2 p-3 text-sm text-emerald-400 hover:bg-zinc-800/60 transition-colors border-t border-zinc-800 focusable"
                        tabIndex={0}
                      >
                        <Search className="w-4 h-4" />
                        See all results for &ldquo;{searchQuery}&rdquo;
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              <Link
                href="/history"
                className="p-2.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 rounded-lg transition-all focusable"
                aria-label="Watch history"
                tabIndex={0}
              >
                <History className="w-5 h-5" />
              </Link>
              <button
                onClick={() => setSearchOpen(true)}
                className="p-2.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 rounded-lg transition-all focusable"
                aria-label="Search"
                tabIndex={0}
              >
                <Search className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}