import { Suspense } from "react";
import WatchPageClient from "@/components/WatchPageClient";
import type { TMDBMediaItem } from "@/types";

export const instant = false;

async function fetchMediaDetail(
  id: number,
  type: string
): Promise<TMDBMediaItem | null> {
  const base = "https://api.themoviedb.org/3";
  try {
    const res = await fetch(
      `${base}/${type}/${id}?api_key=${process.env.TMDB_API_KEY}`,
      { next: { revalidate: 86400 } }
    );

    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function WatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ tmdbId: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { tmdbId } = await params;
  const { type = "movie" } = await searchParams;

  const media = await fetchMediaDetail(Number(tmdbId), type);

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-2 border-zinc-600 border-t-emerald-500 rounded-full animate-spin" />
            <p className="text-sm text-zinc-500">Loading player...</p>
          </div>
        </div>
      }
    >
      <WatchPageClient media={media} />
    </Suspense>
  );
}