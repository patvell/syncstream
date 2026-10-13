import { Suspense } from "react";
import BrowsePageClient from "@/components/BrowsePageClient";
import type { TMDBGenre, TMDBMediaItem } from "@/types";

const TMDB_BASE = "https://api.themoviedb.org/3";

interface DiscoverShape {
  results?: TMDBMediaItem[];
  total_pages?: number;
}

interface GenresShape {
  genres?: TMDBGenre[];
}

async function fetchJSON<T>(path: string): Promise<T> {
  const separator = path.includes("?") ? "&" : "?";
  const res = await fetch(
    `${TMDB_BASE}${path}${separator}api_key=${process.env.TMDB_API_KEY}`,
    { next: { revalidate: 3600 } }
  );
  if (!res.ok) return {} as T;
  return res.json();
}

async function LoadedBrowse({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    genre?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  const { type = "movie", genre, sort = "popularity.desc", page = "1" } =
    await searchParams;

  const mediaType: "movie" | "tv" = type === "tv" ? "tv" : "movie";
  const genreId = genre ? Number(genre) : null;

  const discoverParams = new URLSearchParams({
    sort_by: sort,
    page,
  });
  if (genreId) discoverParams.set("with_genres", String(genreId));

  const [discover, movieGenres, tvGenres] = await Promise.all([
    fetchJSON<DiscoverShape>(
      `/discover/${mediaType}?${discoverParams.toString()}`
    ),
    fetchJSON<GenresShape>("/genre/movie/list"),
    fetchJSON<GenresShape>("/genre/tv/list"),
  ]);

  const results = (discover.results as TMDBMediaItem[]) || [];
  const totalPages = discover.total_pages || 1;

  return (
    <BrowsePageClient
      results={results}
      totalPages={totalPages}
      mediaType={mediaType}
      currentGenre={genreId}
      sortBy={sort}
      movieGenres={movieGenres.genres || []}
      tvGenres={tvGenres.genres || []}
    />
  );
}

function BrowseLoading() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-zinc-600 border-t-emerald-500 rounded-full animate-spin" />
        <p className="text-sm text-zinc-500">Loading titles...</p>
      </div>
    </div>
  );
}

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    genre?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  return (
    <Suspense fallback={<BrowseLoading />}>
      <LoadedBrowse searchParams={searchParams} />
    </Suspense>
  );
}