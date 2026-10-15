"use client";

import { useCallback, useRef, useEffect, useMemo, useState, type RefCallback } from "react";
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
  /** Called when the iframe has finished loading (ready to receive postMessage). */
  onReady?: () => void;
  /** Sandbox the iframe to block popups/redirects. Default: true */
  sandbox?: boolean;
  /** Optional callback ref that receives the player controller. */
  controllerRef?: RefCallback<PlayerController | null>;
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
  onReady,
  sandbox = true,
  controllerRef,
}: FrameXTVPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Lock the initial start time so the iframe URL never changes from a
  // reactive startTime prop (which would reload the whole stream). Only used
  // to build the src the first time; later seeks go through postMessage.
  // (Lazy state initializer -- NOT a ref -- so no ref access during render.)
  const [initialStartTime] = useState(() => startTime ?? 0);

  const postMessage = useCallback((payload: FrameXTVAction) => {
    iframeRef.current?.contentWindow?.postMessage(payload, "*");
  }, []);

  // Expose a stable controller to the parent via a callback ref.
  const controller = useMemo<PlayerController>(
    () => ({
      play: () => postMessage({ action: "play" }),
      pause: () => postMessage({ action: "pause" }),
      seek: (time: number) => postMessage({ action: "seek", time }),
      seekBy: (seconds: number) => postMessage({ action: "seekBy", seconds }),
      setVolume: (volume: number) =>
        postMessage({ action: "setVolume", volume }),
      mute: () => postMessage({ action: "mute" }),
    }),
    [postMessage]
  );

  // set controllerRef (a callback ref) when the iframe mounts
  const setIframeRef = useCallback(
    (node: HTMLIFrameElement | null) => {
      iframeRef.current = node;
      if (node) {
        controllerRef?.(controller);
      } else {
        controllerRef?.(null);
      }
    },
    [controllerRef, controller]
  );

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

  // Build embed URL (only depends on content identity + locked initial time)
  const buildUrl = (): string => {
    let url = `https://framextv.xyz/embed/${tmdbId}`;
    if (season && episode) {
      url += `/${season}/${episode}`;
    }

    const params = new URLSearchParams();
    if (autoplay) params.set("autoplay", "1");
    if (muted) params.set("muted", "1");
    if (initialStartTime && initialStartTime > 0)
      params.set("t", String(initialStartTime));
    params.set("controls", "1");

    const queryString = params.toString();
    return queryString ? `${url}?${queryString}` : url;
  };

  return (
    <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black border border-zinc-800 shadow-2xl">
      <iframe
        ref={setIframeRef}
        src={buildUrl()}
        onLoad={() => onReady?.()}
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