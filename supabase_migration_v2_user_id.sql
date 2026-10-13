-- SyncStream Migration v2: Switch watch_progress from device_id to user_id
-- Run this in your Supabase SQL Editor AFTER running the original migration.

-- 1. Add the user_id column (nullable to migrate old rows)
ALTER TABLE public.watch_progress
  ADD COLUMN IF NOT EXISTS user_id TEXT;

-- 2. Derive a placeholder for existing rows (requires APP_PIN shared in codebase)
--    For safety, backfill existing rows with their own device_id -- the app
--    will re-sync them under the correct user_id on next playback.
UPDATE public.watch_progress
  SET user_id = COALESCE(user_id, device_id)
  WHERE user_id IS NULL;

-- 3. Drop the old unique constraint (device_id, tmdb_id, season, episode)
ALTER TABLE public.watch_progress
  DROP CONSTRAINT IF EXISTS unique_user_media;

-- 4. Add the new unique constraint on user_id
ALTER TABLE public.watch_progress
  ADD CONSTRAINT unique_user_media UNIQUE (user_id, tmdb_id, season, episode);

-- 5. Drop the old device_id column
ALTER TABLE public.watch_progress
  DROP COLUMN IF EXISTS device_id;

-- 6. Recreate the index on updated_at
CREATE INDEX IF NOT EXISTS idx_watch_progress_updated 
ON public.watch_progress(updated_at DESC);