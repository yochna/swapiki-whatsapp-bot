-- Recruiter Verification v1 — two-way trust.
-- Candidates can trust who's contacting them only if recruiters are provable.
-- Flow: recruiter submits a company email -> status becomes 'pending' ->
-- an admin reviews and sets 'verified' or 'rejected'.
-- Statuses: unverified | pending | verified | rejected
-- (The full company-email domain confirmation OTP is a later step; v1 is
--  domain + admin review, which prevents the "gmail.com = recruiter" fraud worst case.)

alter table public.recruiters
  add column if not exists work_email text,
  add column if not exists verification_status text default 'unverified',
  add column if not exists verification_domain text,
  
  add column if not exists verified_at timestamptz;

alter table public.recruiters
  drop constraint if exists recruiters_verification_status_check;
alter table public.recruiters
  add constraint recruiters_verification_status_check
  check (verification_status in ('unverified', 'pending', 'verified', 'rejected'));

-- Admins can update any recruiter row (approve / reject / revoke verification).
-- Mirrors the existing "Admins can view/delete all recruiters" policies and the
-- admin-check pattern used across this project (feedback table RLS).
drop policy if exists "Admins can update any recruiter" on public.recruiters;
create policy "Admins can update any recruiter"
  on public.recruiters for update
  to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));