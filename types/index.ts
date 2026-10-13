// Media types
export type MediaType = "movie" | "tv";

export interface TMDBMediaItem {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
  media_type?: MediaType;
  genre_ids: number[];
  genres?: TMDBGenre[];
  number_of_seasons?: number;
  status?: string;
  runtime?: number;
  original_language?: string;
}

export interface TMDBPaginatedResponse {
  page: number;
  results: TMDBMediaItem[];
  total_pages: number;
  total_results: number;
}

// Genres
export interface TMDBGenre {
  id: number;
  name: string;
}

export interface TMDBGenresResponse {
  genres: TMDBGenre[];
}

// TV Seasons & Episodes
export interface TMDBSeason {
  id: number;
  name: string;
  overview: string;
  season_number: number;
  episode_count: number;
  air_date: string | null;
  poster_path: string | null;
}

export interface TMDBEpisode {
  id: number;
  name: string;
  overview: string;
  episode_number: number;
  season_number: number;
  air_date: string | null;
  still_path: string | null;
  runtime: number | null;
  vote_average: number;
}

export interface TMDBTVSeasonsResponse {
  seasons: TMDBSeason[];
}

export interface TMDBSeasonEpisodesResponse {
  id: number;
  name: string;
  season_number: number;
  episodes: TMDBEpisode[];
}

// Room
export interface Room {
  room_id: string;
  tmdb_id: number;
  media_type: MediaType;
  season: number;
  episode: number;
  is_active: boolean;
  created_at: string;
}

// Watch Progress
export interface WatchProgress {
  id: string;
  user_id: string;
  tmdb_id: number;
  media_type: MediaType;
  season: number;
  episode: number;
  progress_seconds: number;
  duration_seconds: number;
  updated_at: string;
  /** Denormalized poster path for resume cards (optional) */
  poster_path?: string | null;
  /** Denormalized title for resume cards (optional) */
  title?: string | null;
}

// Sync Payloads
export interface SyncActionPayload {
  type: "SYNC_ACTION";
  action: "play" | "pause" | "seek";
  time?: number;
  senderId: string;
  tmdbId: number;
  mediaType: MediaType;
  season?: number;
  episode?: number;
  timestamp: number;
}

export interface LobbyUpdatePayload {
  type: "LOBBY_UPDATE";
  tmdbId: number;
  mediaType: MediaType;
  season: number;
  episode: number;
  title: string;
  posterPath: string | null;
  senderId: string;
  timestamp: number;
}

export type BroadcastPayload = SyncActionPayload | LobbyUpdatePayload;

// FrameXTV postMessage events
export interface FrameXTVTimeUpdate {
  event: "frameXTV:timeupdate";
  currentTime: number;
  duration: number;
  paused: boolean;
}

export interface FrameXTVAction {
  action: "play" | "pause" | "seek" | "seekBy" | "setVolume" | "mute" | "setProvider" | "setSubtitle";
  time?: number;
  seconds?: number;
  volume?: number;
  provider?: string;
  index?: number;
}