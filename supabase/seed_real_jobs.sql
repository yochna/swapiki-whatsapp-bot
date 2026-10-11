-- Real, live Bengaluru openings with direct apply links (ATS pages), curated
-- from Bengaluru Brief #32. Safe to re-run (idempotent by title + company).
-- Run AFTER jobs_board_migration.sql. Source newsletter:
--   https://bengaluru-brief.beehiiv.com/p/32-38-ops-talent-jobs-open-in-bengaluru-right-now
--
-- The two fictional sample jobs from seed_sample_jobs.sql are moved to draft
-- so the board shows only real, verifiable openings.

-- Retire the fictional sample placeholders (keep them visible in admin queue):
update public.jobs
   set status = 'draft'
 where title in ('React Frontend Developer', 'Credit Analyst - BFSI');

-- Seed real openings (category 'any' = Ops & Talent tab):
insert into public.jobs
  (title, company, location, category, salary, contact, source, skills, status, raw_text, description)
select v.title, v.company, v.location, v.category, v.salary, v.contact, 'direct-post', v.skills, 'published', v.raw_text, v.description
from (
  values
    (
      'People Partner',
      'Atomicwork',
      'Bengaluru (Onsite)',
      'any',
      null,
      'https://job-boards.greenhouse.io/atomicwork/jobs/4458602008',
      array['People Ops', 'Employee Relations', 'HR Programs'],
      'People Partner - Atomicwork
Team: People
Location: Bengaluru
Apply: greenhouse.io/atomicwork',
      'Partner with a team at Atomicwork (workplace automation SaaS).'
    ),
    (
      'Payroll and HR Operations Specialist',
      'Emergent',
      'Bengaluru (Onsite)',
      'any',
      null,
      'https://job-boards.greenhouse.io/emergentlabsinc/jobs/4383260009',
      array['Payroll', 'HR Operations', 'Compliance'],
      'Payroll and HR Operations Specialist - Emergent
Team: HR Operations
Location: Bengaluru
Apply: greenhouse.io/emergentlabsinc',
      'Own payroll and HR ops at Emergent.'
    ),
    (
      'Talent Acquisition Manager',
      'Hevo Data',
      'Bengaluru (Hybrid)',
      'any',
      null,
      'https://jobs.lever.co/hevodata/e927d9dc-e132-43fb-a58e-c4206e824a28',
      array['Talent Acquisition', 'Stakeholder Management', 'Recruiting'],
      'Talent Acquisition Manager - Hevo Data
Team: Talent
Location: Bengaluru
Apply: jobs.lever.co/hevodata',
      'Lead hiring for Hevo Data.'
    ),
    (
      'Senior Talent Partner (Non-Tech Hiring)',
      'Meesho',
      'Bengaluru (Onsite)',
      'any',
      null,
      'https://jobs.lever.co/meesho/1690adaa-ec47-4246-a40e-995b859545f2',
      array['Talent Acquisition', 'Non-Tech Hiring', 'Volume Hiring'],
      'Senior Talent Partner (Non-Tech Hiring) - Meesho
Team: Talent
Location: Bengaluru
Apply: jobs.lever.co/meesho',
      'Non-tech hiring partner at Meesho.'
    ),
    (
      'Manager/Lead - HRBP',
      'Digantara',
      'Bengaluru (Onsite)',
      'any',
      null,
      'https://careers.kula.ai/digantara/50666',
      array['HRBP', 'People Management', 'Employee Relations'],
      'Manager/Lead - HRBP - Digantara
Team: People
Location: Bengaluru
Apply: careers.kula.ai/digantara',
      'HR business partner lead at Digantara (space-tech).'
    ),
    (
      'HRBP - Non Tech',
      'Plum',
      'Bengaluru (Hybrid)',
      'any',
      null,
      'https://careers.kula.ai/plumhq/54625',
      array['HRBP', 'Business Partnering', 'Org Development'],
      'HRBP - Non Tech - Plum
Team: People
Location: Bengaluru
Apply: careers.kula.ai/plumhq',
      'HR business partner for non-tech teams at Plum.'
    ),
    (
      'Associate - Trust & Safety (Kannada)',
      'LokalApps',
      'Bengaluru (Onsite)',
      'any',
      null,
      'https://apply.workable.com/j/D0E451B02F',
      array['Trust & Safety', 'Kannada', 'Content Moderation'],
      'Associate - Trust & Safety (Kannada) - LokalApps
Team: Trust & Safety
Language: Kannada
Location: Bengaluru
Apply: workable.com/j/D0E451B02F',
      'Trust & safety associate for LokalApps (Kannada-language market).'
    ),
    (
      'Payroll Specialist (APAC)',
      'Multiplier',
      'Bengaluru (Hybrid)',
      'any',
      null,
      'https://careers.kula.ai/usemultiplier/24246',
      array['Payroll', 'APAC', 'Global EOR'],
      'Payroll Specialist (APAC) - Multiplier
Team: Payroll
Region: APAC
Location: Bengaluru
Apply: careers.kula.ai/usemultiplier',
      'Run APAC payroll at Multiplier (global EOR).'
    ),
    (
      'Payroll Manager',
      'slice',
      'Bengaluru (Onsite)',
      'any',
      null,
      'https://careers.kula.ai/slice/50624',
      array['Payroll', 'Process Excellence', 'Statutory Compliance'],
      'Payroll Manager - slice
Team: Payroll
Location: Bengaluru
Apply: careers.kula.ai/slice',
      'Own payroll end-to-end at slice.'
    ),
    (
      'CX Product Operations Analyst',
      'Ethos Life',
      'Bengaluru (Onsite)',
      'any',
      null,
      'https://job-boards.greenhouse.io/ethoslife/jobs/8737402002',
      array['Product Ops', 'Data Analysis', 'CX'],
      'CX Product Operations Analyst - Ethos
Team: Product Ops
Location: Bengaluru
Apply: greenhouse.io/ethoslife',
      'Analyst for CX/product operations at Ethos (insurtech).'
    ),
    (
      'Product Ops - LMS (Assistant Manager)',
      'Paytm',
      'Bengaluru (Onsite)',
      'any',
      null,
      'https://jobs.lever.co/paytm/a8a0e9eb-2838-466e-a60f-19f3cff63541',
      array['Product Ops', 'LMS', 'Program Management'],
      'Product Ops - LMS (Assistant Manager) - Paytm
Team: Product Ops
Location: Bengaluru
Apply: jobs.lever.co/paytm',
      'Drive LMS product operations at Paytm.'
    ),
    (
      'Strategy & Ops (Founder''s Office)',
      'Hevo Data',
      'Bengaluru (Hybrid)',
      'any',
      null,
      'https://jobs.lever.co/hevodata/8d0ee4a7-1ecb-4129-af6b-14abc69b84e5',
      array['BizOps', 'Strategy', 'Analytics'],
      'Strategy & Ops (Founder''s Office) - Hevo Data
Team: Founder''s Office
Location: Bengaluru
Apply: jobs.lever.co/hevodata',
      'Cross-functional strategy and ops at Hevo Data.'
    )
) as v (title, company, location, category, salary, contact, skills, raw_text, description)
where not exists (
  select 1 from public.jobs j
  where j.title = v.title and j.company = v.company
);

-- Verify what will be visible to a qualified candidate (All tab): 
select title, company, category, status
from public.jobs
order by created_at desc;