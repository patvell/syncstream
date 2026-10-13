import type {
  TMDBMediaItem,
  TMDBPaginatedResponse,
  TMDBGenresResponse,
  TMDBTVSeasonsResponse,
  TMDBSeasonEpisodesResponse,
} from "@/types";

const TMDB_API_BASE = process.env.TMDB_API_BASE_URL || "https://api.themoviedb.org/3";
const TMDB_API_KEY = process.env.TMDB_API_KEY;

export function getImageUrl(path: string | null, size: "w342" | "w500" | "w780" | "original" = "w500"): string {
  if (!path) return "/placeholder-poster.svg";
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

export function getMediaTitle(item: TMDBMediaItem): string {
  return item.title || item.name || "Untitled";
}

export function getMediaYear(item: TMDBMediaItem): string {
  const date = item.release_date || item.first_air_date;
  return date ? new Date(date).getFullYear().toString() : "—";
}

// These are server-side helpers used by the proxy route
export async function fetchTrending(
  mediaType: "all" | "movie" | "tv" = "all",
  timeWindow: "day" | "week" = "week"
): Promise<TMDBPaginatedResponse> {
  const res = await fetch(
    `${TMDB_API_BASE}/trending/${mediaType}/${timeWindow}?api_key=${TMDB_API_KEY}`
  );
  if (!res.ok) throw new Error(`TMDB API error: ${res.status}`);
  return res.json();
}

export async function fetchPopular(
  mediaType: "movie" | "tv",
  page: number = 1
): Promise<TMDBPaginatedResponse> {
  const res = await fetch(
    `${TMDB_API_BASE}/${mediaType}/popular?api_key=${TMDB_API_KEY}&page=${page}`
  );
  if (!res.ok) throw new Error(`TMDB API error: ${res.status}`);
  return res.json();
}

export async function searchMulti(query: string): Promise<TMDBPaginatedResponse> {
  const res = await fetch(
    `${TMDB_API_BASE}/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`
  );
  if (!res.ok) throw new Error(`TMDB API error: ${res.status}`);
  return res.json();
}

export async function fetchMediaDetails(
  mediaType: "movie" | "tv",
  id: number
): Promise<TMDBMediaItem> {
  const res = await fetch(
    `${TMDB_API_BASE}/${mediaType}/${id}?api_key=${TMDB_API_KEY}`
  );
  if (!res.ok) throw new Error(`TMDB API error: ${res.status}`);
  return res.json();
}

// ---------- Discover / Browse ----------
export interface DiscoverParams {
  mediaType: "movie" | "tv";
  genreId?: number;
  sortBy?: string;
  page?: number;
  year?: number;
}

export async function fetchDiscover({
  mediaType,
  genreId,
  sortBy = "popularity.desc",
  page = 1,
  year,
}: DiscoverParams): Promise<TMDBPaginatedResponse> {
  const params = new URLSearchParams({
    api_key: TMDB_API_KEY!,
    sort_by: sortBy,
    page: String(page),
    [mediaType === "movie" ? "primary_release_year" : "first_air_date_year"]:
      year ? String(year) : "",
  });

  if (genreId) params.set("with_genres", String(genreId));

  const res = await fetch(`${TMDB_API_BASE}/discover/${mediaType}?${params}`);
  if (!res.ok) throw new Error(`TMDB API error: ${res.status}`);
  return res.json();
}

export async function fetchGenres(
  mediaType: "movie" | "tv"
): Promise<TMDBGenresResponse> {
  const res = await fetch(
    `${TMDB_API_BASE}/genre/${mediaType}/list?api_key=${TMDB_API_KEY}`
  );
  if (!res.ok) throw new Error(`TMDB API error: ${res.status}`);
  return res.json();
}

// ---------- TV Seasons & Episodes ----------
export async function fetchTVSeasons(
  tmdbId: number
): Promise<TMDBTVSeasonsResponse> {
  const res = await fetch(
    `${TMDB_API_BASE}/tv/${tmdbId}?api_key=${TMDB_API_KEY}`
  );
  if (!res.ok) throw new Error(`TMDB API error: ${res.status}`);
  return res.json();
}

export async function fetchSeasonEpisodes(
  tmdbId: number,
  seasonNumber: number
): Promise<TMDBSeasonEpisodesResponse> {
  const res = await fetch(
    `${TMDB_API_BASE}/tv/${tmdbId}/season/${seasonNumber}?api_key=${TMDB_API_KEY}`
  );
  if (!res.ok) throw new Error(`TMDB API error: ${res.status}`);
  return res.json();
}