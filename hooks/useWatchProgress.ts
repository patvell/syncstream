"use client";

import { useCallback, useRef, useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getUserIdFromCookie } from "@/lib/session";
import type { WatchProgress, MediaType } from "@/types";

const SYNC_INTERVAL = 10000; // 10 seconds

interface UseWatchProgressOptions {
  tmdbId?: number;
  mediaType?: MediaType;
  season?: number;
  episode?: number;
  posterPath?: string | null;
  title?: string | null;
}

export default function useWatchProgress(options: UseWatchProgressOptions = {}) {
  const {
    tmdbId,
    mediaType = "movie",
    season = 1,
    episode = 1,
    posterPath,
    title,
  } = options;
  const { userId } = useMemo(
    () => ({ userId: getUserIdFromCookie() || "anonymous" }),
    []
  );
  const pendingProgress = useRef<WatchProgress | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [latestProgress, setLatestProgress] = useState<WatchProgress | null>(
    null
  );

  // Save progress to Supabase
  const saveProgress = useCallback(
    async (currentTime: number, duration: number) => {
      if (!tmdbId) return;

      const record: WatchProgress = {
        id: "",
        user_id: userId,
        tmdb_id: tmdbId,
        media_type: mediaType,
        season,
        episode,
        progress_seconds: Math.floor(currentTime),
        duration_seconds: Math.floor(duration),
        updated_at: new Date().toISOString(),
        poster_path: posterPath,
        title,
      };

      pendingProgress.current = record as WatchProgress;

      try {
        const { error } = await supabase.from("watch_progress").upsert(
          {
            user_id: userId,
            tmdb_id: record.tmdb_id,
            media_type: record.media_type,
            season: record.season,
            episode: record.episode,
            progress_seconds: record.progress_seconds,
            duration_seconds: record.duration_seconds,
            updated_at: record.updated_at,
            poster_path: record.poster_path,
            title: record.title,
          },
          {
            onConflict: "user_id,tmdb_id,season,episode",
          }
        );

        if (!error) {
          setLatestProgress(record);
        }
      } catch {
        // Silently fail -- progress sync is best-effort
      }
    },
    [tmdbId, mediaType, season, episode, userId, posterPath, title]
  );

  // Update pending progress (called on every timeupdate)
  const updateProgress = useCallback(
    (currentTime: number, duration: number) => {
      pendingProgress.current = {
        id: "",
        user_id: userId,
        tmdb_id: tmdbId ?? 0,
        media_type: mediaType,
        season,
        episode,
        progress_seconds: Math.floor(currentTime),
        duration_seconds: Math.floor(duration),
        updated_at: new Date().toISOString(),
        poster_path: posterPath,
        title,
      };
    },
    [tmdbId, mediaType, season, episode, userId, posterPath, title]
  );

  // Start periodic sync
  const startSync = useCallback(() => {
    if (intervalRef.current) return;

    intervalRef.current = setInterval(() => {
      if (pendingProgress.current && pendingProgress.current.progress_seconds > 0) {
        saveProgress(
          pendingProgress.current.progress_seconds,
          pendingProgress.current.duration_seconds
        );
      }
    }, SYNC_INTERVAL);
  }, [saveProgress]);

  // Stop periodic sync
  const stopSync = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopSync();
  }, [stopSync]);

  return {
    updateProgress,
    saveProgress,
    startSync,
    stopSync,
    latestProgress,
    userId,
  };
}

// Helper: fetch latest watch progress for the current user (within 15 min)
export async function getLatestProgress(): Promise<WatchProgress | null> {
  const userId = getUserIdFromCookie();
  if (!userId) return null;

  const fifteenMinutesAgo = new Date(
    Date.now() - 15 * 60 * 1000
  ).toISOString();

  const { data, error } = await supabase
    .from("watch_progress")
    .select("*")
    .eq("user_id", userId)
    .gte("updated_at", fifteenMinutesAgo)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return null;
  return data[0] as WatchProgress;
}