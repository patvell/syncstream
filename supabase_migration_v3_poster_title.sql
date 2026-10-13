-- SyncStream Migration v3: Add denormalized poster/title columns for resume cards
-- Run AFTER migration v2.

ALTER TABLE public.watch_progress
  ADD COLUMN IF NOT EXISTS poster_path TEXT;

ALTER TABLE public.watch_progress
  ADD COLUMN IF NOT EXISTS title TEXT;