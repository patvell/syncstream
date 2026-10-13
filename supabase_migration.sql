-- SyncStream Database Migration
-- Run this in your Supabase SQL Editor

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.watch_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id TEXT NOT NULL,
    tmdb_id INT NOT NULL,
    media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
    season INT DEFAULT 1,
    episode INT DEFAULT 1,
    progress_seconds INT NOT NULL DEFAULT 0,
    duration_seconds INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_user_media UNIQUE (device_id, tmdb_id, season, episode)
);

CREATE TABLE IF NOT EXISTS public.active_rooms (
    room_id TEXT PRIMARY KEY,
    tmdb_id INT NOT NULL,
    media_type TEXT NOT NULL DEFAULT 'movie',
    season INT DEFAULT 1,
    episode INT DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_watch_progress_updated 
ON public.watch_progress(updated_at DESC);