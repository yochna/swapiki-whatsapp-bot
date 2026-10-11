-- Sample published jobs so the Jobs board has content to show.
-- Run AFTER jobs_board_migration.sql. Safe to re-run (idempotent by title).
-- Delete individual jobs anytime from Admin -> Jobs Board.

insert into public.jobs
  (title, company, location, category, salary, contact, source, skills, status, raw_text, description)
values
  (
    'React Frontend Developer',
    'CloudShelf Tech Pvt. Ltd.',
    'Bengaluru (Hybrid)',
    'it',
    '4-6 LPA',
    'hr@cloudshelf.tech',
    'whatsapp-forward',
    array['React', 'TypeScript', 'Tailwind CSS'],
    'published',
    'URGENT HIRING - React Developer
Company: CloudShelf Tech
Location: Bengaluru (hybrid, 3 days office)
Exp: 2-4 yrs
Skills: React, TypeScript, Tailwind
Salary: 4-6 LPA
Immediate joiners preferred.
Send resume to hr@cloudshelf.tech',
    'Build and maintain our customer-facing dashboard. Immediate joiners preferred.'
  ),
  (
    'Credit Analyst - BFSI',
    'Meridian Capital Finance',
    'Mumbai (Onsite)',
    'bfsi',
    '5-7 LPA',
    'careers@meridian-finance.co',
    'whatsapp-forward',
    array['Financial Analysis', 'Excel', 'Credit Appraisal'],
    'published',
    'Credit Analyst opening - Mumbai
Role: Credit Analyst (2-4 yrs)
Domain: SME lending
Must know: financial statements, ratio analysis, Excel models
CTC: 5-7 LPA
Walk-in interviews this week.
Contact: careers@meridian-finance.co',
    'Underwrite SME loan proposals and prepare credit appraisal memos.'
  ),
  (
    'QA Automation Engineer',
    'DevForge Software',
    'Remote (India)',
    'it',
    '6-8 LPA',
    'jobs@devforge.dev',
    'direct-post',
    array['Selenium', 'Playwright', 'JavaScript', 'Postman'],
    'draft',
    'QA Engineer - remote (India)
Skills: Selenium, Playwright, JavaScript, Postman
CTC: 6-8 LPA
Automate web + API suites for fintech clients.',
    'Automate web + API test suites for our fintech clients. 5+ yrs ideal, 3+ minimum.'
  )
on conflict do nothing;

-- Verify what will be visible to a qualified candidate:
select title, company, category, status
from public.jobs
order by created_at;