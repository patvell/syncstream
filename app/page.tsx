import { Suspense } from "react";
import HomePageClient from "@/components/HomePageClient";
import type { TMDBMediaItem, TMDBGenre } from "@/types";

async function fetchTMDB<T>(path: string): Promise<T> {
  const base = "https://api.themoviedb.org/3";
  const res = await fetch(
    `${base}${path}?api_key=${process.env.TMDB_API_KEY}`,
    { next: { revalidate: 3600 } }
  );

  if (!res.ok) return {} as T;
  return res.json();
}

interface ResultsShape {
  results?: TMDBMediaItem[];
  genres?: TMDBGenre[];
}

async function LoadedContent() {
  const [trendingData, moviesData, tvData, movieGenreData, tvGenreData] =
    await Promise.all([
      fetchTMDB<ResultsShape>("/trending/all/week"),
      fetchTMDB<ResultsShape>("/movie/popular"),
      fetchTMDB<ResultsShape>("/tv/popular"),
      fetchTMDB<ResultsShape>("/genre/movie/list"),
      fetchTMDB<ResultsShape>("/genre/tv/list"),
    ]);

  const trending: TMDBMediaItem[] = trendingData.results ?? [];
  const popularMovies: TMDBMediaItem[] = moviesData.results ?? [];
  const popularTV: TMDBMediaItem[] = tvData.results ?? [];
  const movieGenres: TMDBGenre[] = movieGenreData.genres ?? [];
  const tvGenres: TMDBGenre[] = tvGenreData.genres ?? [];

  // "Continue Watching" entries -- fetched client-side via /api/watch/progress
  // (server can't read the cookie easily; pass an empty array here, the client
  //  hydrates it in an effect). We fetch the latest here if cookie present via
  //  headers is not available in this context, so we defer to the client.

  return (
    <HomePageClient
      trending={trending}
      popularMovies={popularMovies}
      popularTV={popularTV}
      movieGenres={movieGenres}
      tvGenres={tvGenres}
      continueWatchingEntries={[]}
    />
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-zinc-950 pt-20">
      <div className="w-full h-[70vh] bg-zinc-900 animate-pulse mb-8" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="px-4 sm:px-6 mb-8">
          <div className="h-6 w-48 bg-zinc-800 rounded animate-pulse mb-3" />
          <div className="flex gap-3 overflow-hidden">
            {Array.from({ length: 7 }).map((_, j) => (
              <div
                key={j}
                className="flex-shrink-0 w-[160px] sm:w-[180px] aspect-[2/3] bg-zinc-800 rounded-xl animate-pulse"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <LoadedContent />
    </Suspense>
  );
}