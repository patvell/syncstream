-- SyncStream Migration v4: Enable anon read/write on watch_progress & active_rooms
-- Run AFTER migrations v1-v3.
--
-- SECURITY NOTE: SyncStream uses a shared PIN (not Supabase Auth), so there is
-- no per-user supabase auth.uid(). We therefore grant the anon role access to
-- the tables. Queries are already scoped by user_id (derived from the PIN
-- session cookie) in the app code. If you later add per-user auth, replace
-- these policies with auth.uid()-based ones.

-- 1) Ensure RLS is enabled
ALTER TABLE public.watch_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_rooms   ENABLE ROW LEVEL SECURITY;

-- 2) watch_progress: allow anon to read/write
DROP POLICY IF EXISTS "anon_select_watch_progress" ON public.watch_progress;
CREATE POLICY "anon_select_watch_progress"
  ON public.watch_progress FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "anon_insert_watch_progress" ON public.watch_progress;
CREATE POLICY "anon_insert_watch_progress"
  ON public.watch_progress FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_watch_progress" ON public.watch_progress;
CREATE POLICY "anon_update_watch_progress"
  ON public.watch_progress FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_watch_progress" ON public.watch_progress;
CREATE POLICY "anon_delete_watch_progress"
  ON public.watch_progress FOR DELETE
  TO anon
  USING (true);

-- 3) active_rooms: allow anon to read/write (used for room roster/metadata)
DROP POLICY IF EXISTS "anon_all_active_rooms" ON public.active_rooms;
CREATE POLICY "anon_all_active_rooms"
  ON public.active_rooms FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- Note: Realtime Broadcast (used for live sync) does NOT require these
-- policies -- it is enabled project-wide and not table-gated.
