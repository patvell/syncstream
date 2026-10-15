"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { Play, Users, Star, Calendar, Clock, ArrowLeft, ChevronDown } from "lucide-react";
import FrameXTVPlayer from "@/components/player/FrameXTVPlayer";
import useWatchProgress from "@/hooks/useWatchProgress";
import EpisodeSelector from "@/components/media/EpisodeSelector";
import type { TMDBMediaItem, FrameXTVTimeUpdate } from "@/types";
import { getImageUrl, getMediaTitle, getMediaYear } from "@/lib/tmdb";
import { generateRoomCode } from "@/lib/helpers/room";

interface WatchPageClientProps {
  media: TMDBMediaItem | null;
}

export default function WatchPageClient({ media }: WatchPageClientProps) {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const tmdbId = Number(params.tmdbId);
  const mediaType = (searchParams.get("type") as "movie" | "tv") || "movie";
  const season = Number(searchParams.get("season")) || 1;
  const episode = Number(searchParams.get("episode")) || 1;
  const resumeTime = Number(searchParams.get("resume")) || 0;

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showJoinRoom, setShowJoinRoom] = useState(false);
  const [roomInput, setRoomInput] = useState("");
  const [showEpisodes, setShowEpisodes] = useState(false);

  const { updateProgress, startSync, stopSync } = useWatchProgress({
    tmdbId,
    mediaType,
    season,
    episode,
    posterPath: media?.poster_path,
    title: media ? getMediaTitle(media) : null,
  });

  // Handle time updates from FrameXTV
  const handleTimeUpdate = useCallback(
    (data: FrameXTVTimeUpdate) => {
      setCurrentTime(data.currentTime);
      setDuration(data.duration);
      setIsPlaying(!data.paused);
      updateProgress(data.currentTime, data.duration);
    },
    [updateProgress]
  );

  // Start/stop progress sync based on playback state
  useEffect(() => {
    if (isPlaying) {
      startSync();
    } else {
      stopSync();
    }
  }, [isPlaying, startSync, stopSync]);

  const createRoom = useCallback(() => {
    const roomId = generateRoomCode();
    // Creator's own URL carries the content + current position + host flag.
    // host=1 lets the host enter the room directly (paused at `t`) with NO
    // lobby gate; peers get a clean link (copyRoomLink strips these).
    router.push(
      `/room/${roomId}?tmdbId=${tmdbId}&type=${mediaType}&season=${season}&episode=${episode}&t=${Math.floor(currentTime)}&host=1`
    );
  }, [router, tmdbId, mediaType, season, episode, currentTime]);

  const joinRoom = useCallback(() => {
    if (roomInput.trim()) {
      router.push(`/room/${roomInput.trim()}`);
    }
  }, [router, roomInput]);

  // Switch season/episode -- reload player with new query params
  const selectEpisode = useCallback(
    (nextSeason: number, nextEpisode: number) => {
      router.push(
        `/watch/${tmdbId}?type=tv&season=${nextSeason}&episode=${nextEpisode}`
      );
    },
    [router, tmdbId]
  );

  const title = media ? getMediaTitle(media) : `Content #${tmdbId}`;
  const year = media ? getMediaYear(media) : "—";
  const rating = media?.vote_average?.toFixed(1);
  const overview = media?.overview;

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Back button */}
      <div className="px-4 sm:px-6 pt-4 pb-2">
        <button
          onClick={() => router.push("/")}
          className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors focusable rounded-lg px-3 py-1.5"
          tabIndex={0}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Browse
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 px-4 sm:px-6 pb-16">
        {/* ===== Player ===== */}
        <div className="flex-1 min-w-0">
          <div className="rounded-xl overflow-hidden shadow-2xl shadow-black/50">
            <FrameXTVPlayer
              tmdbId={tmdbId}
              season={mediaType === "tv" ? season : undefined}
              episode={mediaType === "tv" ? episode : undefined}
              autoplay={false}
              muted={false}
              startTime={resumeTime}
              onTimeUpdate={handleTimeUpdate}
            />
          </div>
          {/* Stream provider note */}
          <p className="mt-2 text-[10px] text-zinc-600">
            Stream served by FrameXTV. Some streams may open a single ad tab on first play — that is the provider, not this site.
          </p>

          {/* Progress bar */}
          {duration > 0 && (
            <div className="mt-3 h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                style={{
                  width: `${(currentTime / duration) * 100}%`,
                }}
              />
            </div>
          )}

          {/* Mobile title (hidden on desktop) */}
          <div className="lg:hidden mt-4">
            <h1 className="text-xl font-bold text-zinc-100">{title}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-zinc-400">
              {rating && (
                <span className="flex items-center gap-1">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                  {rating}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {year}
              </span>
              {duration > 0 && (
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {Math.floor(duration / 60)}m
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ===== Sidebar ===== */}
        <div className="w-full lg:w-80 flex-shrink-0 space-y-5">
          {/* Desktop title & metadata */}
          <div className="hidden lg:block">
            <h1 className="text-2xl font-bold text-zinc-100 leading-tight">
              {title}
            </h1>
            <div className="flex items-center gap-3 mt-2 text-sm text-zinc-400">
              {rating && (
                <span className="flex items-center gap-1">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                  {rating}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {year}
              </span>
              {duration > 0 && (
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {Math.floor(duration / 60)}m
                </span>
              )}
            </div>
          </div>

          {/* Overview */}
          {overview && (
            <div>
              <h3 className="text-sm font-medium text-zinc-400 mb-1.5">
                Overview
              </h3>
              <p className="text-sm text-zinc-300 leading-relaxed line-clamp-6">
                {overview}
              </p>
            </div>
          )}

          {/* TV: Episodes selector */}
          {mediaType === "tv" && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <button
                onClick={() => setShowEpisodes(!showEpisodes)}
                className="w-full flex items-center justify-between gap-2 text-left focusable"
                tabIndex={0}
                aria-expanded={showEpisodes}
              >
                <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                  <Play className="w-4 h-4 text-emerald-500" />
                  Episodes — S{season} E{episode}
                </h3>
                <span className={`text-zinc-400 transition-transform ${
                  showEpisodes ? "rotate-180" : ""
                }`}>
                  <ChevronDown className="w-4 h-4" />
                </span>
              </button>
              <div
                className={`mt-3 overflow-hidden transition-all ${
                  showEpisodes ? "opacity-100 max-h-[400px]" : "opacity-0 max-h-0"
                }`}
              >
                <EpisodeSelector
                  tmdbId={tmdbId}
                  currentSeason={season}
                  currentEpisode={episode}
                  onSelectEpisode={selectEpisode}
                />
              </div>
            </div>
          )}

          {/* Poster thumbnail */}
          {media?.poster_path && (
            <div className="hidden lg:block">
              <img
                src={getImageUrl(media.poster_path, "w342")}
                alt={title}
                className="w-full rounded-xl shadow-lg"
              />
            </div>
          )}

          {/* Room actions */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-500" />
              Watch Together
            </h3>

            <button
              onClick={createRoom}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold rounded-xl transition-colors focusable"
              tabIndex={0}
            >
              <Users className="w-4 h-4" />
              Create Watch Party
            </button>

            {!showJoinRoom ? (
              <button
                onClick={() => setShowJoinRoom(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium rounded-xl transition-colors focusable"
                tabIndex={0}
              >
                <Play className="w-4 h-4" />
                Join a Room
              </button>
            ) : (
              <div className="space-y-2 animate-fade-in">
                <input
                  type="text"
                  value={roomInput}
                  onChange={(e) => setRoomInput(e.target.value)}
                  placeholder="Enter room ID..."
                  className="w-full h-10 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") joinRoom();
                  }}
                />
                <div className="flex gap-2">
                  <button
                    onClick={joinRoom}
                    className="flex-1 px-3 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-medium rounded-lg text-sm transition-colors"
                  >
                    Join
                  </button>
                  <button
                    onClick={() => {
                      setShowJoinRoom(false);
                      setRoomInput("");
                    }}
                    className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 font-medium rounded-lg text-sm transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}