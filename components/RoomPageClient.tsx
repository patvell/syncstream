"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import {
  Users,
  Play,
  Search,
  ArrowLeft,
  Copy,
  Check,
  Film,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import FrameXTVPlayer from "@/components/player/FrameXTVPlayer";
import type { PlayerController } from "@/components/player/FrameXTVPlayer";
import useWatchPartySync from "@/hooks/useWatchPartySync";
import useWatchProgress from "@/hooks/useWatchProgress";
import type {
  TMDBMediaItem,
  FrameXTVTimeUpdate,
  MediaType,
} from "@/types";
import { getImageUrl, getMediaTitle } from "@/lib/tmdb";

export default function RoomPageClient() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const roomId = params.roomId as string;
  const initialTmdbId = searchParams.get("tmdbId");
  const initialType = (searchParams.get("type") as MediaType) || "movie";
  const initialSeason = Number(searchParams.get("season")) || 1;
  const initialEpisode = Number(searchParams.get("episode")) || 1;

  // Room state
  const [hasJoined, setHasJoined] = useState(false);
  const [copied, setCopied] = useState(false);

  // Content selection state (lobby or current)
  const [selectedTmdbId, setSelectedTmdbId] = useState<number | null>(
    initialTmdbId ? Number(initialTmdbId) : null
  );
  const [selectedMediaType, setSelectedMediaType] =
    useState<MediaType>(initialType);
  const [selectedSeason, setSelectedSeason] = useState(initialSeason);
  const [selectedEpisode, setSelectedEpisode] = useState(initialEpisode);
  const [selectedTitle, setSelectedTitle] = useState("");
  const [selectedPoster, setSelectedPoster] = useState<string | null>(null);
  // Mirror of selectedTmdbId for use inside callbacks without stale closures.
  const selectedTmdbIdRef = useRef<number | null>(
    initialTmdbId ? Number(initialTmdbId) : null
  );
  useEffect(() => {
    selectedTmdbIdRef.current = selectedTmdbId;
  }, [selectedTmdbId]);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<TMDBMediaItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Player
  const playerRef = useRef<PlayerController>(null!);
  const lastPlayBcastRef = useRef(false);
  // Position to start a freshly-mounted player at (set by sync_state for late
  // joiners; read once when the player mounts via its startTime prop). State
  // (not a ref) because it feeds render; only meaningful before mount.
  const [pendingSeek, setPendingSeek] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const {
    isSynced,
    joinSync,
    broadcastSync,
    broadcastLobby,
    lobbyContent,
    setLocalState,
    peerCount,
  } = useWatchPartySync({
    roomId,
    playerRef,
    // Adopt the room's authoritative state. Content is applied ONLY when this
    // device has no content yet (before its player mounts) -- changing content
    // on a mounted player would destroy the iframe. Position always applies.
    onApplyState: (state) => {
      if (selectedTmdbIdRef.current === null && state.tmdbId) {
        // Late joiner: adopt content from the room, no player mounted yet.
        setSelectedTmdbId(state.tmdbId);
        if (state.mediaType) setSelectedMediaType(state.mediaType);
        if (state.season) setSelectedSeason(state.season);
        if (state.episode) setSelectedEpisode(state.episode);
      }
      if (state.time !== undefined) {
        setPendingSeek(state.time);
        playerRef.current?.seek(state.time);
      }
      if (state.playing) {
        playerRef.current?.play();
      } else {
        playerRef.current?.pause();
      }
    },
  });

  const { updateProgress, startSync, stopSync } = useWatchProgress({
    tmdbId: selectedTmdbId ?? undefined,
    mediaType: selectedMediaType,
    season: selectedSeason,
    episode: selectedEpisode,
    posterPath: selectedPoster,
    title: selectedTitle || undefined,
  });

  // Copy room link -- share a CLEAN url (no tmdbId query params) so the link
  // is short. Peers pick up content + position via realtime sync_state.
  const copyRoomLink = useCallback(() => {
    const cleanUrl = `${window.location.origin}/room/${roomId}`;
    navigator.clipboard.writeText(cleanUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [roomId]);

  // Handle incoming lobby updates (real-time broadcast from other devices).
  // setState below is driven by an async realtime subscription event, which
  // is the sanctioned way to react to external systems -- not a cascading render.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (lobbyContent && !hasJoined) {
      setSelectedTmdbId(lobbyContent.tmdbId);
      setSelectedMediaType(lobbyContent.mediaType);
      setSelectedSeason(lobbyContent.season);
      setSelectedEpisode(lobbyContent.episode);
      setSelectedTitle(lobbyContent.title);
      setSelectedPoster(lobbyContent.posterPath);
    }
  }, [lobbyContent, hasJoined]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Handle time updates
  const handleTimeUpdate = useCallback(
    (data: FrameXTVTimeUpdate) => {
      setCurrentTime(data.currentTime);
      setDuration(data.duration);
      const playing = !data.paused;
      setIsPlaying(playing);
      updateProgress(data.currentTime, data.duration);
      // Keep our authoritative snapshot fresh so a joiner can be synced to us.
      setLocalState({
        tmdbId: selectedTmdbId ?? undefined,
        time: data.currentTime,
        playing,
      });

      // Broadcast play/pause only when the state actually TRANSITIONS (avoids
      // spamming the channel every ~250ms while playing normally).
      if (isSynced && playing !== lastPlayBcastRef.current) {
        lastPlayBcastRef.current = playing;
        broadcastSync(
          playing ? "play" : "pause",
          data.currentTime,
          selectedTmdbId ?? 0,
          selectedMediaType,
          selectedSeason,
          selectedEpisode
        );
      }
    },
    [updateProgress, isSynced, broadcastSync, selectedTmdbId, selectedMediaType, selectedSeason, selectedEpisode, setLocalState]
  );

  // Sync progress
  useEffect(() => {
    if (isSynced && isPlaying) {
      startSync();
    } else {
      stopSync();
    }
  }, [isSynced, isPlaying, startSync, stopSync]);

  // Persist the room in active_rooms (so we can see/recover rooms later).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!roomId || !selectedTmdbId) return;
    const run = async () => {
      try {
        await supabase.from("active_rooms").upsert(
          {
            room_id: roomId,
            tmdb_id: selectedTmdbId,
            media_type: selectedMediaType,
            season: selectedSeason,
            episode: selectedEpisode,
            is_active: true,
            created_at: new Date().toISOString(),
          },
          { onConflict: "room_id" }
        );
      } catch {
        // best-effort
      }
    };
    run();
    return () => {
      const deactivate = async () => {
        try {
          await supabase
            .from("active_rooms")
            .update({ is_active: false })
            .eq("room_id", roomId);
        } catch {
          // best-effort
        }
      };
      deactivate();
    };
  }, [roomId, selectedTmdbId, selectedMediaType, selectedSeason, selectedEpisode]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Publish our initial content into the authoritative snapshot so late joiners
  // (who arrive with a clean link) can be synced to it. Runs once on mount.
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (selectedTmdbId) {
      setLocalState({
        tmdbId: selectedTmdbId,
        mediaType: selectedMediaType,
        season: selectedSeason,
        episode: selectedEpisode,
        time: pendingSeek,
        playing: false,
      });
    }
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

  // Search
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
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
      setSearchResults(filtered);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  // Select content from lobby
  const selectContent = useCallback(
    (item: TMDBMediaItem) => {
      const mType: MediaType = item.media_type || (item.title ? "movie" : "tv");
      const title = getMediaTitle(item);

      setSelectedTmdbId(item.id);
      setSelectedMediaType(mType);
      setSelectedSeason(1);
      setSelectedEpisode(1);
      setSelectedTitle(title);
      setSelectedPoster(item.poster_path);

      // Broadcast lobby update to all peers
      broadcastLobby({
        tmdbId: item.id,
        mediaType: mType,
        season: 1,
        episode: 1,
        title,
        posterPath: item.poster_path,
      });

      // Also refresh our authoritative snapshot so a late joiner can be synced
      // to this content even before playback starts.
      setLocalState({
        tmdbId: item.id,
        mediaType: mType,
        season: 1,
        episode: 1,
        time: 0,
        playing: false,
      });

      setSearchResults([]);
      setSearchQuery("");
    },
    [broadcastLobby, setLocalState]
  );

  // Handle join sync -- request the room's authoritative state on join so the
  // player snaps to what's already playing (fixes "nothing plays" on join).
  const handleJoinSync = useCallback(() => {
    setHasJoined(true);
    joinSync({
      tmdbId: selectedTmdbId ?? undefined,
      mediaType: selectedMediaType,
      season: selectedSeason,
      episode: selectedEpisode,
      time: currentTime,
      playing: isPlaying,
    });
  }, [joinSync, selectedTmdbId, selectedMediaType, selectedSeason, selectedEpisode, currentTime, isPlaying]);

  // Handle player controls broadcast (when synced)
  const handlePlay = useCallback(() => {
    playerRef.current?.play();
    if (isSynced) {
      broadcastSync("play", currentTime, selectedTmdbId ?? 0, selectedMediaType, selectedSeason, selectedEpisode);
    }
  }, [isSynced, currentTime, selectedTmdbId, selectedMediaType, selectedSeason, selectedEpisode, broadcastSync]);

  const handlePause = useCallback(() => {
    playerRef.current?.pause();
    if (isSynced) {
      broadcastSync("pause", currentTime, selectedTmdbId ?? 0, selectedMediaType, selectedSeason, selectedEpisode);
    }
  }, [isSynced, currentTime, selectedTmdbId, selectedMediaType, selectedSeason, selectedEpisode, broadcastSync]);

  const handleSeek = useCallback(
    (time: number) => {
      playerRef.current?.seek(time);
      if (isSynced) {
        broadcastSync("seek", time, selectedTmdbId ?? 0, selectedMediaType, selectedSeason, selectedEpisode);
      }
    },
    [isSynced, selectedTmdbId, selectedMediaType, selectedSeason, selectedEpisode, broadcastSync]
  );

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* ===== ROOM HEADER ===== */}
      <div className="sticky top-16 z-40 bg-zinc-950/90 backdrop-blur-header border-b border-zinc-800/50">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="text-zinc-400 hover:text-zinc-200 transition-colors focusable rounded-lg p-1.5"
              tabIndex={0}
              aria-label="Back to browse"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-500" />
                <h1 className="text-sm font-semibold text-zinc-200">
                  Room:{" "}
                  <span className="font-mono text-zinc-400">
                    {roomId.slice(0, 8)}
                  </span>
                </h1>
                {isSynced && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full font-medium">
                    LIVE
                  </span>
                )}
                {peerCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded-full font-medium">
                    {peerCount + 1} in room
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={copyRoomLink}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors focusable rounded-lg px-3 py-1.5 bg-zinc-800/60 hover:bg-zinc-700/60"
            tabIndex={0}
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            {copied ? "Copied!" : "Copy Link"}
          </button>
        </div>
      </div>

      {/* ===== LOBBY STATE ===== */}
      {!hasJoined && (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
          {/* Current selection display */}
          {selectedTmdbId ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center">
              <div className="flex items-center justify-center gap-2 mb-4">
                <Film className="w-5 h-5 text-emerald-500" />
                <h2 className="text-lg font-semibold text-zinc-200">
                  {selectedTitle || "Selected Content"}
                </h2>
              </div>
              {selectedPoster && (
                <img
                  src={getImageUrl(selectedPoster, "w342")}
                  alt={selectedTitle}
                  className="w-40 mx-auto rounded-xl mb-4 shadow-lg"
                />
              )}
              <p className="text-sm text-zinc-400 mb-4">
                {selectedMediaType === "movie" ? "Movie" : "TV Show"}{" "}
                {selectedSeason > 1 && `S${selectedSeason}`}
                {selectedEpisode > 1 && ` E${selectedEpisode}`}
              </p>
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
              <Film className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-zinc-300 mb-2">
                Browse Together
              </h2>
              <p className="text-sm text-zinc-500">
                Search for a movie or TV show below. Your selection will
                automatically show up for everyone in the room.
              </p>
            </div>
          )}

          {/* Search bar */}
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
              placeholder="Search movies & TV shows..."
              className="flex-1 h-12 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30"
            />
            <button
              onClick={handleSearch}
              disabled={isSearching}
              className="h-12 px-5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold rounded-xl transition-colors focusable disabled:opacity-50"
              tabIndex={0}
            >
              <Search className="w-5 h-5" />
            </button>
          </div>

          {/* Search results */}
          {isSearching ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-[2/3] rounded-xl bg-zinc-800 animate-pulse"
                />
              ))}
            </div>
          ) : searchResults.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {searchResults.slice(0, 15).map((item) => (
                <div
                  key={item.id}
                  onClick={() => selectContent(item)}
                  className="focusable group cursor-pointer"
                  tabIndex={0}
                  role="button"
                >
                  <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-zinc-800">
                    <img
                      src={getImageUrl(item.poster_path, "w342")}
                      alt={getMediaTitle(item)}
                      className="w-full h-full object-cover group-hover:opacity-80 transition-opacity"
                      loading="lazy"
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-zinc-400 truncate">
                    {getMediaTitle(item)}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          {/* Join Sync prompt -- only after a title is selected.
              Inline (not full-screen) so browsing stays usable. */}
          {selectedTmdbId && (
            <div className="bg-zinc-900 border border-emerald-500/30 rounded-2xl p-6 text-center shadow-lg shadow-emerald-500/5">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Play className="w-5 h-5 text-emerald-500 fill-emerald-500" />
                <h2 className="text-lg font-semibold text-zinc-100">
                  Ready to Watch Together
                </h2>
              </div>
              <p className="text-sm text-zinc-400 mb-4">
                {selectedTitle
                  ? `"${selectedTitle}" is queued. Tap below to start synced playback.`
                  : "Tap below to start synced playback."}
              </p>
              {peerCount > 0 && (
                <p className="text-sm text-emerald-400 mb-4">
                  {peerCount + 1} device{peerCount + 1 === 1 ? "" : "s"} in this
                  room — you&apos;ll start together.
                </p>
              )}
              <button
                onClick={handleJoinSync}
                className="px-10 py-4 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-lg font-bold rounded-2xl transition-all hover:scale-105 active:scale-95 focusable shadow-lg shadow-emerald-500/25"
                tabIndex={0}
              >
                Tap to Join Sync
              </button>
            </div>
          )}
        </div>
      )}

      {/* ===== PLAYER STATE ===== */}
      {hasJoined && selectedTmdbId && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-4">
          {/* Player */}
          <div className="rounded-xl overflow-hidden shadow-2xl shadow-black/50">
            <FrameXTVPlayer
              tmdbId={selectedTmdbId}
              season={selectedMediaType === "tv" ? selectedSeason : undefined}
              episode={selectedMediaType === "tv" ? selectedEpisode : undefined}
              autoplay={true}
              muted={false}
              startTime={pendingSeek}
              onTimeUpdate={handleTimeUpdate}
              controllerRef={(controller) => {
                if (controller) {
                  playerRef.current = controller;
                }
              }}
            />
          </div>

          {/* Now playing info */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-zinc-100">
                {selectedTitle}
              </h2>
              <p className="text-sm text-zinc-400">
                {selectedMediaType === "movie" ? "Movie" : "TV"}{" "}
                {isSynced && "• Synced"}
              </p>
            </div>

            {/* Manual controls for sync testing */}
            {isSynced && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePlay}
                  className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-lg text-sm font-medium transition-colors focusable"
                  tabIndex={0}
                >
                  <Play className="w-4 h-4 fill-emerald-400 inline mr-1" />
                  Play All
                </button>
                <button
                  onClick={handlePause}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium transition-colors focusable"
                  tabIndex={0}
                >
                  Pause All
                </button>
              </div>
            )}
          </div>

          {/* Progress bar (manual seek) */}
          {duration > 0 && (
            <div className="space-y-1">
              <input
                type="range"
                min={0}
                max={duration}
                value={currentTime}
                onChange={(e) => handleSeek(Number(e.target.value))}
                className="w-full h-1.5 bg-zinc-800 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-500 [&::-webkit-slider-thumb]:shadow-lg"
              />
              <div className="flex justify-between text-xs text-zinc-500">
                <span>
                  {Math.floor(currentTime / 60)}:
                  {String(Math.floor(currentTime % 60)).padStart(2, "0")}
                </span>
                <span>
                  {Math.floor(duration / 60)}:
                  {String(Math.floor(duration % 60)).padStart(2, "0")}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}