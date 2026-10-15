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
  /** Returns this device's current playhead (used for drift correction). */
  getLocalTime?: () => number;
  /** Called when this device should adopt the authoritative ROOM STATE.
   *  Content fields are only ever applied by the caller when it has NO content
   *  yet (i.e. before its player has mounted), so changing them can't destroy a
   *  running player. Position (time/playing) applies to the live player. */
  onApplyState?: (state: {
    tmdbId?: number;
    mediaType?: MediaType;
    season?: number;
    episode?: number;
    title?: string;
    posterPath?: string | null;
    time?: number;
    playing?: boolean;
  }) => void;
}

export default function useWatchPartySync({
  roomId,
  playerRef,
  onApplyState,
  getLocalTime,
}: UseWatchPartySyncOptions) {
  // senderId is stable for the component lifetime; store it in a ref for
  // callbacks and expose a derived state value (lazy init runs once).
  const [senderIdValue] = useState(() => getSenderId());
  const senderId = useRef(senderIdValue);
  const [isSynced, setIsSynced] = useState(false);
  const [lobbyContent, setLobbyContent] =
    useState<LobbyUpdatePayload | null>(null);
  const lastReceiveTime = useRef(0);
  // The subscribed WebSocket channel -- reused for sending (fast delivery to
  // the same room subscribers) instead of a disposable REST relay per send.
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // Flag so we only relay as a fallback before the WS channel is joined.
  const channelJoined = useRef(false);
  // Our authoritative snapshot: full room state (content + position) so a late
  // joiner can be brought up to speed even though broadcasts aren't replayed.
  const latestStateRef = useRef<{
    tmdbId?: number;
    mediaType?: MediaType;
    season?: number;
    episode?: number;
    title?: string;
    posterPath?: string | null;
    time?: number;
    playing?: boolean;
  }>({});
  // Track peers who have sent us a broadcast this session (for the UI counter).
  const peerIds = useRef<Set<string>>(new Set());
  const [peerCount, setPeerCount] = useState(0);

  const trackPeer = useCallback((id: string) => {
    if (!id || peerIds.current.has(id)) return;
    peerIds.current.add(id);
    setPeerCount(peerIds.current.size);
  }, []);
  // Keep onApplyState stable without re-subscribing
  const onApplyStateRef = useRef(onApplyState);
  useEffect(() => {
    onApplyStateRef.current = onApplyState;
  }, [onApplyState]);
  // Keep getLocalTime stable without re-subscribing.
  const getLocalTimeRef = useRef(getLocalTime);
  useEffect(() => {
    getLocalTimeRef.current = getLocalTime;
  }, [getLocalTime]);

  // Send sync action to channel. Primary: WebSocket on the subscribed channel
  // (fast, same-topic). Fallback: REST relay via server API (service-role key)
  // in case the WS channel isn't joined yet.
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
      const ch = channelRef.current;
      if (ch && channelJoined.current) {
        await ch.send({ type: "broadcast", event: "sync", payload });
        return;
      }
      await relay(roomId, "sync", payload);
    },
    [roomId]
  );

  // Send lobby update to channel. Same strategy as broadcastSync.
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
      const ch = channelRef.current;
      if (ch && channelJoined.current) {
        await ch.send({ type: "broadcast", event: "lobby", payload });
        return;
      }
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

  // Subscribe to room channel
  useEffect(() => {
    if (!roomId) return;

    const channel = supabase.channel(`room_${roomId}`);
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "sync" }, (msg) => {
        const payload = msg.payload as SyncActionPayload;

        // Filter own messages
        if (payload.senderId === senderId.current) return;

        trackPeer(payload.senderId);

        // Debounce rapid repeats per action, but ensure the LAST event of a
        // seek burst is not lost (seek carries its own authoritative target).
        const now = Date.now();
        if (payload.action !== "seek" && now - lastReceiveTime.current < DEBOUNCE_MS) return;
        lastReceiveTime.current = now;

        // Execute on player
        const player = playerRef.current;
        if (!player) return;

        // Transit latency compensation: how long the message took to arrive.
        const transit = Math.min(1.5, Math.max(0, (now - (payload.timestamp || now)) / 1000));

        switch (payload.action) {
          case "play":
            // Seek to the exact target first so both players start on the same
            // frame, then play.
            if (payload.time !== undefined) {
              player.seek(payload.time + transit);
            }
            player.play();
            break;
          case "pause":
            // Freeze on the exact same frame.
            if (payload.time !== undefined) {
              player.seek(payload.time);
            }
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
        trackPeer(payload.senderId);
        setLobbyContent(payload);
      })
      .on("broadcast", { event: "request_sync" }, (msg) => {
        // Another device just joined and wants the authoritative room state.
        const payload = msg.payload as {
          senderId: string;
          timestamp: number;
        };
        if (!payload || payload.senderId === senderId.current) return;
        trackPeer(payload.senderId);
        // Answer with full state (content + position) -- a late joiner has no
        // player mounted yet, so applying content is safe on their side.
        const s = latestStateRef.current;
        if (s.tmdbId) {
          relay(roomId, "sync_state", {
            senderId: senderId.current,
            state: {
              tmdbId: s.tmdbId,
              mediaType: s.mediaType,
              season: s.season,
              episode: s.episode,
              title: s.title,
              posterPath: s.posterPath,
              time: s.time ?? 0,
              playing: s.playing ?? false,
            },
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
            title?: string;
            posterPath?: string | null;
            time?: number;
            playing?: boolean;
          };
          timestamp: number;
        };
        if (!payload || payload.senderId === senderId.current) return;
        trackPeer(payload.senderId);
        // Adopt the authoritative room state on this device. The caller decides
        // whether it can apply content (no player mounted yet) vs only position.
        latestStateRef.current = payload.state;
        onApplyStateRef.current?.(payload.state);
      })
      .on("broadcast", { event: "heartbeat" }, (msg) => {
        // Drift correction while playing.
        const payload = msg.payload as {
          senderId: string;
          time?: number;
          playing?: boolean;
          timestamp: number;
        };
        if (!payload || payload.senderId === senderId.current) return;
        if (payload.time === undefined) return;
        const transit = Math.min(1.5, Math.max(0, (Date.now() - payload.timestamp) / 1000));
        const target = payload.time + transit;
        const player = playerRef.current;
        const localTime = getLocalTimeRef.current?.() ?? 0;
        // Correct only if we are meaningfully out of sync (>1.5s); otherwise
        // skip to avoid micro-stutter from network jitter.
        if (player && Math.abs(localTime - target) > 1.5) {
          player.seek(target);
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          channelJoined.current = true;
          // Once our subscription is live, ask the room for the current state so
          // late joiners (who missed the ephemeral lobby broadcast) still learn
          // what's playing. If we're first, nobody answers -- harmless.
          relay(roomId, "request_sync", {
            senderId: senderId.current,
            state: null,
            timestamp: Date.now(),
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      channelJoined.current = false;
    };
  }, [roomId, playerRef, trackPeer]);

  // Update this device's authoritative snapshot (called on timeupdate + content select).
  const setLocalState = useCallback(
    (state: {
      tmdbId?: number;
      mediaType?: MediaType;
      season?: number;
      episode?: number;
      title?: string;
      posterPath?: string | null;
      time?: number;
      playing?: boolean;
    }) => {
      latestStateRef.current = { ...latestStateRef.current, ...state };
    },
    []
  );

  // Ask the room for the current authoritative state (used after a player
  // loads, so a late joiner is snapped to the live timestamp, not a stale one).
  const requestSync = useCallback(() => {
    relay(roomId, "request_sync", {
      senderId: senderId.current,
      state: null,
      timestamp: Date.now(),
    });
  }, [roomId]);

  // Emit a lightweight heartbeat so peers can auto-correct drift while playing.
  const broadcastHeartbeat = useCallback(
    (time: number, playing: boolean) => {
      const ch = channelRef.current;
      const payload = {
        senderId: senderId.current,
        time,
        playing,
        timestamp: Date.now(),
      };
      if (ch && channelJoined.current) {
        ch.send({ type: "broadcast", event: "heartbeat", payload }).catch(() => {});
      } else {
        relay(roomId, "heartbeat", payload);
      }
    },
    [roomId]
  );

  return {
    isSynced,
    joinSync,
    requestSync,
    broadcastSync,
    broadcastLobby,
    broadcastHeartbeat,
    setLocalState,
    lobbyContent,
    peerCount,
    senderId: senderIdValue,
  };
}