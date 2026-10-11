-- "What did you actually do" answers for each GitHub repo, per candidate.
--
-- The interview-prep GitHub picker asks five short questions about the repo a
-- candidate picks (the problem, what they personally owned, the stack, the
-- hardest part, the measurable result). Those answers are the highest-value
-- text a candidate types anywhere in the product, and they are what turn a
-- generic pitch into a real interview answer. They used to live only in the
-- browser, which meant clearing site data or switching laptop silently threw
-- them away, so this table makes the "fill it in once and every answer uses it"
-- promise actually true.
--
-- Written by js/store.js (fetchRepoNotes / saveRepoNote / deleteRepoNote).
-- Until this migration is run the app keeps working: it stores notes on the
-- device and quietly skips the cloud, rather than breaking the form.
--
-- RLS: a candidate may only ever touch their OWN rows. No cross-user reads,
-- and no anon access - this text is personal and should never be public.

create table if not exists public.repo_notes (
  user_id uuid not null references auth.users(id) on delete cascade,
  repo_name text not null check (length(repo_name) between 1 and 100),
  notes jsonb not null default '{}'::jsonb check (jsonb_typeof(notes) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (user_id, repo_name)
);

comment on table public.repo_notes is
  'Per-repo "what the candidate actually did" answers (problem, role, stack, hardest, result), keyed by candidate + GitHub repo name. Feeds the 60-second pitch and the interview model answer.';

-- One row per repo is the only sensible shape: the candidate either filled this
-- repo in or they did not, and re-saving replaces the whole object.
create index if not exists repo_notes_user_idx on public.repo_notes (user_id);

alter table public.repo_notes enable row level security;

drop policy if exists "Candidates read their own repo notes" on public.repo_notes;
create policy "Candidates read their own repo notes"
  on public.repo_notes
  for select
  using (auth.uid() = user_id);

drop policy if exists "Candidates add their own repo notes" on public.repo_notes;
create policy "Candidates add their own repo notes"
  on public.repo_notes
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Candidates update their own repo notes" on public.repo_notes;
create policy "Candidates update their own repo notes"
  on public.repo_notes
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Candidates delete their own repo notes" on public.repo_notes;
create policy "Candidates delete their own repo notes"
  on public.repo_notes
  for delete
  using (auth.uid() = user_id);
