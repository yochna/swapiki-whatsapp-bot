-- More real openings in other roles (marketing, content, design, sales,
-- customer support) across India — full-time jobs AND internships — from
-- Internshala detail pages (verified at seed time: apply-by dates after
-- 2026-09-26). Category 'any' = the "Other Roles" tab (alongside the
-- Bengaluru ops/talent batch). Safe to re-run (idempotent by title + company).

insert into public.jobs
  (title, company, location, category, salary, contact, source, skills, status, raw_text, description)
select v.title, v.company, v.location, v.category, v.salary, v.contact, 'direct-post', v.skills, 'published', v.raw_text, v.description
from (
  values
    -- ---------- Jobs (full-time) ----------
    (
      'Content & E-commerce Management Trainee (Fresher)',
      'Intelloworks',
      'Jaipur (Onsite)',
      'any',
      '₹2,00,000 /year',
      'https://internshala.com/job/detail/fresher-content-e-commerce-management-trainee-job-in-jaipur-at-intelloworks1788520140',
      array['Digital Marketing', 'E-commerce', 'Order Management', 'MS-Excel'],
      'Content & E-commerce Management Trainee - Intelloworks
Source: Internshala (Job, fresher)
CTC: ₹2.0 LPA
Apply by: 4 Oct 2026',
      'E-commerce operations and content for an AI-led digital marketing agency. Jaipur. Apply on Internshala.'
    ),
    (
      'Digital Marketing Executive',
      'K2 Interiors',
      'Jaipur (Onsite)',
      'any',
      '₹2,30,000 - 3,00,000 /year',
      'https://internshala.com/job/detail/digital-marketing-executive-job-in-jaipur-at-k2-interiors1788356913',
      array['Digital Marketing', 'Social Media Marketing', 'Instagram Marketing', 'Content'],
      'Digital Marketing Executive - K2 Interiors
Source: Internshala (Job, 1+ yr)
CTC: ₹2.3 - 3.0 LPA
Apply by: 2 Oct 2026',
      'Social media, content and client coordination for an interiors brand. Jaipur. Apply on Internshala.'
    ),
    (
      'Customer Support And Marketing Manager (Work From Home)',
      'UpcharHub',
      'Remote (India)',
      'any',
      '₹2,00,000 - 2,50,000 /year',
      'https://internshala.com/job/detail/remote-customer-support-and-marketing-manager-job-at-upcharhub1789868262',
      array['Customer Support', 'Instagram Marketing', 'Canva', 'Hindi', 'English'],
      'Customer Support And Marketing Manager (WFH) - UpcharHub
Source: Internshala (Job, 1+ yr)
CTC: ₹2.0 - 2.5 LPA
Apply by: 20 Oct 2026',
      'Content, outreach and support for a health-tech company. Remote (English + Hindi). Apply on Internshala.'
    ),
    (
      'Sales Trainee (Fresher, Part Time, Work From Home)',
      'Anand Pasodi',
      'Remote (India)',
      'any',
      '₹2,05,000 - 2,60,000 /year',
      'https://internshala.com/job/detail/fresher-remote-part-time-sales-trainee-job-at-anand-pasodi1788182641',
      array['Sales', 'WhatsApp', 'Digital Marketing', 'MS-Excel'],
      'Sales Trainee (Fresher, PT, WFH) - Anand Pasodi
Source: Internshala (Job, fresher)
CTC: ₹2.05 - 2.6 LPA
Apply by: 30 Sep 2026',
      'Convert leads into trek/trip bookings across WhatsApp, calls and Instagram. Remote, part-time. Apply on Internshala.'
    ),

    -- ---------- Internships ----------
    (
      'Content Creator - Graphic Design & Video Editing Intern',
      'Digital Brand Co-pilot',
      'Remote (India)',
      'any',
      '₹15,000 - 35,000 /month (internship)',
      'https://internshala.com/internship/detail/work-from-home-content-creator-graphic-design-video-editing-internship-at-digital-brand-co-pilot1789971897',
      array['Canva', 'Photoshop', 'Premiere Pro', 'After Effects', 'Video Editing', 'Graphic Design'],
      'Content Creator - Graphic Design & Video Editing Intern - Digital Brand Co-pilot
Source: Internshala (WFH)
Stipend: ₹15,000 - 35,000/month
Duration: 6 months
Apply by: 21 Oct 2026',
      'Design and edit content across platforms for a 360-degree digital agency. Remote. Apply on Internshala.'
    ),
    (
      'Content and Social Media Marketing Intern (Part Time, Work From Home)',
      'Ohhmydesign',
      'Remote (India)',
      'any',
      '₹10,000 - 12,000 /month (internship)',
      'https://internshala.com/internship/detail/work-from-home-part-time-content-and-social-media-marketing-internship-at-ohhmydesign1789734005',
      array['Social Media Marketing', 'Copywriting', 'Canva', 'LinkedIn'],
      'Content and Social Media Marketing Intern (PT, WFH) - Ohhmydesign
Source: Internshala (WFH)
Stipend: ₹10,000 - 12,000/month
Duration: 3 months
Apply by: 18 Oct 2026',
      'LinkedIn content for a design/dev studio serving SaaS and AI startups. Remote, part-time. Apply on Internshala.'
    ),
    (
      'Content and Social Media Marketing Intern',
      'DigitalVishesh',
      'Remote (India)',
      'any',
      '₹6,000 - 10,000 /month (internship)',
      'https://internshala.com/internship/detail/work-from-home-content-and-social-media-marketing-internship-at-digitalvishesh1788266851',
      array['Content Writing', 'Digital Marketing', 'WordPress', 'Reddit'],
      'Content and Social Media Marketing Intern - DigitalVishesh
Source: Internshala (WFH)
Stipend: ₹6,000 - 10,000/month
Duration: 3 months
Apply by: 1 Oct 2026',
      'Educational content, SEO and Reddit community building for a digital marketing firm. Remote. Apply on Internshala.'
    ),
    (
      'Content and Social Media Marketing Intern',
      'Your Temp Abode',
      'Remote (India)',
      'any',
      '₹4,000 - 5,000 /month (internship)',
      'https://internshala.com/internship/detail/work-from-home-content-and-social-media-marketing-internship-at-your-temp-abode1789569146',
      array['Canva', 'Content Writing', 'Social Media Marketing', 'Video Editing'],
      'Content and Social Media Marketing Intern - Your Temp Abode
Source: Internshala (WFH)
Stipend: ₹4,000 - 5,000/month
Duration: 6 months
Apply by: 16 Oct 2026',
      'Travel content, Canva carousels and reels for a travel brand. Remote. Apply on Internshala.'
    ),
    (
      'Content & Social Media Marketing Specialist Intern (Travel Startup)',
      'Trav',
      'Remote (India)',
      'any',
      '₹12,000 - 20,000 /month (internship)',
      'https://internshala.com/internship/detail/work-from-home-part-time-content-social-media-marketing-specialist-wfh-part-time-travel-startup-internship-at-trav1789898342',
      array['Video Editing', 'Canva', 'Content Marketing', 'Social Media Marketing', 'Graphic Design'],
      'Content & Social Media Marketing Specialist (Travel) Intern - Trav
Source: Internshala (WFH)
Stipend: ₹12,000 - 20,000/month
Duration: 4 months
Apply by: 20 Oct 2026',
      'Script, edit and design high-retention reels/shorts for a creator-powered travel startup. Remote. Apply on Internshala.'
    )
) as v (title, company, location, category, salary, contact, skills, raw_text, description)
where not exists (
  select 1 from public.jobs j
  where j.title = v.title and j.company = v.company
);

-- Verify tab coverage:
select
  count(*) filter (where category = 'it' and status = 'published')   as it_published,
  count(*) filter (where category = 'bfsi' and status = 'published') as bfsi_published,
  count(*) filter (where category = 'any' and status = 'published')  as other_published,
  count(*) filter (where status = 'published')                       as total_published
from public.jobs;