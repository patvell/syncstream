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

interface UseWatchPartySyncOptions {
  roomId: string;
  playerRef: React.RefObject<PlayerController>;
}

export default function useWatchPartySync({
  roomId,
  playerRef,
}: UseWatchPartySyncOptions) {
  // senderId is stable for the component lifetime; store it in a ref for
  // callbacks and expose a derived state value (lazy init runs once).
  const [senderIdValue] = useState(() => getSenderId());
  const senderId = useRef(senderIdValue);
  const [isSynced, setIsSynced] = useState(false);
  const [lobbyContent, setLobbyContent] =
    useState<LobbyUpdatePayload | null>(null);
  const lastReceiveTime = useRef(0);

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
      const channel = supabase.channel(`room_${roomId}`);
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
      try {
        await channel.httpSend("sync", payload);
      } catch {
        // best-effort -- fall back to websocket send if REST fails
        channel.send({
          type: "broadcast",
          event: "sync",
          payload,
        });
      } finally {
        await supabase.removeChannel(channel);
      }
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
      const channel = supabase.channel(`room_${roomId}`);
      const payload: LobbyUpdatePayload = {
        type: "LOBBY_UPDATE",
        ...data,
        senderId: senderId.current,
        timestamp: Date.now(),
      };
      try {
        await channel.httpSend("lobby", payload);
      } catch {
        channel.send({
          type: "broadcast",
          event: "lobby",
          payload,
        });
      } finally {
        await supabase.removeChannel(channel);
      }
    },
    [roomId]
  );

  // Join sync
  const joinSync = useCallback(() => {
    setIsSynced(true);
  }, []);

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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, playerRef]);

  return {
    isSynced,
    joinSync,
    broadcastSync,
    broadcastLobby,
    lobbyContent,
    senderId: senderIdValue,
  };
}