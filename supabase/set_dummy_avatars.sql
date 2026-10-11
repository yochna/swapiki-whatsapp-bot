-- =============================================================================
-- Swapiki — point dummy profiles at their generated avatars
-- Run this in Supabase Dashboard > SQL Editor AFTER seed_dummy_profiles.sql
-- (and again after generating/regenerating avatars).
--
-- Avatars live at photos/dummy/<candidate-id>.svg and DEPLOY WITH the Pages
-- site, so the files must exist in the repo AND the site must be re-deployed
-- once for the images to be served. This only updates rows that don't already
-- have an avatar (idempotent).
-- =============================================================================

update public.candidates
set avatar = '/photos/dummy/' || id || '.svg'
where is_dummy = true
  and coalesce(avatar, '') = '';

-- Spot-check the first 10.
select id, name, avatar
from public.candidates
where is_dummy = true
order by id
limit 10;