"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import {
  Users,
  Play,
  Pause,
  RefreshCw,
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

function fmt(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function RoomPageClient() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const roomId = params.roomId as string;
  const initialTmdbId = searchParams.get("tmdbId");
  const initialType = (searchParams.get("type") as MediaType) || "movie";
  const initialSeason = Number(searchParams.get("season")) || 1;
  const initialEpisode = Number(searchParams.get("episode")) || 1;
  const initialTime = Number(searchParams.get("t")) || 0;
  // Host enters the room directly (paused at `t`), no lobby gate.
  const isHost = searchParams.get("host") === "1";

  // Room state
  // If host, jump straight into the (paused) player view.
  const [hasJoined, setHasJoined] = useState(isHost);
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

  // Host flag mirror (used in onReady callback; avoids stale closure).
  const isHostRef = useRef(isHost);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<TMDBMediaItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Player
  const playerRef = useRef<PlayerController>(null!);
  const lastPlayBcastRef = useRef(isHost ? false : false);
  const lastTimeRef = useRef(0);
  const suppressEchoUntilRef = useRef(0);
  // Position to start a freshly-mounted player at. For the host it's the time
  // they were watching when creating the room; for peers it's the synced time.
  const [pendingSeek, setPendingSeek] = useState(initialTime);
  const [currentTime, setCurrentTime] = useState(initialTime);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  // Scrubbing state (visual position while dragging, commit on release).
  const [scrubTime, setScrubTime] = useState<number | null>(null);

  // Mirrors for use inside realtime callbacks (avoid stale closures).
  const hasJoinedRef = useRef(hasJoined);
  useEffect(() => {
    hasJoinedRef.current = hasJoined;
  }, [hasJoined]);
  const currentTimeRef = useRef(currentTime);
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  const {
    isSynced,
    joinSync,
    requestSync,
    broadcastSync,
    broadcastLobby,
    broadcastHeartbeat,
    lobbyContent,
    setLocalState,
    peerCount,
  } = useWatchPartySync({
    roomId,
    playerRef,
    getLocalTime: () => currentTimeRef.current,
    // Adopt the room's authoritative state. Content is applied ONLY when this
    // device has no content yet (before its player mounts) -- changing content
    // on a mounted player would destroy the iframe. Position always applies.
    onApplyState: (state) => {
      if (state.title) setSelectedTitle(state.title);
      if (state.posterPath) setSelectedPoster(state.posterPath);
      if (selectedTmdbIdRef.current === null && state.tmdbId) {
        // Late joiner: adopt content from the room, no player mounted yet.
        setSelectedTmdbId(state.tmdbId);
        if (state.mediaType) setSelectedMediaType(state.mediaType);
        if (state.season) setSelectedSeason(state.season);
        if (state.episode) setSelectedEpisode(state.episode);
      }
      if (state.time !== undefined) {
        setPendingSeek(state.time);
        // Only seek if a player is already mounted.
        if (hasJoinedRef.current) {
          playerRef.current?.seek(state.time);
        }
        suppressEchoUntilRef.current = Date.now() + 800;
      }
      if (state.playing !== undefined) {
        // Sync our local transition-tracking ref so we don't ECHO the remote
        // play/pause back into the channel (loop prevention).
        lastPlayBcastRef.current = state.playing;
        if (hasJoinedRef.current) {
          if (state.playing) {
            playerRef.current?.play();
          } else {
            playerRef.current?.pause();
          }
        }
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
      const { currentTime: t, duration: d, paused } = data;
      setCurrentTime(t);
      currentTimeRef.current = t;
      setDuration(d);
      const playing = !paused;
      setIsPlaying(playing);
      updateProgress(t, d);
      // Keep our authoritative snapshot fresh so a joiner can be synced to us.
      setLocalState({
        tmdbId: selectedTmdbId ?? undefined,
        mediaType: selectedMediaType,
        season: selectedSeason,
        episode: selectedEpisode,
        title: selectedTitle || undefined,
        posterPath: selectedPoster,
        time: t,
        playing,
      });

      // Native iframe scrub detection: if the user scrubbed inside FrameXTV's
      // own controls (a sudden time jump while we're past the echo window),
      // broadcast the new position so all peers follow.
      const jumped = Math.abs(t - lastTimeRef.current) > 2.5;
      if (jumped && Date.now() > suppressEchoUntilRef.current && isSynced) {
        suppressEchoUntilRef.current = Date.now() + 800;
        broadcastSync("seek", t, selectedTmdbId ?? 0, selectedMediaType, selectedSeason, selectedEpisode);
      }
      lastTimeRef.current = t;

      // Broadcast play/pause only when the state actually TRANSITIONS
      // (avoids spamming the channel every ~250ms while playing normally).
      if (isSynced && playing !== lastPlayBcastRef.current) {
        lastPlayBcastRef.current = playing;
        broadcastSync(
          playing ? "play" : "pause",
          t,
          selectedTmdbId ?? 0,
          selectedMediaType,
          selectedSeason,
          selectedEpisode
        );
      }
    },
    [updateProgress, isSynced, broadcastSync, selectedTmdbId, selectedMediaType, selectedSeason, selectedEpisode, selectedTitle, selectedPoster, setLocalState]
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

  // Auto-fetch TMDB title/poster when we have a selectedTmdbId but no title
  // yet (host arriving from URL, or a sync_state that only carried the id).
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (selectedTmdbId && !selectedTitle) {
      const fetchDetails = async () => {
        try {
          const res = await fetch(
            `/api/tmdb/${selectedMediaType}/${selectedTmdbId}`
          );
          const data = await res.json();
          if (data?.title || data?.name) {
            setSelectedTitle(data.title || data.name);
          }
          if (data?.poster_path) {
            setSelectedPoster(data.poster_path);
          }
        } catch {
          // best-effort
        }
      };
      fetchDetails();
    }
  }, [selectedTmdbId, selectedMediaType, selectedTitle]);
  /* eslint-enable react-hooks/exhaustive-deps */

  // Heartbeat interval while synced + playing, so peers auto-correct drift.
  useEffect(() => {
    if (!isSynced || !isPlaying) return;
    const interval = setInterval(() => {
      broadcastHeartbeat(currentTimeRef.current, true);
    }, 5000);
    return () => clearInterval(interval);
  }, [isSynced, isPlaying, broadcastHeartbeat]);

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

  // Coordinated Play: broadcast with a start delay so both devices fire play()
  // at ~the same physical instant. Locally we also wait ~100ms (approx WS
  // transit) so we don't get ahead of the peer.
  const handlePlay = useCallback(() => {
    if (isSynced) {
      const targetTime = currentTimeRef.current;
      broadcastSync("play", targetTime, selectedTmdbId ?? 0, selectedMediaType, selectedSeason, selectedEpisode);
      setTimeout(() => {
        playerRef.current?.seek(targetTime);
        playerRef.current?.play();
      }, 100);
    } else {
      playerRef.current?.play();
    }
  }, [isSynced, selectedTmdbId, selectedMediaType, selectedSeason, selectedEpisode, broadcastSync]);

  const handlePause = useCallback(() => {
    const targetTime = currentTimeRef.current;
    if (isSynced) {
      broadcastSync("pause", targetTime, selectedTmdbId ?? 0, selectedMediaType, selectedSeason, selectedEpisode);
    }
    // Freeze on the exact frame locally too.
    playerRef.current?.seek(targetTime);
    playerRef.current?.pause();
    lastPlayBcastRef.current = false;
  }, [isSynced, selectedTmdbId, selectedMediaType, selectedSeason, selectedEpisode, broadcastSync]);

  const handleSeek = useCallback(
    (time: number) => {
      playerRef.current?.seek(time);
      setCurrentTime(time);
      if (isSynced) {
        broadcastSync("seek", time, selectedTmdbId ?? 0, selectedMediaType, selectedSeason, selectedEpisode);
      }
    },
    [isSynced, selectedTmdbId, selectedMediaType, selectedSeason, selectedEpisode, broadcastSync]
  );

  // Force re-sync: tell all peers (and ourselves) to snap to our exact position.
  const handleResync = useCallback(() => {
    const t = currentTimeRef.current;
    playerRef.current?.seek(t);
    broadcastSync("seek", t, selectedTmdbId ?? 0, selectedMediaType, selectedSeason, selectedEpisode);
    if (hasJoinedRef.current) {
      requestSync();
    }
  }, [selectedTmdbId, selectedMediaType, selectedSeason, selectedEpisode, broadcastSync, requestSync]);

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
              <div className="flex items-center justify-center gap-2 mb-2">
                <Film className="w-4 h-4 text-emerald-500" />
                <h2 className="text-base font-semibold text-zinc-200">
                  Queued for everyone
                </h2>
              </div>
              {selectedPoster && (
                <img
                  src={getImageUrl(selectedPoster, "w500")}
                  alt={selectedTitle}
                  className="w-48 sm:w-56 mx-auto rounded-xl mb-3 shadow-lg"
                />
              )}
              <h3 className="text-xl font-bold text-zinc-100 mb-1">
                {selectedTitle || "Selected Content"}
              </h3>
              <p className="text-sm text-zinc-400 mb-2">
                {selectedMediaType === "movie" ? "Movie" : "TV Show"}{" "}
                {selectedSeason > 1 && `S${selectedSeason}`}
                {selectedEpisode > 1 && ` E${selectedEpisode}`}
              </p>
              <p className="text-xs text-zinc-500 mb-1">
                {isPlaying
                  ? `Playing now • ${fmt(currentTime)}`
                  : `Paused at ${fmt(currentTime)}`}
                {" "}— everyone in this room will watch together.
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

          {/* Search bar + results -- ONLY shown when the room has no content
              selected yet. Once content is queued (from URL or sync_state),
              browsing is hidden: the flow is confirm + join, not browse. */}
          {!selectedTmdbId && (
            <>
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
            </>
          )}

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
                Join Watch Party
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
              autoplay={false}
              muted={false}
              startTime={pendingSeek}
              onTimeUpdate={handleTimeUpdate}
              onReady={() => {
                // Once the peer's iframe has actually loaded, request a fresh
                // sync so they snap to the live timestamp (not a stale one).
                if (!isHostRef.current) {
                  requestSync();
                }
              }}
              controllerRef={(controller) => {
                if (controller) {
                  playerRef.current = controller;
                }
              }}
            />
          </div>

          {/* Now playing info */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-zinc-100">
                {selectedTitle || `Title #${selectedTmdbId}`}
              </h2>
              <p className="text-sm text-zinc-400">
                {selectedMediaType === "movie" ? "Movie" : "TV"}{" "}
                {selectedSeason > 1 && `S${selectedSeason}`}
                {selectedEpisode > 1 && ` E${selectedEpisode}`}
                {isSynced && (
                  <span className="ml-2 text-emerald-400">• Synced</span>
                )}
                {peerCount > 0 && (
                  <span className="ml-2 text-zinc-500">
                    • {peerCount + 1} in room
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Sync Control Bar */}
          {duration > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
              {/* Playback controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={isPlaying ? handlePause : handlePlay}
                  className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold rounded-xl transition-colors focusable flex items-center gap-2"
                  tabIndex={0}
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5 fill-zinc-950" />
                  ) : (
                    <Play className="w-5 h-5 fill-zinc-950" />
                  )}
                  {isPlaying ? "Pause" : "Play"}
                </button>
                <button
                  onClick={() => handleSeek(Math.max(0, currentTime - 10))}
                  className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-sm font-medium transition-colors focusable"
                  tabIndex={0}
                >
                  -10s
                </button>
                <button
                  onClick={() => handleSeek(Math.min(duration, currentTime + 10))}
                  className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-sm font-medium transition-colors focusable"
                  tabIndex={0}
                >
                  +10s
                </button>
                <button
                  onClick={handleResync}
                  className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-sm font-medium transition-colors focusable flex items-center gap-1.5 ml-auto"
                  tabIndex={0}
                >
                  <RefreshCw className="w-4 h-4" />
                  Sync All
                </button>
              </div>

              {/* Commit-on-release scrubber */}
              <div className="flex items-center gap-3">
                <span className="text-xs tabular-nums text-zinc-400 w-10 text-right">
                  {fmt(scrubTime ?? currentTime)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={duration}
                  value={scrubTime ?? currentTime}
                  onChange={(e) => setScrubTime(Number(e.target.value))}
                  onPointerUp={() => {
                    if (scrubTime != null) handleSeek(scrubTime);
                    setScrubTime(null);
                  }}
                  onMouseUp={() => {
                    if (scrubTime != null) handleSeek(scrubTime);
                    setScrubTime(null);
                  }}
                  onTouchEnd={() => {
                    if (scrubTime != null) handleSeek(scrubTime);
                    setScrubTime(null);
                  }}
                  onKeyUp={() => {
                    if (scrubTime != null) handleSeek(scrubTime);
                    setScrubTime(null);
                  }}
                  className="flex-1 h-1.5 bg-zinc-800 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-500 [&::-webkit-slider-thumb]:shadow-lg"
                />
                <span className="text-xs tabular-nums text-zinc-400 w-10">
                  {fmt(duration)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}