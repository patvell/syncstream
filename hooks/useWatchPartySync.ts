"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { SyncActionPayload, LobbyUpdatePayload, MediaType } from "@/types";
import type { PlayerController } from "@/components/player/FrameXTVPlayer";

const DEBOUNCE_MS = 300;

function getSenderId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("syncstream_sender_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("syncstream_sender_id", id);
  }
  return id;
}

async function relay(roomId: string, event: string, payload: unknown) {
  try {
    const res = await fetch(`/api/room/${encodeURIComponent(roomId)}/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, payload }),
    });
    if (!res.ok) return false;
    return true;
  } catch {
    return false;
  }
}

interface UseWatchPartySyncOptions {
  roomId: string;
  playerRef: React.RefObject<PlayerController>;
  /** Called when this device should adopt the authoritative room state
   *  (e.g. a joiner snapping to the creator's content + timestamp). */
  onApplyState?: (state: {
    tmdbId?: number;
    mediaType?: MediaType;
    season?: number;
    episode?: number;
    time?: number;
    playing?: boolean;
  }) => void;
}

export default function useWatchPartySync({
  roomId,
  playerRef,
  onApplyState,
}: UseWatchPartySyncOptions) {
  // senderId is stable for the component lifetime; store it in a ref for
  // callbacks and expose a derived state value (lazy init runs once).
  const [senderIdValue] = useState(() => getSenderId());
  const senderId = useRef(senderIdValue);
  const [isSynced, setIsSynced] = useState(false);
  const [lobbyContent, setLobbyContent] =
    useState<LobbyUpdatePayload | null>(null);
  const lastReceiveTime = useRef(0);
  // Kept in sync so a peer can answer a request_sync with authoritative state
  const latestStateRef = useRef<{
    tmdbId?: number;
    mediaType?: MediaType;
    season?: number;
    episode?: number;
    time?: number;
    playing?: boolean;
  }>({});
  // Keep onApplyState stable without re-subscribing
  const onApplyStateRef = useRef(onApplyState);
  useEffect(() => {
    onApplyStateRef.current = onApplyState;
  }, [onApplyState]);

  // Send sync action to channel (REST broadcast -- no subscribe needed)
  const broadcastSync = useCallback(
    async (
      action: "play" | "pause" | "seek",
      time?: number,
      tmdbId?: number,
      mediaType?: MediaType,
      season?: number,
      episode?: number
    ) => {
      const payload: SyncActionPayload = {
        type: "SYNC_ACTION",
        action,
        time,
        senderId: senderId.current,
        tmdbId: tmdbId ?? 0,
        mediaType: mediaType ?? "movie",
        season,
        episode,
        timestamp: Date.now(),
      };
      // Relay through our server API (uses service-role key = guaranteed
      // broadcast permission), so sharing works regardless of the client key.
      await relay(roomId, "sync", payload);
    },
    [roomId]
  );

  // Send lobby update to channel (REST broadcast)
  const broadcastLobby = useCallback(
    async (data: {
      tmdbId: number;
      mediaType: MediaType;
      season: number;
      episode: number;
      title: string;
      posterPath: string | null;
    }) => {
      const payload: LobbyUpdatePayload = {
        type: "LOBBY_UPDATE",
        ...data,
        senderId: senderId.current,
        timestamp: Date.now(),
      };
      await relay(roomId, "lobby", payload);
    },
    [roomId]
  );

  // Join sync -- becomes synced AND asks the room for the authoritative state
  // so the local player snaps to match the creator's position/content.
  const joinSync = useCallback(
    (myState?: {
      tmdbId?: number;
      mediaType?: MediaType;
      season?: number;
      episode?: number;
      time?: number;
      playing?: boolean;
    }) => {
      setIsSynced(true);
      // Broadcast a request for the current room state (others will answer
      // with SYNC_STATE).
      relay(roomId, "request_sync", {
        senderId: senderId.current,
        state: myState ?? null,
        timestamp: Date.now(),
      });
    },
    [roomId]
  );

  // Publish the authoritative room state (used to answer a request_sync).
  const publishState = useCallback(
    async (state: {
      tmdbId?: number;
      mediaType?: MediaType;
      season?: number;
      episode?: number;
      time?: number;
      playing?: boolean;
    }) => {
      await relay(roomId, "sync_state", {
        senderId: senderId.current,
        state,
        timestamp: Date.now(),
      });
    },
    [roomId]
  );

  // Subscribe to room channel
  useEffect(() => {
    if (!roomId) return;

    const channel = supabase.channel(`room_${roomId}`);

    channel
      .on("broadcast", { event: "sync" }, (msg) => {
        const payload = msg.payload as SyncActionPayload;

        // Filter own messages
        if (payload.senderId === senderId.current) return;

        // Debounce
        const now = Date.now();
        if (now - lastReceiveTime.current < DEBOUNCE_MS) return;
        lastReceiveTime.current = now;

        // Execute on player
        const player = playerRef.current;
        if (!player) return;

        switch (payload.action) {
          case "play":
            player.play();
            break;
          case "pause":
            player.pause();
            break;
          case "seek":
            if (payload.time !== undefined) {
              player.seek(payload.time);
            }
            break;
        }
      })
      .on("broadcast", { event: "lobby" }, (msg) => {
        const payload = msg.payload as LobbyUpdatePayload;
        if (payload.senderId === senderId.current) return;
        setLobbyContent(payload);
      })
      .on("broadcast", { event: "request_sync" }, (msg) => {
        // Another device just joined and wants the authoritative state.
        const payload = msg.payload as {
          senderId: string;
          timestamp: number;
        };
        if (!payload || payload.senderId === senderId.current) return;
        // Answer with our latest known state.
        const s = latestStateRef.current;
        if (s.tmdbId) {
          relay(roomId, "sync_state", {
            senderId: senderId.current,
            state: s,
            timestamp: Date.now(),
          });
        }
      })
      .on("broadcast", { event: "sync_state" }, (msg) => {
        const payload = msg.payload as {
          senderId: string;
          state: {
            tmdbId?: number;
            mediaType?: MediaType;
            season?: number;
            episode?: number;
            time?: number;
            playing?: boolean;
          };
          timestamp: number;
        };
        if (!payload || payload.senderId === senderId.current) return;
        // Adopt the authoritative state on this device.
        latestStateRef.current = payload.state;
        onApplyStateRef.current?.(payload.state);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, playerRef]);

  // Update this device's authoritative snapshot (called on timeupdate).
  const setLocalState = useCallback(
    (state: {
      tmdbId?: number;
      mediaType?: MediaType;
      season?: number;
      episode?: number;
      time?: number;
      playing?: boolean;
    }) => {
      latestStateRef.current = { ...latestStateRef.current, ...state };
    },
    []
  );

  return {
    isSynced,
    joinSync,
    broadcastSync,
    broadcastLobby,
    publishState,
    setLocalState,
    lobbyContent,
    senderId: senderIdValue,
  };
}