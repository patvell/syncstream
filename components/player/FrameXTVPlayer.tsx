"use client";

import { useCallback, useRef, useEffect } from "react";
import type {
  FrameXTVTimeUpdate,
  FrameXTVAction,
} from "@/types";

interface FrameXTVPlayerProps {
  tmdbId: number;
  season?: number;
  episode?: number;
  autoplay?: boolean;
  muted?: boolean;
  startTime?: number;
  onTimeUpdate?: (data: FrameXTVTimeUpdate) => void;
  /** Sandbox the iframe to block popups/redirects. Default: true */
  sandbox?: boolean;
}

export interface PlayerController {
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  seekBy: (seconds: number) => void;
  setVolume: (volume: number) => void;
  mute: () => void;
}

export default function FrameXTVPlayer({
  tmdbId,
  season,
  episode,
  autoplay = false,
  muted = false,
  startTime,
  onTimeUpdate,
  sandbox = true,
}: FrameXTVPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const controllerRef = useRef<PlayerController>({
    play: () => {},
    pause: () => {},
    seek: () => {},
    seekBy: () => {},
    setVolume: () => {},
    mute: () => {},
  });

  const postMessage = useCallback((payload: FrameXTVAction) => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(payload, "*");
    }
  }, []);

  // Build controller
  useEffect(() => {
    controllerRef.current = {
      play: () => postMessage({ action: "play" }),
      pause: () => postMessage({ action: "pause" }),
      seek: (time: number) => postMessage({ action: "seek", time }),
      seekBy: (seconds: number) => postMessage({ action: "seekBy", seconds }),
      setVolume: (volume: number) =>
        postMessage({ action: "setVolume", volume }),
      mute: () => postMessage({ action: "mute" }),
    };
  }, [postMessage]);

  // Listen for timeupdate telemetry
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (
        event.data?.event === "frameXTV:timeupdate" &&
        onTimeUpdate
      ) {
        onTimeUpdate(event.data as FrameXTVTimeUpdate);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onTimeUpdate]);

  // Build embed URL
  const buildUrl = (): string => {
    let url = `https://framextv.xyz/embed/${tmdbId}`;
    if (season && episode) {
      url += `/${season}/${episode}`;
    }

    const params = new URLSearchParams();
    if (autoplay) params.set("autoplay", "1");
    if (muted) params.set("muted", "1");
    if (startTime && startTime > 0) params.set("t", String(startTime));
    params.set("controls", "1");

    const queryString = params.toString();
    return queryString ? `${url}?${queryString}` : url;
  };

  return (
    <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black border border-zinc-800 shadow-2xl">
      <iframe
        ref={iframeRef}
        src={buildUrl()}
        className="w-full h-full border-0"
        allowFullScreen
        sandbox={sandbox ? "allow-scripts allow-same-origin allow-presentation" : undefined}
        title="frameXTV Stream Player"
        allow="autoplay; encrypted-media"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}

export { type FrameXTVPlayerProps };