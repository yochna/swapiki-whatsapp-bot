-- -----------------------------------------------------------------------------
-- Swapiki — Swaniki's own openings, pinned to the top of the board.
--
--   Applies to: swapiki-test, then swapiki (prod) Supabase instances.
--   Run in the Supabase SQL editor, AFTER supabase/swaniki_jobs_migration.sql.
--   Idempotent - safe to re-run.
--
-- SOURCE AND FRESHNESS
-- Transcribed from https://swaniki.com/careers on 2026-10-01:
--
--   Frontend Engineer              Full-time   Engineering   Remote
--   Backend Engineer               Full-time   Engineering   Remote
--   Software Development Intern    Internship  Engineering   Remote
--   Marketing & Design Intern      Internship  Marketing     Remote
--
-- This is a transcription, not a scraper. The careers page is the studio's own
-- marketing site; nothing here polls it, so a role closed or rewritten there is
-- still here until someone edits this file and re-runs it. That is deliberate -
-- a parse of that page would break on any redesign and would quietly republish
-- whatever it managed to read. The listing that matters is the truth on
-- swaniki.com/careers, and this file is the place to correct it.
--
-- They are inserted as published, skipping the review queue: they are the
-- studio's own openings, already cross-checked against its own public page, and
-- the reviewer they would be waiting for works here.
--
-- TO EDIT OR RETIRE A ROLE
-- This file is the whole source of truth for the pin, in both directions:
--
--   Add a line     -> the role is inserted, published and pinned.
--   Edit a line    -> the wording is refreshed; the id survives, so anything that
--                     ever recorded a click on the row still points at it.
--   Delete a line  -> the role is retired: draft, and unpinned.
--
-- The update deliberately does NOT touch `status` or `featured` on a role that is
-- still listed. A re-run after an admin has unpublished or unpinned a filled role
-- must not undo that decision on its way past - so removing a line is how a role
-- is retired, and the admin row stays authoritative until then.
--
-- Nothing is ever deleted here. Retire the wrong role and the row is still there,
-- one update away from being right.
--
-- `featured = true` is what pins them above the feed: the board, the weekly
-- digest and the nudge emails all read that one column.
--
-- `skills` uses the fixed vocabulary in functions/lib/adzuna.js. A skill outside
-- that list matches nothing, so a candidate's expertise can never line up with it
-- and the digest email's skill re-ranking would treat every one of these as a
-- zero-overlap match.
-- -----------------------------------------------------------------------------

with roles (title, location, category, salary, apply_url, skills, raw_text, description) as (
  values
    (
      'Frontend Engineer',
      'Remote (India)',
      'it',
      null::text,
      'https://swaniki.com/careers',
      array['react', 'next.js', 'typescript', 'css', 'javascript'],
      'Frontend Engineer - Swaniki
Team: Engineering
Location: Remote
Type: Full-time
Apply: swaniki.com/careers',
      'Build fast, polished, production-grade interfaces for Swaniki''s SaaS products and client web platforms using React and Next.js. Solid experience with React, Next.js and TypeScript. Comfort with Tailwind CSS or similar utility-first styling. Eye for detail and a bias toward clean, maintainable code.'
    ),
    (
      'Backend Engineer',
      'Remote (India)',
      'it',
      null::text,
      'https://swaniki.com/careers',
      array['node.js', 'sql', 'nosql', 'rest api', 'microservices'],
      'Backend Engineer - Swaniki
Team: Engineering
Location: Remote
Type: Full-time
Apply: swaniki.com/careers',
      'Design and build scalable APIs, automation pipelines and multi-tenant architectures that power Swaniki''s products and client solutions. Strong experience with Node.js or a similar backend stack. Working knowledge of SQL/NoSQL databases and cloud deployment. Understanding of API design, authentication and security basics.'
    ),
    (
      'Software Development Intern',
      'Remote (India)',
      'it',
      null::text,
      'https://swaniki.com/careers',
      array['javascript', 'typescript', 'html', 'css'],
      'Software Development Intern - Swaniki
Team: Engineering
Location: Remote
Type: Internship
Apply: swaniki.com/careers',
      'Work alongside our engineering team on real product features, automations and client projects while learning production-grade software practices. Basic knowledge of JavaScript/TypeScript, HTML and CSS. Currently pursuing or recently completed a degree in CS or a related field. Curiosity, willingness to learn, and consistent availability.'
    ),
    (
      'Marketing & Design Intern',
      'Remote (India)',
      'any',
      null::text,
      'https://swaniki.com/careers',
      array['figma'],
      'Marketing & Design Intern - Swaniki
Team: Marketing
Location: Remote
Type: Internship
Apply: swaniki.com/careers',
      'Support Swaniki''s brand, content and design efforts - from social content to landing page visuals - across our products and client campaigns. Basic proficiency with a design tool such as Figma or Canva. Strong writing and visual sense. Interest in startups, SaaS and digital marketing.'
    )
),

-- 1. Refresh every role that is still listed.
--
-- The id is left alone on purpose: delete-then-insert would mint a new one and
-- orphan anything that ever recorded a click on the row. `status` and `featured`
-- are left alone too, so re-running this after an admin has unpublished or
-- unpinned a role does not quietly put it back.
refreshed as (
  update public.jobs j
     set location    = r.location,
         category    = r.category,
         salary      = r.salary,
         contact     = r.apply_url,
         apply_url   = r.apply_url,
         skills      = r.skills,
         raw_text    = r.raw_text,
         description = r.description,
         source      = 'swaniki',
         updated_at  = now()
    from roles r
   where j.title = r.title
     and j.company = 'Swaniki'
     and j.status <> 'rejected'
  returning 1
),

-- 2. Retire every Swaniki role that is no longer in the list.
--
-- This is the half that matters. A role that was filled and then forgotten in
-- this file would otherwise stay published and stay pinned, sitting at the top
-- of the board and at the top of both emails, reading as an opening the studio is
-- still trying to fill. Removing the line and re-running retires it.
--
-- Draft, not deleted, and unpinned rather than rejected: a retired role is not a
-- bad role, and both moves are reversible from the admin.
retired as (
  update public.jobs j
     set featured   = false,
         status     = 'draft',
         updated_at = now()
   where j.company = 'Swaniki'
     and j.source  = 'swaniki'
     and j.status  <> 'rejected'
     and not exists (select 1 from roles r where r.title = j.title)
  returning 1
)

-- 3. Add the roles that are not here yet, published and pinned.
insert into public.jobs
  (title, company, location, category, salary, contact, apply_url, source, skills, status, featured, raw_text, description)
select
  r.title, 'Swaniki', r.location, r.category, r.salary, r.apply_url, r.apply_url,
  'swaniki', r.skills, 'published', true, r.raw_text, r.description
  from roles r
 where not exists (
   select 1 from public.jobs j
   where j.title = r.title and j.company = 'Swaniki'
 );

-- What the board will now lead with, in the order it will lead with.
select title, company, location, category, featured, status
from public.jobs
where status = 'published'
order by featured desc, created_at desc, id asc
limit 10;
